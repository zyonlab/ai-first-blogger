import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import TurndownService from 'turndown';
import { categoryMap, fallbackCategory, hasMigrationConfig, MIGRATION_FILE } from './category-map';
import { slugMap } from './slug-map';
import { site } from 'aifb-engine/config/site';
import { isCategory, isSeries, categorySlugs } from 'aifb-engine/config/taxonomy';

type GhostTag = {
  id?: string;
  name?: string;
  slug?: string;
  description?: string | null;
  /** Ghost's tags carry the same metadata columns as posts_meta. */
  feature_image?: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
  og_title?: string | null;
  og_description?: string | null;
  og_image?: string | null;
  twitter_title?: string | null;
  twitter_description?: string | null;
  twitter_image?: string | null;
  accent_color?: string | null;
  /** `internal` is Ghost's `#hash` tag — hidden from the front end by design. */
  visibility?: string;
};

/** A row of `posts_meta`: every per-entry SEO override Ghost holds. */
type GhostPostMeta = {
  id?: string;
  post_id?: string;
  meta_title?: string | null;
  meta_description?: string | null;
  og_title?: string | null;
  og_description?: string | null;
  og_image?: string | null;
  twitter_title?: string | null;
  twitter_description?: string | null;
  twitter_image?: string | null;
  feature_image_alt?: string | null;
  feature_image_caption?: string | null;
};

/** A row of `users`, Ghost's staff table. Only the name reaches a page. */
type GhostUser = { id?: string; name?: string; slug?: string };

/** A row of `settings`: flat key/value, grouped. `site` is the group that matters. */
type GhostSetting = { group?: string; key?: string; value?: string | null };

type GhostPost = {
  id?: string;
  title?: string;
  slug?: string;
  status?: string;
  /** `post` or `page`. Ghost keeps both in one table. */
  type?: string;
  html?: string;
  custom_excerpt?: string;
  excerpt?: string;
  featured?: boolean;
  canonical_url?: string;
  published_at?: string;
  updated_at?: string;
  feature_image?: string;
  /** Present in a Content API response; never in an admin export. */
  tags?: GhostTag[];
};

const root = process.cwd();
const exportPath = path.join(root, 'migration/ghost-export.json');
const imageInput = path.join(root, 'migration/images');
const imageOutput = path.join(root, 'public/content/images');
const postsOutput = path.join(root, 'content/posts');
const reportPath = path.join(root, 'migration/report.md');
const legacyContentDomain = process.env.LEGACY_CONTENT_DOMAIN ?? 'https://example.com';
const legacyContentOrigin = legacyContentDomain.replace(/\/$/, '');
const domainImagePattern = new RegExp(`^${legacyContentOrigin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/content/images/`, 'i');
const localImagePattern = /(?:src|href)=["']([^"']*\/content\/images\/[^"']+)["']/g;

function cleanDescription(post: GhostPost, meta: GhostPostMeta) {
  const description =
    post.custom_excerpt || post.excerpt || meta.meta_description || post.title || 'Migrated Ghost post.';
  return description.replace(/\s+/g, ' ').trim().slice(0, 260);
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function uniqueSlug(base: string, used: Set<string>) {
  let slug = base || 'untitled';
  let index = 2;
  while (used.has(slug)) {
    slug = `${base}-${index}`;
    index += 1;
  }
  used.add(slug);
  return slug;
}

/**
 * A Ghost image URL, rewritten to the local path — and tolerant of `null`.
 *
 * The guard used to be a default parameter, which only fires for `undefined`.
 * Ghost writes `"feature_image": null` for any post without one, so the first
 * such post crashed the run on `null.startsWith`. Every other call site had
 * grown a `?? undefined` to compensate and exactly one had not, which is the
 * shape of defect that comes back the next time a nullable Ghost column
 * reaches this function. So the guard belongs inside it.
 *
 * `''` is the right answer rather than `undefined`: the existing empty-key
 * filter drops it, so a post with no feature image gets no `heroImage` key
 * instead of one holding nothing.
 */
function normalizeImageUrl(value?: string | null) {
  if (!value) return '';
  if (domainImagePattern.test(value)) {
    return value.replace(domainImagePattern, '/content/images/');
  }
  const imagePrefix = `${legacyContentOrigin}/content/images/`;
  if (value.startsWith(imagePrefix)) {
    return value.replace(imagePrefix, '/content/images/');
  }
  return value;
}

/**
 * The two shapes Ghost hands you a site in, and why the difference is silent.
 *
 * The **Content API** returns each post with everything already joined onto it:
 *
 *     { title, slug, meta_title, og_title, feature_image_alt,
 *       tags: [{ name, slug }], authors: [{ name }] }
 *
 * The **admin export** — Settings → Migration → Export, which is what anyone
 * actually migrating uses — is a database dump, so none of those joins have
 * happened. Ghost's own exporter allowlist ships six tables side by side:
 *
 *     posts          the article itself
 *     posts_meta     meta_*, og_*, twitter_*, feature_image_alt/caption
 *     tags           name, slug, description, visibility
 *     posts_tags     { post_id, tag_id, sort_order }
 *     users          the staff table — where an author's name is
 *     posts_authors  { post_id, author_id, sort_order }
 *
 * Reading `post.meta_title` or `post.tags` from an admin export finds
 * `undefined` every time, and nothing throws: the migration writes the files,
 * prints a count and reports success, having dropped the site's entire taxonomy
 * and every hand-written SEO override. That is not a hypothetical — it is what
 * this file did until #23, twice, for two different tables.
 *
 * So the join is written once, generically, and used for all three. A fourth
 * sibling table added later gets the same treatment instead of a third bespoke
 * lookup that someone forgets to write.
 */
function exportData(raw: unknown): Record<string, any[]> {
  const data = (raw as any)?.db?.[0]?.data ?? (raw as any)?.data ?? raw ?? {};
  return data as Record<string, any[]>;
}

/**
 * Rows of `table`, grouped by the post they belong to, in `sort_order`.
 *
 * `join` is the linking table and `key` the column naming the row's own id;
 * `posts_meta` links directly by `post_id` and passes no join at all.
 */
function byPost<T extends { id?: string }>(
  data: Record<string, any[]>,
  table: string,
  link?: { join: string; key: string },
): Map<string, T[]> {
  const rows: T[] = Array.isArray(data[table]) ? (data[table] as T[]) : [];
  const out = new Map<string, T[]>();
  const add = (postId: string, row: T) => out.set(postId, [...(out.get(postId) ?? []), row]);

  if (!link) {
    for (const row of rows) {
      const postId = (row as any).post_id;
      if (typeof postId === 'string') add(postId, row);
    }
    return out;
  }

  const byId = new Map(rows.filter((row) => row.id !== undefined).map((row) => [row.id!, row]));
  const joins: Record<string, any>[] = Array.isArray(data[link.join]) ? data[link.join] : [];
  for (const join of [...joins].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))) {
    const row = byId.get(join[link.key]);
    if (row && typeof join.post_id === 'string') add(join.post_id, row);
  }
  return out;
}

const isVisible = (tag: GhostTag) => tag.visibility !== 'internal' && !(tag.name ?? '').startsWith('#');

/**
 * Ghost's `canonical_url`, but only when this engine will accept it.
 *
 * The two products disagree here, and the disagreement is deliberate on both
 * sides. Ghost lets a canonical point anywhere — that is how you say "this was
 * first published on someone else's site", and syndicated posts rely on it.
 * This engine refuses an off-origin canonical outright (`assertSameOrigin`,
 * rule C-07), because the same tag on a post that was *not* syndicated hands
 * that post's ranking to another domain, and the failure is invisible until
 * the traffic is gone.
 *
 * So a cross-origin canonical is reported rather than migrated. Writing it
 * would fail the build on a file the migration itself produced; dropping it
 * silently would lose a deliberate publishing decision. The site decides which
 * it was — the URL is in the report, and both ways out are named there.
 */
function canonicalFor(post: GhostPost, offOrigin: { post: string; url: string }[]) {
  const declared = post.canonical_url?.trim();
  if (!declared) return undefined;
  try {
    if (new URL(declared, site.url).origin === new URL(site.url).origin) return declared;
  } catch {
    // Not a URL at all. Treated as off-origin: the build would reject it too.
  }
  offOrigin.push({ post: post.slug ?? post.title ?? 'untitled', url: declared });
  return undefined;
}

function mapTaxonomy(post: GhostPost, joined: GhostTag[]) {
  // The Content API shape wins when it is there; otherwise the join above.
  const tags = (post.tags ?? joined).filter(isVisible);

  const rawTags = tags
    .flatMap((tag) => [tag.name, tag.slug])
    .filter(Boolean)
    .map((tag) => String(tag).toLowerCase());
  const text = [post.title, post.slug, ...rawTags].filter(Boolean).join(' ').toLowerCase();
  const match = categoryMap.find((item) => item.match.some((keyword) => text.includes(keyword.toLowerCase())));

  return {
    category: match?.category ?? fallbackCategory,
    series: match?.series,
    matched: match !== undefined,
    tags: [...new Set(tags.map((tag) => tag.name || tag.slug).filter(Boolean))],
  };
}

/**
 * The mapping is checked against site/taxonomy.yaml before a single file is
 * written. Migrating first and discovering the categories do not exist means
 * hundreds of files that fail `pnpm build` — cheaper to refuse up front.
 */
function assertMappingIsValid() {
  const problems: string[] = [];

  if (categorySlugs.length === 0) {
    problems.push('site/taxonomy.yaml defines no topics, so there is no category to migrate into.');
  }
  if (!isCategory(fallbackCategory)) {
    problems.push(`fallbackCategory "${fallbackCategory}" is not a category in site/taxonomy.yaml.`);
  }
  categoryMap.forEach((rule, index) => {
    if (!isCategory(rule.category)) {
      problems.push(`rules[${index}].category "${rule.category}" is not in site/taxonomy.yaml.`);
    }
    if (rule.series && !isSeries(rule.series)) {
      problems.push(`rules[${index}].series "${rule.series}" is not in site/taxonomy.yaml.`);
    }
  });

  if (problems.length > 0) {
    console.error(`Migration aborted — ${MIGRATION_FILE} does not match the site taxonomy:`);
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error(`\nValid categories: ${categorySlugs.join(', ')}`);
    console.error(`Fix ${MIGRATION_FILE} (or site/taxonomy.yaml) and run again.`);
    return false;
  }
  return true;
}

function getGhostPosts(raw: unknown): GhostPost[] {
  const data = raw as any;
  const db = data?.db?.[0]?.data;
  return db?.posts ?? data?.posts ?? data?.data?.posts ?? [];
}

async function exists(target: string) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await exists(exportPath))) {
    console.error(`Ghost export not found: ${exportPath}`);
    console.error('Place your export at migration/ghost-export.json, then run pnpm migrate:ghost.');
    process.exitCode = 1;
    return;
  }

  if (!assertMappingIsValid()) {
    process.exitCode = 1;
    return;
  }

  await fs.mkdir(postsOutput, { recursive: true });
  await fs.mkdir(path.dirname(reportPath), { recursive: true });

  if (await exists(imageInput)) {
    await fs.mkdir(imageOutput, { recursive: true });
    await fs.cp(imageInput, imageOutput, { recursive: true });
  }

  const raw = JSON.parse(await fs.readFile(exportPath, 'utf8'));
  const published = getGhostPosts(raw).filter((post) => post.status === 'published');

  /**
   * Ghost keeps pages in the `posts` table, separated only by `type`. Filtering
   * on `status` alone therefore migrates About, Privacy, Uses and Now into
   * `content/posts/` — where they appear in the archive, the feed and the
   * sitemap as articles, and where the gate then reports them as thin content
   * because that is exactly what an About page looks like to an article rule.
   *
   * Skipped and counted rather than converted: the engine has no standalone
   * page yet (ADR 0007 defers it), and a page filed as a post is worse than a
   * page not yet migrated — one is visibly missing, the other is quietly wrong.
   */
  const pages = published.filter((post) => post.type === 'page');
  const posts = published.filter((post) => post.type !== 'page');

  const data = exportData(raw);
  const tagJoin = byPost<GhostTag>(data, 'tags', { join: 'posts_tags', key: 'tag_id' });
  const metaJoin = byPost<GhostPostMeta>(data, 'posts_meta');
  const authorJoin = byPost<GhostUser>(data, 'users', { join: 'posts_authors', key: 'author_id' });
  const usedSlugs = new Set<string>();
  /** Every visible tag that actually reached a migrated file, by name. */
  const migratedTags = new Map<string, GhostTag>();
  /** Canonicals pointing at another domain — see `canonicalFor`. */
  const offOrigin: { post: string; url: string }[] = [];
  const turndown = new TurndownService({
    codeBlockStyle: 'fenced',
    headingStyle: 'atx',
    bulletListMarker: '-',
  });

  const warnings: string[] = [];
  const migrated: string[] = [];
  /**
   * Every URL that changes. A migration that renames slugs and leaves no
   * redirects is a link-loss event nothing else in the pipeline would catch —
   * the new pages are all perfectly valid, and every inbound link to an old
   * address quietly 404s.
   */
  const redirects: { from: string; to: string }[] = [];
  /** Files to write, held until every post has converted. See below. */
  const converted: { file: string; output: string }[] = [];
  let unmapped = 0;

  for (const post of posts) {
    const title = post.title || 'Untitled';
    const baseSlug = slugMap[post.slug ?? ''] ?? post.slug ?? slugify(title);
    const slug = uniqueSlug(slugify(baseSlug), usedSlugs);
    const joinedTags = tagJoin.get(post.id ?? '') ?? [];
    const taxonomy = mapTaxonomy(post, joinedTags);
    // The Content API flattens posts_meta onto the post; an export does not.
    const meta: GhostPostMeta = metaJoin.get(post.id ?? '')?.[0] ?? (post as unknown as GhostPostMeta);
    /**
     * Ghost's primary author, and only when it is not whoever owns this site.
     * `author` defaults to the site owner and is rendered only when stated, so
     * writing the owner's own name into sixty-one files would say what
     * site/site.yaml already says, once per article.
     */
    const primaryAuthor = (authorJoin.get(post.id ?? '') ?? [])[0]?.name;
    const author = primaryAuthor && primaryAuthor !== site.author.name ? primaryAuthor : undefined;
    for (const tag of joinedTags.filter(isVisible)) migratedTags.set(tag.name ?? tag.slug ?? '', tag);
    let html = post.html ?? '';
    html = html.replaceAll(`${legacyContentOrigin}/content/images/`, '/content/images/');

    const localImages = [...html.matchAll(localImagePattern)].map((match) => normalizeImageUrl(match[1]));
    const missingImages = localImages.filter((image) => image.startsWith('/content/images/'));
    if (missingImages.length > 0 && !(await exists(imageInput))) {
      warnings.push(`- ${title}: local image references found but migration/images does not exist.`);
    }

    const body = turndown.turndown(html).replace(/\\\[/g, '[').replace(/\\\]/g, ']');
    const frontmatter = {
      title,
      description: cleanDescription(post, meta),
      slug,
      pubDate: post.published_at ?? new Date().toISOString(),
      updatedDate: post.updated_at,
      draft: false,
      heroImage: normalizeImageUrl(post.feature_image),
      /**
       * The per-entry overrides Ghost already holds. Every one of these existed
       * in the export and had nowhere to land until ADR 0007 — so a migration
       * silently replaced a hand-written search title with the headline, and
       * shipped every hero image without alt text.
       *
       * `meta_title` is dropped when it merely repeats the title, which Ghost
       * does not do but exporters and older themes sometimes did: an override
       * identical to what it overrides is noise in every file that carries it.
       */
      metaTitle: meta.meta_title && meta.meta_title !== title ? meta.meta_title : undefined,
      metaDescription: meta.meta_description ?? undefined,
      ogTitle: meta.og_title ?? undefined,
      ogDescription: meta.og_description ?? undefined,
      ogImage: normalizeImageUrl(meta.og_image ?? undefined),
      twitterTitle: meta.twitter_title ?? undefined,
      twitterDescription: meta.twitter_description ?? undefined,
      twitterImage: normalizeImageUrl(meta.twitter_image ?? undefined),
      heroImageAlt: meta.feature_image_alt ?? undefined,
      heroImageCaption: meta.feature_image_caption ?? undefined,
      featured: post.featured === true ? true : undefined,
      canonical: canonicalFor(post, offOrigin),
      author,
      category: taxonomy.category,
      tags: taxonomy.tags,
      series: taxonomy.series,
      // `author` is omitted on purpose — the content schema defaults it to
      // site.author.name, so migrated posts follow whoever owns the site.
      legacySlug: post.slug,
    };

    if (!taxonomy.matched) unmapped += 1;
    if (post.slug && post.slug !== slug) {
      redirects.push({ from: `/${post.slug}/`, to: `/writing/${slug}/` });
    }

    // js-yaml throws on an undefined value rather than omitting the key, and
    // optional fields (updatedDate, series, heroImage) are undefined for most
    // posts. Drop empty keys instead — the schema treats absent and empty the
    // same way, and the frontmatter stays readable.
    const cleaned = Object.fromEntries(
      Object.entries(frontmatter).filter(([, value]) => value !== undefined && value !== null && value !== ''),
    );

    converted.push({ file: path.join(postsOutput, `${slug}.mdx`), output: matter.stringify(body.trim() + '\n', cleaned) });
    migrated.push(`- ${title} → /writing/${slug}/ (${taxonomy.category}${taxonomy.matched ? '' : ', unmapped'})`);
  }

  /**
   * Written only once every post has converted.
   *
   * The loop used to write each file as it went, so one bad row — a `null`
   * where a string was expected — left the site in a state no command produced
   * deliberately: seven posts out of sixty-four, no report, no redirects, and
   * nothing in the output saying the run was partial. Converting first and
   * writing after makes a failed run leave nothing behind, which is the only
   * outcome a re-run can safely follow.
   */
  for (const item of converted) await fs.writeFile(item.file, item.output);

  if (offOrigin.length > 0) {
    warnings.push(
      `- ${offOrigin.length} post(s) carried a canonical pointing at another domain, which was not migrated: ` +
        `${offOrigin.map((item) => `${item.post} → ${item.url}`).join('; ')}. ` +
        'This engine refuses an off-origin canonical (rule C-07): on a post that was not syndicated it ' +
        "hands that post's ranking to the other domain. If the article really was first published there, " +
        'add `canonical:` back by hand and the build will tell you; if that domain is simply where this ' +
        'site now lives, set PUBLIC_SITE_URL to it instead.',
    );
  }

  if (pages.length > 0) {
    warnings.push(
      `- ${pages.length} Ghost page(s) skipped — ${pages.map((page) => `/${page.slug ?? 'untitled'}/`).join(', ')}. ` +
        'A page migrated into content/posts/ would appear in the archive, the feed and the sitemap as an ' +
        'article, which is why they are skipped rather than converted. Declare each one under `own:` in ' +
        'site/pages.yaml and write its markup as site/templates/pages/<slug>.astro — that keeps the URL ' +
        'Ghost served it at, and keeps the page out of the surfaces an article belongs to.',
    );
  }

  if (!hasMigrationConfig) {
    warnings.push(
      `- No ${MIGRATION_FILE}, so every post was filed under "${fallbackCategory}". ` +
        'Write one to map your Ghost tags onto this site\'s topics, then re-run.',
    );
  } else if (unmapped > 0) {
    warnings.push(
      `- ${unmapped} post(s) matched no rule in ${MIGRATION_FILE} and fell back to "${fallbackCategory}". ` +
        'Add match rules and re-run, or fix the category in the generated frontmatter.',
    );
  }

  if (redirects.length > 0) {
    const file = path.join(root, 'site/redirects.yaml');
    let existing = '';
    try {
      existing = await fs.readFile(file, 'utf8');
    } catch {
      existing = '# URL history — where old addresses should send people now.\n\nredirects: []\n';
    }
    const entries = redirects
      .filter((rule) => !existing.includes(`from: ${rule.from}`))
      .map((rule) => `  - from: ${rule.from}\n    to: ${rule.to}\n    note: slug changed during the Ghost migration`);

    if (entries.length > 0) {
      const merged = existing.includes('redirects: []')
        ? existing.replace('redirects: []', `redirects:\n${entries.join('\n')}`)
        : `${existing.trimEnd()}\n${entries.join('\n')}\n`;
      await fs.writeFile(file, merged);
      warnings.push(
        `- ${entries.length} slug(s) changed; redirects appended to site/redirects.yaml. ` +
          'They are emitted as _redirects at build time and checked against the pages produced.',
      );
    }
  }

  /**
   * What Ghost knows about the site itself, as a `site/site.yaml` block.
   *
   * `settings` is in Ghost's export allowlist and holds the site title, its
   * description, the navigation, the social handles and the site-level share
   * image — every one of which has a home in site.yaml, and every one of which
   * this command used to discard. A migration that hands back sixty-one
   * articles and leaves the owner to retype their own nav out of a JSON dump
   * has done half the job.
   *
   * Offered rather than written, for the same reason as the tags: site/ is the
   * intent plane, and a migration writing into it would be mechanism editing
   * intent. `name` in particular is a judgement — Ghost's title is often the
   * full sentence this engine puts in `title`, not the short brand in `name`.
   */
  const settings = new Map(
    (Array.isArray(data.settings) ? (data.settings as GhostSetting[]) : [])
      .filter((row) => row.group === 'site' && typeof row.key === 'string')
      .map((row) => [row.key!, row.value ?? '']),
  );

  const setting = (key: string) => (settings.get(key) ?? '').trim();

  /** Ghost's handles are stored bare or as a URL depending on the network. */
  const socialUrl = (key: string, base: string) => {
    const value = setting(key);
    if (value === '') return undefined;
    if (/^https?:\/\//i.test(value)) return value;
    return `${base}${value.replace(/^@/, '')}`;
  };

  const navigation = (() => {
    try {
      const parsed = JSON.parse(setting('navigation') || '[]');
      return Array.isArray(parsed) ? (parsed as { label?: string; url?: string }[]) : [];
    } catch {
      return [];
    }
  })();

  const socials = Object.entries({
    x: socialUrl('twitter', 'https://x.com/'),
    facebook: socialUrl('facebook', 'https://facebook.com/'),
    mastodon: socialUrl('mastodon', ''),
    linkedin: socialUrl('linkedin', ''),
    youtube: socialUrl('youtube', ''),
    instagram: socialUrl('instagram', ''),
  }).filter(([, value]) => value !== undefined) as [string, string][];

  const siteBlock = [
    ...(setting('title') !== '' ? [`title: ${setting('title')}`, `name: ${setting('title')}`] : []),
    ...(setting('description') !== '' ? [`description: ${setting('description')}`] : []),
    ...(setting('og_image') !== '' ? ['og:', `  default: ${normalizeImageUrl(setting('og_image'))}`] : []),
    ...(socials.length > 0 ? ['social:', ...socials.map(([key, value]) => `  ${key}: ${value}`)] : []),
    ...(navigation.length > 0
      ? [
          'nav:',
          ...navigation
            .filter((item) => item.url && item.url !== '/')
            .map((item, index) => `  - { href: ${item.url}, label: ${item.label ?? item.url}, order: ${(index + 1) * 10} }`),
        ]
      : []),
  ];

  /**
   * The `tags:` block for site/taxonomy.yaml, ready to paste.
   *
   * Ghost already knows each tag's URL slug and description — `/tag/{slug}/`
   * was built from them — and those are exactly the two things the engine needs
   * to give a tag an archive. Without the slug a name like 可靠性 has no URL at
   * all (see docs/specs/taxonomy.md), so a migration that dropped it would hand
   * over a taxonomy the site then has to reconstruct by hand from an export it
   * is not supposed to read.
   *
   * Offered rather than written: site/taxonomy.yaml is intent, and a migration
   * appending to it would be the mechanism plane editing the intent plane.
   */
  const tagBlock = [...migratedTags.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([name, tag]) => {
      /**
       * Ghost's `tags` table carries the same metadata columns as `posts_meta`,
       * and the engine's archives now accept every one of them — so the block
       * offers the lot rather than the two fields the taxonomy needed to exist.
       * A tag page someone wrote a social card for keeps it.
       *
       * `accent_color` is the one column deliberately left out; see below.
       */
      const clean = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
      const lines = [`  ${name}:`, `    slug: ${tag.slug ?? slugify(name)}`];
      const put = (key: string, value: string) => {
        if (value !== '') lines.push(`    ${key}: ${value}`);
      };

      put('description', clean(tag.description));
      put('metaTitle', clean(tag.meta_title));
      put('metaDescription', clean(tag.meta_description));
      put('ogTitle', clean(tag.og_title));
      put('ogDescription', clean(tag.og_description));
      put('ogImage', normalizeImageUrl(tag.og_image ?? undefined));
      put('twitterTitle', clean(tag.twitter_title));
      put('twitterDescription', clean(tag.twitter_description));
      put('twitterImage', normalizeImageUrl(tag.twitter_image ?? undefined));
      put('heroImage', normalizeImageUrl(tag.feature_image ?? undefined));
      return lines;
    });

  /**
   * `accent_color` is the one Ghost tag column with nowhere to go, on purpose.
   *
   * A per-tag accent means injecting a raw colour past the theme-token
   * contract (`site/themes/*.css`, rules C-12 and C-13) — the contract that
   * exists so every colour on the site is one a human chose and a mode switch
   * accounts for. An arbitrary hex from a five-year-old tag would also be the
   * one colour on the page nothing checks for contrast. A site that wants a
   * section to look different has a theme; see docs/specs/theming.md.
   */
  const accents = [...migratedTags.values()].filter((tag) => (tag as { accent_color?: string }).accent_color);
  if (accents.length > 0) {
    warnings.push(
      `- ${accents.length} tag(s) had an accent_color, which was not migrated. Colour on this site comes from ` +
        'a theme (site/themes/*.css), so that every value is one somebody chose and both modes account for it. ' +
        'Rules C-12 and C-13 are what enforce that; see docs/specs/theming.md.',
    );
  }

  const report = [
    '# Ghost Migration Report',
    '',
    `Migrated posts: ${migrated.length}`,
    `Skipped Ghost pages (type: page): ${pages.length}`,
    `Unmapped (fell back to "${fallbackCategory}"): ${unmapped}`,
    '',
    '## Posts',
    '',
    ...migrated,
    '',
    '## Warnings',
    '',
    ...(warnings.length > 0 ? warnings : ['- No warnings.']),
    '',
    ...(siteBlock.length > 0
      ? [
          '## Site settings',
          '',
          'Ghost held these about the site itself. Merge them into `site/site.yaml` —',
          'they are not written for you because `site/` is yours, and because Ghost\'s',
          '`title` is usually the full sentence this engine puts in `title:` rather than',
          'the short brand it puts in `name:`. A nav entry pointing at a page this engine',
          'does not publish will fail the build by name, which is the check working.',
          '',
          '```yaml',
          ...siteBlock,
          '```',
          '',
        ]
      : []),
    ...(tagBlock.length > 0
      ? [
          '## Tags',
          '',
          'Paste this into `site/taxonomy.yaml`. The slugs are the ones your Ghost site',
          'already used, so `/tag/x/` and `/tags/x/` line up and the redirects stay short.',
          'A tag with no entry here still gets an archive if its name is already',
          'kebab-case; one whose name is not — any CJK tag — has no URL until it is here.',
          '',
          '```yaml',
          'tags:',
          ...tagBlock,
          '```',
          '',
        ]
      : []),
  ].join('\n');

  await fs.writeFile(reportPath, report);
  console.log(`Migrated ${migrated.length} posts.`);
  console.log(`Report written to ${reportPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

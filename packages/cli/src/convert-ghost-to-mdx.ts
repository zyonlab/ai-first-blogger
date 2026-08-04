import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import TurndownService from 'turndown';
import { categoryMap, fallbackCategory } from './category-map';
import { slugMap } from './slug-map';
import { isCategory, isSeries, categorySlugs } from 'aifb-engine/config/taxonomy';

type GhostTag = {
  name?: string;
  slug?: string;
};

type GhostPost = {
  title?: string;
  slug?: string;
  status?: string;
  html?: string;
  custom_excerpt?: string;
  excerpt?: string;
  meta_description?: string;
  published_at?: string;
  updated_at?: string;
  feature_image?: string;
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

function cleanDescription(post: GhostPost) {
  const description = post.custom_excerpt || post.excerpt || post.meta_description || post.title || 'Migrated Ghost post.';
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

function normalizeImageUrl(value = '') {
  if (domainImagePattern.test(value)) {
    return value.replace(domainImagePattern, '/content/images/');
  }
  const imagePrefix = `${legacyContentOrigin}/content/images/`;
  if (value.startsWith(imagePrefix)) {
    return value.replace(imagePrefix, '/content/images/');
  }
  return value;
}

function mapTaxonomy(post: GhostPost) {
  const rawTags = (post.tags ?? [])
    .flatMap((tag) => [tag.name, tag.slug])
    .filter(Boolean)
    .map((tag) => String(tag).toLowerCase());
  const text = [post.title, post.slug, ...rawTags].filter(Boolean).join(' ').toLowerCase();
  const match = categoryMap.find((item) => item.match.some((keyword) => text.includes(keyword.toLowerCase())));

  return {
    category: match?.category ?? fallbackCategory,
    series: match?.series,
    matched: match !== undefined,
    tags: [...new Set((post.tags ?? []).map((tag) => tag.name || tag.slug).filter(Boolean))],
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
      problems.push(`categoryMap[${index}].category "${rule.category}" is not in site/taxonomy.yaml.`);
    }
    if (rule.series && !isSeries(rule.series)) {
      problems.push(`categoryMap[${index}].series "${rule.series}" is not in site/taxonomy.yaml.`);
    }
  });

  if (problems.length > 0) {
    console.error('Migration aborted — scripts/category-map.ts does not match the site taxonomy:');
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error(`\nValid categories: ${categorySlugs.join(', ')}`);
    console.error('Fix scripts/category-map.ts (or site/taxonomy.yaml) and run again.');
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
  const posts = getGhostPosts(raw).filter((post) => post.status === 'published');
  const usedSlugs = new Set<string>();
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
  let unmapped = 0;

  for (const post of posts) {
    const title = post.title || 'Untitled';
    const baseSlug = slugMap[post.slug ?? ''] ?? post.slug ?? slugify(title);
    const slug = uniqueSlug(slugify(baseSlug), usedSlugs);
    const taxonomy = mapTaxonomy(post);
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
      description: cleanDescription(post),
      slug,
      pubDate: post.published_at ?? new Date().toISOString(),
      updatedDate: post.updated_at,
      draft: false,
      heroImage: normalizeImageUrl(post.feature_image),
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

    const output = matter.stringify(body.trim() + '\n', cleaned);
    await fs.writeFile(path.join(postsOutput, `${slug}.mdx`), output);
    migrated.push(`- ${title} → /writing/${slug}/ (${taxonomy.category}${taxonomy.matched ? '' : ', unmapped'})`);
  }

  if (unmapped > 0) {
    warnings.push(
      `- ${unmapped} post(s) matched no rule in scripts/category-map.ts and fell back to "${fallbackCategory}". ` +
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

  const report = [
    '# Ghost Migration Report',
    '',
    `Migrated posts: ${migrated.length}`,
    '',
    '## Posts',
    '',
    ...migrated,
    '',
    '## Warnings',
    '',
    ...(warnings.length > 0 ? warnings : ['- No warnings.']),
    '',
  ].join('\n');

  await fs.writeFile(reportPath, report);
  console.log(`Migrated ${migrated.length} posts.`);
  console.log(`Report written to ${reportPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

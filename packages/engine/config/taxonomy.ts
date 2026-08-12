/**
 * site/taxonomy.yaml → topics, series, pillars and the derived category
 * vocabulary.
 *
 * Categories are *derived* from the topic keys. They used to exist twice — as a
 * z.enum in the collection schema and as a union type — and the two drifted
 * without anything noticing. Deriving them makes that impossible.
 *
 * A topic's `title` and `description` are copy, so they are localisable the way
 * all copy in `site/` is — an `i18n:` block on the topic. Everything else about
 * a topic is structure and is the same in every language: the slug is the URL,
 * `pillar` is strategy, and `listed` is a decision about the site rather than
 * about a reader. A topic translated in one language and not another is one
 * topic showing its default-language title on that page, not a second topic.
 *
 * Contract: docs/specs/taxonomy.md
 */
import { defaultLocale } from './site';
import { fail, KEBAB_CASE, localised, readYaml } from './load';

const FILE = 'site/taxonomy.yaml';
const document = readYaml<Record<string, any>>('taxonomy.yaml');
const raw = localised(document, defaultLocale);

export type PillarDef = { name: string; goal: string };

/**
 * The head, card and hero a taxonomy archive may declare for itself.
 *
 * Shared by topics, series and tags because an archive is an archive: the three
 * render through the same `PageLayout` and land next to each other in a
 * sitemap. Giving one of them a social card and not the others would be a
 * difference nobody chose — and Ghost, which has a single taxonomy, carries
 * exactly this column set on its `tags` table.
 *
 * Every field optional; absent is byte-for-byte what the archive rendered
 * before. `title` and `description` stay what the page *displays*; these are
 * what it tells a search engine and a share preview, which are allowed to
 * disagree with the headline.
 */
export type TermMeta = {
  /** The <title>, when the term's name is the wrong length for a result. */
  metaTitle?: string;
  metaDescription?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: string;
  /** A hero image for the archive. Same name as an entry's, same meaning. */
  heroImage?: string;
  heroImageAlt?: string;
  /** Must stay on this origin (rule C-07), like an entry's. */
  canonical?: string;
  /** Keep a thin archive out of the index without deleting it. */
  noindex?: boolean;
};
export type TopicDef = TermMeta & {
  title: string;
  description: string;
  /** Which strategic pillar this topic serves. Must be a key of `pillars`. */
  pillar: string;
  /** When false: a valid category, but no topic page and hidden from listings. */
  listed?: boolean;
};
export type SeriesDef = TermMeta & {
  title: string;
  description: string;
  /** Must be a key of `topics`. */
  topic: string;
};

/**
 * A tag, keyed by the **name** articles write in their frontmatter.
 *
 * Tags are the one taxonomy that arrives from the content rather than from the
 * plan: `tags: [重试, 延迟]` is a list of names, and a name is not a URL. So
 * unlike topics and series, the key here is what an author typed and `slug` is
 * the part that may need declaring.
 *
 * Every field is optional. A tag whose name is already kebab-case needs no
 * entry in this file at all — that is what makes the taxonomy work out of the
 * box for a Ghost migration, where the tags exist and nobody has planned them
 * yet.
 */
export type TagDef = TermMeta & {
  /** URL segment. Defaults to a slugified name; required when that is empty. */
  slug?: string;
  /** Shown on the archive. Defaults to the name itself. */
  title?: string;
  /** The archive's own prose. Without it the page is a slug and a list. */
  description?: string;
};

/**
 * A category slug.
 *
 * Under the old TypeScript taxonomy this was a union of literals. YAML cannot
 * produce that, so validity is decided at runtime by `isCategory` and the zod
 * `refine` in every content schema — the trade taxonomy.md already chose when
 * it dropped `z.enum` in favour of data a site owner can edit. The alias stays
 * so call sites keep reading as intent rather than as `string`.
 */
export type TopicSlug = string;
export type SeriesSlug = string;

export const pillars = (raw.pillars ?? {}) as Record<string, PillarDef>;
export const topics = (raw.topics ?? {}) as Record<string, TopicDef>;
export const series = (raw.series ?? {}) as Record<string, SeriesDef>;
export const tags = (raw.tags ?? {}) as Record<string, TagDef>;

/**
 * A tag name reduced to a URL segment: lowercase, ASCII, hyphenated.
 *
 * Deliberately the same shape rule C-19 enforces on every URL segment, so a
 * slug this produces can never be one the gate then rejects. A name with no
 * ASCII letters or digits in it — which is every Chinese tag — reduces to the
 * empty string, and that is the signal that the site has to declare one.
 */
export function slugifyTag(name: string) {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

/**
 * The URL segment for a tag name, or `undefined` when it has no address.
 *
 * No address is a real state, not an error. Failing the build would mean every
 * existing Chinese site stops deploying the day it upgrades, for a feature it
 * did not ask for; silently dropping the tag would leave a taxonomy that is
 * half there, which is the defect class this whole change came from. So the
 * integration reports each one by name at build time and the tag renders as
 * plain text until somebody gives it a slug.
 */
export function tagSlug(name: string): string | undefined {
  const declared = tags[name]?.slug;
  if (typeof declared === 'string' && declared.trim() !== '') return declared.trim();
  const derived = slugifyTag(name);
  return derived === '' ? undefined : derived;
}

/* ------------------------------------------------------------------ *
 * Derived values. Never hand-maintained.
 * ------------------------------------------------------------------ */

export const categorySlugs = Object.keys(topics);
export const seriesSlugs = Object.keys(series);
export const pillarSlugs = Object.keys(pillars);

/** Topics that get their own page and appear in listings. */
export const topicList = Object.entries(topics)
  .filter(([, topic]) => topic.listed !== false)
  .map(([slug, topic]) => ({ slug, ...topic }));

/** Every topic including unlisted ones — for label lookup. */
export const allTopicList = Object.entries(topics).map(([slug, topic]) => ({ slug, ...topic }));

export const seriesList = Object.entries(series).map(([slug, item]) => ({ slug, ...item }));

export const pillarList = Object.entries(pillars).map(([slug, item]) => ({
  slug,
  ...item,
  topics: Object.entries(topics)
    .filter(([, topic]) => topic.pillar === slug)
    .map(([topicSlug]) => topicSlug),
}));

export function isCategory(value: string) {
  return Object.hasOwn(topics, value);
}

export function isSeries(value: string) {
  return Object.hasOwn(series, value);
}

/** Human label for a category slug; falls back to the slug itself. */
export function categoryLabel(slug: string, locale: string = defaultLocale) {
  const table = topicsFor(locale);
  return Object.hasOwn(table, slug) ? table[slug]!.title : slug;
}

/* ------------------------------------------------------------------ *
 * Per-locale views.
 *
 * The vocabulary is one vocabulary — same slugs, same pillars, same
 * membership — read through one language's copy. Memoised because every
 * card on every page asks for its topic's title, and a deep merge per
 * card is a deep merge a few thousand times per build.
 * ------------------------------------------------------------------ */

const cache = new Map<
  string,
  { topics: Record<string, TopicDef>; series: Record<string, SeriesDef>; tags: Record<string, TagDef> }
>();

function viewFor(locale: string) {
  const cached = cache.get(locale);
  if (cached) return cached;
  const merged = localised(document, locale);
  const view = {
    topics: (merged.topics ?? {}) as Record<string, TopicDef>,
    series: (merged.series ?? {}) as Record<string, SeriesDef>,
    tags: (merged.tags ?? {}) as Record<string, TagDef>,
  };
  cache.set(locale, view);
  return view;
}

export function topicsFor(locale: string = defaultLocale) {
  return viewFor(locale).topics;
}

export function seriesFor(locale: string = defaultLocale) {
  return viewFor(locale).series;
}

export function tagsFor(locale: string = defaultLocale) {
  return viewFor(locale).tags;
}

/**
 * What an archive calls itself, in one locale.
 *
 * A tag with no declared copy is titled with the name the articles wrote. That
 * is the honest default: a page called `重试` listing three articles about
 * retries is thin, but it is not *wrong*, and the site can improve it by adding
 * three lines rather than by re-tagging its back catalogue.
 */
export function tagCopyFor(name: string, locale: string = defaultLocale) {
  const declared = tagsFor(locale)[name];
  return { title: declared?.title ?? name, description: declared?.description };
}

/** Topics that get their own page, in one locale's copy. */
export function topicListFor(locale: string = defaultLocale) {
  return Object.entries(topicsFor(locale))
    .filter(([, topic]) => topic.listed !== false)
    .map(([slug, topic]) => ({ slug, ...topic }));
}

export function seriesListFor(locale: string = defaultLocale) {
  return Object.entries(seriesFor(locale)).map(([slug, item]) => ({ slug, ...item }));
}

/* ------------------------------------------------------------------ *
 * Self-validation — a broken taxonomy fails the build loudly instead of
 * producing a silently wrong site.
 * ------------------------------------------------------------------ */

const problems: string[] = [];

if (categorySlugs.length === 0) problems.push('No topics defined. A site needs at least one.');

for (const [slug, topic] of Object.entries(topics)) {
  if (!KEBAB_CASE.test(slug)) problems.push(`topic "${slug}" is not kebab-case.`);
  if (typeof topic?.title !== 'string') problems.push(`topic "${slug}" is missing a title.`);
  if (typeof topic?.description !== 'string') problems.push(`topic "${slug}" is missing a description.`);
  if (topic?.pillar !== undefined && !Object.hasOwn(pillars, topic.pillar)) {
    problems.push(
      `topic "${slug}" references unknown pillar "${topic.pillar}". Valid: ${pillarSlugs.join(', ') || '(none)'}`,
    );
  }
}

for (const [slug, item] of Object.entries(series)) {
  if (!KEBAB_CASE.test(slug)) problems.push(`series "${slug}" is not kebab-case.`);
  if (!isCategory(item?.topic)) {
    problems.push(`series "${slug}" references unknown topic "${item?.topic}". Valid: ${categorySlugs.join(', ')}`);
  }
}

/**
 * A declared tag slug has to be a URL segment, because C-19 will say so later
 * and "the gate rejected a page you did not write" is a worse message than
 * this one. Two tags claiming one slug is the other half: it would build two
 * pages at one address and let the loader pick.
 */
const tagSlugs = new Map<string, string>();
for (const [name, tag] of Object.entries(tags)) {
  const declared = tag?.slug;
  if (declared !== undefined && !KEBAB_CASE.test(declared)) {
    problems.push(`tag "${name}" has slug "${declared}", which is not kebab-case.`);
    continue;
  }
  const slug = tagSlug(name);
  if (slug === undefined) continue;
  const previous = tagSlugs.get(slug);
  if (previous !== undefined) {
    problems.push(`tags "${previous}" and "${name}" both resolve to /tags/${slug}/. Give one of them its own slug.`);
  }
  tagSlugs.set(slug, name);
}

// A pillar owning no topic is strategy that never reached the site. It is the
// failure mode the old content-plans/site-plan.yaml had by design: a plan
// nothing checked. Reported as an error so the plan and the site stay the same
// document.
for (const slug of pillarSlugs) {
  if (!Object.values(topics).some((topic) => topic.pillar === slug)) {
    problems.push(`pillar "${slug}" owns no topic. Give it one, or remove the pillar.`);
  }
}

if (problems.length > 0) fail(FILE, problems);

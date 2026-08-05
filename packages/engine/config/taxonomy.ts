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
export type TopicDef = {
  title: string;
  description: string;
  /** Which strategic pillar this topic serves. Must be a key of `pillars`. */
  pillar: string;
  /** When false: a valid category, but no topic page and hidden from listings. */
  listed?: boolean;
};
export type SeriesDef = {
  title: string;
  description: string;
  /** Must be a key of `topics`. */
  topic: string;
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

const cache = new Map<string, { topics: Record<string, TopicDef>; series: Record<string, SeriesDef> }>();

function viewFor(locale: string) {
  const cached = cache.get(locale);
  if (cached) return cached;
  const merged = localised(document, locale);
  const view = {
    topics: (merged.topics ?? {}) as Record<string, TopicDef>,
    series: (merged.series ?? {}) as Record<string, SeriesDef>,
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

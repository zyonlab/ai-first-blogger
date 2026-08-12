import { getCollection } from 'astro:content';
import { defaultLocale, isMultiLocale, siteLocales, type Locale } from '@config/routes';
import type { ContentTypeDef } from '@content-types/index';
import { getContentType, registryFor } from '@content-types/index';
import type { ContentEntry as ContentEntryType } from '@content-types/types';

export type { ContentEntry as AnyEntry } from '@content-types/types';
type AnyEntry = ContentEntryType;

/* ------------------------------------------------------------------ *
 * Which language a file is in.
 *
 * The path decides, and frontmatter overrides it:
 *
 *   content/posts/why-retries-made-it-worse.mdx      default locale
 *   content/posts/en/why-retries-made-it-worse.mdx   en-US
 *
 * Deriving it from the directory rather than requiring a field is the
 * difference between translating an article and remembering to translate
 * an article. A `locale:` in frontmatter that disagrees with the path wins,
 * because someone wrote it on purpose; a file with neither is in the
 * default locale, which is every file in every site that exists today.
 *
 * The prefix is the *URL* prefix, not the tag: `content/posts/en/` and
 * `/en/writing/` are the same `en`, so the directory a translation lives
 * in is the directory its URL says it is in. A directory that is not a
 * declared prefix is just a directory — the loader has always allowed
 * subdirectories and their names have never meant anything.
 * ------------------------------------------------------------------ */

const localeByPrefix = new Map(siteLocales.map((locale) => [locale.prefix, locale.tag]));

export function localeOf(entry: AnyEntry): Locale {
  const declared = entry.data.locale;
  if (typeof declared === 'string' && declared.trim() !== '') return declared;
  if (!isMultiLocale) return defaultLocale;
  const head = entry.id.split('/')[0];
  return (head !== undefined && localeByPrefix.get(head)) || defaultLocale;
}

/**
 * What makes two files the same article in two languages. Defaults to the slug,
 * so a translation that keeps its slug needs no field at all.
 */
export function translationKeyOf(entry: AnyEntry): string {
  const declared = entry.data.translationKey;
  if (typeof declared === 'string' && declared.trim() !== '') return declared;
  return entry.data.slug as string;
}

/**
 * Published entries of a content type in one locale, drafts removed and sorted
 * according to the type's `sortBy`. This is the only entry point pages should
 * use — it guarantees drafts never reach a rendered surface, and that an English
 * page never lists a Chinese article.
 *
 * The locale defaults to the site's, which on a single-language site is every
 * entry there is.
 */
export async function getEntries(type: ContentTypeDef | string, locale: Locale = defaultLocale): Promise<AnyEntry[]> {
  const def = typeof type === 'string' ? getContentType(type) : type;
  if (!def) throw new Error(`Unknown content type: ${String(type)}`);

  const entries = (await getCollection(
    def.name as never,
    (entry: AnyEntry) => entry.data.draft !== true,
  )) as unknown as AnyEntry[];

  const inLocale = isMultiLocale ? entries.filter((entry) => localeOf(entry) === locale) : entries;

  /**
   * `featured` pins an entry to the front of every listing of its type.
   *
   * It sorts ahead of `sortBy` rather than replacing it, and it applies even to
   * `sortBy: 'none'` — a type that keeps its declared order still has to be
   * able to say "start here", which was previously only expressible by
   * hardcoding a slug in a template. Ties inside each group keep whatever order
   * the type already had, so pinning nothing changes nothing.
   */
  const pinned = (entry: AnyEntry) => (entry.data.featured === true ? 0 : 1);

  const byDate = def.sortBy === 'none'
    ? inLocale
    : [...inLocale].sort((a, b) => (b.data.pubDate?.valueOf() ?? 0) - (a.data.pubDate?.valueOf() ?? 0));

  return [...byDate].sort((a, b) => pinned(a) - pinned(b));
}

/** Every published entry of a content type, in every locale. */
export async function getEntriesEverywhere(type: ContentTypeDef | string): Promise<AnyEntry[]> {
  const def = typeof type === 'string' ? getContentType(type) : type;
  if (!def) throw new Error(`Unknown content type: ${String(type)}`);
  return (await getCollection(def.name as never, (entry: AnyEntry) => entry.data.draft !== true)) as unknown as AnyEntry[];
}

/** Every published entry across the given content types, tagged with its type. */
export async function getAllEntries(types: ContentTypeDef[], locale: Locale = defaultLocale) {
  return Promise.all(types.map(async (type) => ({ type, entries: await getEntries(type, locale) })));
}

/**
 * Flat, type-tagged view across every registered content type, filtered by a
 * predicate. Taxonomy pages use this so a topic collects matching entries from
 * every content type that carries a `category`, not just from posts.
 */
export async function findEntries(
  types: ContentTypeDef[],
  predicate: (entry: AnyEntry, type: ContentTypeDef) => boolean,
  locale: Locale = defaultLocale,
) {
  const groups = await getAllEntries(types, locale);
  return groups.flatMap(({ type, entries }) =>
    entries.filter((entry) => predicate(entry, type)).map((entry) => ({ type, entry })),
  );
}

export function bySlug(items: AnyEntry[], slug: string) {
  return items.find((item) => item.data.slug === slug);
}

/**
 * The locales one entry exists in, and where each one lives.
 *
 * This is the answer `hreflang` needs, and the reason it is computed from the
 * entries rather than from the locale list: **not every article exists in every
 * language.** An article written only in Chinese has one locale here, so it gets
 * no alternates and no English page — as opposed to an English URL that builds,
 * renders the Chinese text, and tells a crawler it is the English version of
 * itself. That page is a soft 404 with a hreflang tag vouching for it, and it is
 * the single failure this whole feature has to avoid.
 */
export async function translationsOf(type: ContentTypeDef, entry: AnyEntry) {
  if (!isMultiLocale) return [];
  const key = translationKeyOf(entry);
  const siblings = (await getEntriesEverywhere(type)).filter((item) => translationKeyOf(item) === key);
  return siblings.map((item) => ({ locale: localeOf(item), slug: item.data.slug as string }));
}

/** Locales in which this content type has at least one published entry. */
export async function localesWithEntries(type: ContentTypeDef): Promise<Locale[]> {
  const entries = await getEntriesEverywhere(type);
  const found = new Set(entries.map((entry) => localeOf(entry)));
  return siteLocales.map((locale) => locale.tag).filter((tag) => found.has(tag));
}

/** Every content type that has at least one published entry in a locale. */
export async function typesWithEntries(locale: Locale): Promise<ContentTypeDef[]> {
  const types = registryFor(locale);
  const populated = await Promise.all(
    types.map(async (type) => ((await getEntries(type, locale)).length > 0 ? type : undefined)),
  );
  return populated.filter((type): type is ContentTypeDef => type !== undefined);
}

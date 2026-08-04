/**
 * Keyword → category/series mapping for `pnpm migrate:ghost`.
 *
 * Ships empty on purpose. The valid vocabulary comes from
 * site/taxonomy.yaml — the same single source of truth the content schemas
 * validate against — so a mapping written here cannot drift from the site's
 * real categories. `pnpm migrate:ghost` refuses to run if it does.
 *
 * Fill it in before migrating: each entry matches against the post's title,
 * slug and tags (lower-cased), first match wins.
 *
 *   export const categoryMap: CategoryRule[] = [
 *     { match: ['vue', 'react', 'virtual dom'], category: 'frontend-internals',
 *       series: 'framework-internals' },
 *     { match: ['postgres', 'sql'], category: 'databases' },
 *   ];
 *
 * Anything that matches nothing lands in `fallbackCategory`.
 */
import { categorySlugs, seriesSlugs } from 'aifb-engine/config/taxonomy';

export type CategorySlug = (typeof categorySlugs)[number];
export type SeriesSlug = (typeof seriesSlugs)[number];

export type CategoryRule = {
  /** Lower-cased substrings matched against title + slug + tags. */
  match: string[];
  category: CategorySlug;
  series?: SeriesSlug;
};

export const categoryMap: CategoryRule[] = [];

/**
 * Category for posts that match no rule. Must exist in site/taxonomy.yaml.
 * A catch-all bucket with `listed: false` is the natural choice.
 */
export const fallbackCategory: CategorySlug = (categorySlugs.includes('notes' as CategorySlug)
  ? 'notes'
  : categorySlugs[0]) as CategorySlug;

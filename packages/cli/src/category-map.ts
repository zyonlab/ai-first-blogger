/**
 * `site/migration.yaml` → the keyword mapping `pnpm migrate:ghost` uses.
 *
 * This used to be a TypeScript array in this file, and that was a plane error
 * (ADR 0002). "Which keyword means which category" is site intent — it is a
 * statement about one site's taxonomy and one site's back catalogue, and it
 * lives for exactly one afternoon. A site running a published `aifb-cli` cannot
 * edit a file inside `node_modules`, so every such site got `fallbackCategory`
 * for all 61 of its posts and a report that said the migration succeeded.
 *
 *   # site/migration.yaml
 *   fallbackCategory: notes
 *   rules:
 *     - match: [vue, react, virtual dom]
 *       category: frontend-internals
 *       series: framework-internals
 *     - match: [postgres, sql]
 *       category: databases
 *
 * Each rule matches, case-insensitively, against the post's title, slug and tag
 * names. First match wins; anything matching nothing lands in
 * `fallbackCategory`. The vocabulary is checked against `site/taxonomy.yaml`
 * before a single file is written — see `assertMappingIsValid`.
 *
 * The file is optional. Without it the migration still runs and files
 * everything under the fallback, which is what it did before this existed.
 */
import { fail, readOptionalYaml } from 'aifb-engine/config/load';
import { categorySlugs, seriesSlugs } from 'aifb-engine/config/taxonomy';

export type CategorySlug = (typeof categorySlugs)[number];
export type SeriesSlug = (typeof seriesSlugs)[number];

export type CategoryRule = {
  /** Substrings matched, case-insensitively, against title + slug + tag names. */
  match: string[];
  category: CategorySlug;
  series?: SeriesSlug;
};

type MigrationConfig = {
  fallbackCategory?: string;
  rules?: { match?: unknown; category?: unknown; series?: unknown }[];
};

const FILE = 'migration.yaml';
const document = readOptionalYaml<MigrationConfig>(FILE);

/**
 * A catch-all bucket with `listed: false` is the natural choice, so `notes` is
 * the default guess. A site that has no such topic gets its first one, and the
 * migration refuses to run if that is not a real category either.
 */
const DEFAULT_FALLBACK = (categorySlugs.includes('notes' as CategorySlug) ? 'notes' : categorySlugs[0]) as CategorySlug;

export const fallbackCategory: CategorySlug = (document?.fallbackCategory ?? DEFAULT_FALLBACK) as CategorySlug;

export const categoryMap: CategoryRule[] = (document?.rules ?? []).map((rule, index) => {
  const problems: string[] = [];
  const match = Array.isArray(rule.match) ? rule.match.filter((item) => typeof item === 'string') : [];
  if (match.length === 0) problems.push(`rules[${index}].match must be a non-empty list of keywords.`);
  if (typeof rule.category !== 'string' || rule.category.trim() === '') {
    problems.push(`rules[${index}].category is required.`);
  }
  if (rule.series !== undefined && typeof rule.series !== 'string') {
    problems.push(`rules[${index}].series must be a series slug if present.`);
  }
  if (problems.length > 0) fail(`site/${FILE}`, problems);

  return {
    match: match as string[],
    category: rule.category as CategorySlug,
    series: rule.series as SeriesSlug | undefined,
  };
});

/** Whether the site wrote one at all, so the report can say which happened. */
export const hasMigrationConfig = document !== undefined;

/** Where a site owner should go to change any of the above. */
export const MIGRATION_FILE = `site/${FILE}`;

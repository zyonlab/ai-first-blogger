/**
 * Taxonomy filtered by what actually has content.
 *
 * `site/taxonomy.yaml` declares the vocabulary; it knows nothing about
 * entries. Rendering a page for every declared topic produces empty URLs the
 * moment the vocabulary runs ahead of the writing — thin pages that still land
 * in the sitemap and llms.txt.
 *
 * These helpers are the content-aware view: a topic or series becomes a page
 * when at least one published entry points at it, and disappears again if that
 * entry is deleted or set back to draft.
 */
import {
  seriesListFor,
  tagCopyFor,
  tagSlug,
  tagsFor,
  topicListFor,
  type SeriesDef,
  type TermMeta,
  type TopicDef,
} from '@config/taxonomy';
import { defaultLocale, type Locale } from '@config/routes';
import { registryFor } from '@content-types/index';
import { findEntries } from './content';

export type ActiveTopic = TopicDef & { slug: string; count: number };
export type ActiveSeries = SeriesDef & { slug: string; count: number };

/**
 * Topics with at least one published entry **in this locale**, in declared
 * order.
 *
 * Counting across locales would be the easy mistake and it produces the exact
 * page this feature exists to avoid: `/en/topics/llm-reliability/` built because
 * three Chinese articles carry that category, listing none of them.
 */
export async function getActiveTopics(locale: Locale = defaultLocale): Promise<ActiveTopic[]> {
  const counted = await Promise.all(
    topicListFor(locale).map(async (topic) => ({
      ...topic,
      count: (await findEntries(registryFor(locale), (entry) => entry.data.category === topic.slug, locale)).length,
    })),
  );
  return counted.filter((topic) => topic.count > 0);
}

/**
 * A tag with entries, carrying whatever `site/taxonomy.yaml` declared about it.
 *
 * `TermMeta` is spread in rather than picked apart: the archive renders the
 * same head, card and hero a topic archive does, and a narrower type here would
 * mean the tag page silently losing fields the other two show.
 */
export type ActiveTag = TermMeta & {
  name: string;
  slug: string;
  title: string;
  description?: string;
  count: number;
};

/**
 * Tags with at least one published entry **in this locale**, and with a URL.
 *
 * Both filters matter and they fail differently. No entries means an archive
 * with nothing on it — the same thin page `getActiveTopics` exists to avoid,
 * except tags arrive from content rather than from a plan, so it happens by
 * deleting an article rather than by planning ahead. No slug means the site has
 * not given the tag an address; those are reported by name at build time (see
 * the integration) rather than silently skipped here.
 *
 * Order is by count, then by name, so the archive index leads with the tags
 * that actually organise the site. Topics keep their declared order because a
 * site *chose* that order; nobody chose the order of these.
 */
export async function getActiveTags(locale: Locale = defaultLocale): Promise<ActiveTag[]> {
  const entries = await findEntries(registryFor(locale), () => true, locale);

  const counts = new Map<string, number>();
  for (const { entry } of entries) {
    const list = Array.isArray(entry.data.tags) ? (entry.data.tags as unknown[]) : [];
    for (const raw of list) {
      if (typeof raw !== 'string' || raw.trim() === '') continue;
      const name = raw.trim();
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .flatMap(([name, count]) => {
      const slug = tagSlug(name);
      if (slug === undefined) return [];
      return [{ ...(tagsFor(locale)[name] ?? {}), name, slug, count, ...tagCopyFor(name, locale) }];
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Every tag name in use in this locale that has no URL, so a build can say so. */
export async function getUnaddressableTags(locale: Locale = defaultLocale): Promise<string[]> {
  const entries = await findEntries(registryFor(locale), () => true, locale);
  const names = new Set<string>();
  for (const { entry } of entries) {
    const list = Array.isArray(entry.data.tags) ? (entry.data.tags as unknown[]) : [];
    for (const raw of list) {
      if (typeof raw === 'string' && raw.trim() !== '' && tagSlug(raw.trim()) === undefined) names.add(raw.trim());
    }
  }
  return [...names].sort();
}

/** Series with at least one published entry in this locale, in declared order. */
export async function getActiveSeries(locale: Locale = defaultLocale): Promise<ActiveSeries[]> {
  const counted = await Promise.all(
    seriesListFor(locale).map(async (item) => ({
      ...item,
      count: (await findEntries(registryFor(locale), (entry) => entry.data.series === item.slug, locale)).length,
    })),
  );
  return counted.filter((item) => item.count > 0);
}

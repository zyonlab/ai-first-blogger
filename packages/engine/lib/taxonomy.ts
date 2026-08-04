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
import { seriesListFor, topicListFor, type SeriesDef, type TopicDef } from '@config/taxonomy';
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

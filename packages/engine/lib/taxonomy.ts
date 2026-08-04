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
import { seriesList, topicList, type SeriesDef, type TopicDef } from '@config/taxonomy';
import { registry } from '@content-types/index';
import { findEntries } from './content';

export type ActiveTopic = TopicDef & { slug: string; count: number };
export type ActiveSeries = SeriesDef & { slug: string; count: number };

/** Topics with at least one published entry, in declared order. */
export async function getActiveTopics(): Promise<ActiveTopic[]> {
  const counted = await Promise.all(
    topicList.map(async (topic) => ({
      ...topic,
      count: (await findEntries(registry, (entry) => entry.data.category === topic.slug)).length,
    })),
  );
  return counted.filter((topic) => topic.count > 0);
}

/** Series with at least one published entry, in declared order. */
export async function getActiveSeries(): Promise<ActiveSeries[]> {
  const counted = await Promise.all(
    seriesList.map(async (item) => ({
      ...item,
      count: (await findEntries(registry, (entry) => entry.data.series === item.slug)).length,
    })),
  );
  return counted.filter((item) => item.count > 0);
}

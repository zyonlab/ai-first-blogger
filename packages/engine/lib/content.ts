import { getCollection } from 'astro:content';
import type { ContentTypeDef } from '@content-types/index';
import { getContentType } from '@content-types/index';
import type { ContentEntry as ContentEntryType } from '@content-types/types';

export type { ContentEntry as AnyEntry } from '@content-types/types';
type AnyEntry = ContentEntryType;

/**
 * Published entries of a content type, drafts removed and sorted according to
 * the type's `sortBy`. This is the only entry point pages should use — it
 * guarantees drafts never reach a rendered surface.
 */
export async function getEntries(type: ContentTypeDef | string): Promise<AnyEntry[]> {
  const def = typeof type === 'string' ? getContentType(type) : type;
  if (!def) throw new Error(`Unknown content type: ${String(type)}`);

  const entries = (await getCollection(
    def.name as never,
    (entry: AnyEntry) => entry.data.draft !== true,
  )) as unknown as AnyEntry[];

  if (def.sortBy === 'none') return entries;

  return [...entries].sort((a, b) => {
    const left = a.data.pubDate?.valueOf() ?? 0;
    const right = b.data.pubDate?.valueOf() ?? 0;
    return right - left;
  });
}

/** Every published entry across the given content types, tagged with its type. */
export async function getAllEntries(types: ContentTypeDef[]) {
  return Promise.all(types.map(async (type) => ({ type, entries: await getEntries(type) })));
}

/**
 * Flat, type-tagged view across every registered content type, filtered by a
 * predicate. Taxonomy pages use this so a topic collects matching entries from
 * every content type that carries a `category`, not just from posts.
 */
export async function findEntries(
  types: ContentTypeDef[],
  predicate: (entry: AnyEntry, type: ContentTypeDef) => boolean,
) {
  const groups = await getAllEntries(types);
  return groups.flatMap(({ type, entries }) =>
    entries.filter((entry) => predicate(entry, type)).map((entry) => ({ type, entry })),
  );
}

export function bySlug(items: AnyEntry[], slug: string) {
  return items.find((item) => item.data.slug === slug);
}

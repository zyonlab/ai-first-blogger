import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { site } from '@config/site';
import { entryPath, rssTypes } from '@content-types/index';
import { getAllEntries } from '@lib/content';

/** Feed contents are derived from every content type declaring `surfaces.rss`. */
export async function GET(context: APIContext) {
  const groups = await getAllEntries(rssTypes);

  const items = groups
    .flatMap(({ type, entries }) =>
      entries.map((entry) => ({
        title: entry.data.title as string,
        description: entry.data.description as string,
        pubDate: entry.data.pubDate ?? new Date(0),
        link: entryPath(type, entry.data.slug),
        categories: [type.listTitle],
      })),
    )
    .sort((a, b) => b.pubDate.valueOf() - a.pubDate.valueOf());

  return rss({
    title: site.title,
    description: site.description,
    site: context.site ?? site.url,
    items,
  });
}

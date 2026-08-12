import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { homePath, localeOfPath, localeStaticPaths } from '@config/routes';
import { site, siteFor } from '@config/site';
import { entryPath, rssTypesFor } from '@content-types/index';
import { getAllEntries } from '@lib/content';

/**
 * One feed per locale: `/rss.xml` for the default language, `/en/rss.xml` for
 * the rest. A single mixed feed would be the cheaper build and the wrong
 * product — a reader subscribes to a language, and half the items arriving in
 * one they cannot read is how a feed gets unsubscribed from.
 */
export const getStaticPaths = localeStaticPaths;

/** Feed contents are derived from every content type declaring `surfaces.rss`. */
export async function GET(context: APIContext) {
  const locale = localeOfPath(context.url.pathname);
  const localised = siteFor(locale);
  const groups = await getAllEntries(rssTypesFor(locale), locale);

  const items = groups
    .flatMap(({ type, entries }) =>
      entries.map((entry) => ({
        title: entry.data.title as string,
        description: entry.data.description as string,
        pubDate: entry.data.pubDate ?? new Date(0),
        link: entryPath(type, entry.data.slug, locale),
        // The type, then the entry's own tags. A reader filtering a feed by
        // category was previously offered one value per section — which is the
        // same information the section link already carried.
        categories: [type.listTitle, ...(Array.isArray(entry.data.tags) ? (entry.data.tags as string[]) : [])],
      })),
    )
    .sort((a, b) => b.pubDate.valueOf() - a.pubDate.valueOf());

  return rss({
    title: localised.title,
    description: localised.description,
    // The channel link is the feed's home, which is this locale's root rather
    // than the origin's — on a mounted or translated engine those are different
    // pages, and the host's home page is not what this feed is a feed of. Item
    // links are already absolute paths, so the base only decides the channel
    // link.
    site: new URL(homePath(locale), context.site ?? site.url),
    items,
  });
}

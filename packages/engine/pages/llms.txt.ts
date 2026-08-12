import { hasPage, localeOfPath, localeStaticPaths, seriesPath, tagPath, topicPath } from '@config/routes';
import { siteFor } from '@config/site';
import { getActiveSeries, getActiveTags, getActiveTopics } from '@lib/taxonomy';
import { entryPath, listPath, llmsTypesFor } from '@content-types/index';
import { getEntries } from '@lib/content';
import type { APIRoute } from 'astro';

/**
 * Machine-readable site summary for AI crawlers.
 * Sections are derived from the registry, so any content type declaring
 * `surfaces.llms` is covered automatically — no per-type edits here.
 *
 * One per locale, for the same reason as the feed: a summary is a claim about
 * what a reader will find at those URLs, and a mixed-language list makes the
 * claim false for whichever language the reader came for.
 */
export const getStaticPaths = localeStaticPaths;

export const GET: APIRoute = async (context) => {
  const locale = localeOfPath(context.url.pathname);
  const site = siteFor(locale);
  const llmsTypes = llmsTypesFor(locale);

  // Only the sections this site publishes: a summary that points an AI crawler
  // at pages the build never produced is worse than a shorter summary.
  const topicList = hasPage('topics') ? await getActiveTopics(locale) : [];
  const seriesList = hasPage('series') ? await getActiveSeries(locale) : [];
  // Tags were absent from this file entirely while they were decorative. They
  // are the finest-grained index the site has, which is exactly what a crawler
  // asking "what is on this site" can use.
  const tagList = hasPage('tags') ? await getActiveTags(locale) : [];
  const sections = await Promise.all(
    llmsTypes.map(async (type) => {
      const entries = (await getEntries(type, locale)).slice(0, type.surfaces.llms!.limit);
      if (entries.length === 0) return [];
      return [
        '',
        `## ${type.listTitle}`,
        type.listDescription,
        '',
        ...entries.map(
          (entry) =>
            `- [${entry.data.title as string}](${entryPath(type, entry.data.slug, locale)}): ${entry.data.description as string}`,
        ),
      ];
    }),
  );

  const body = [
    `# ${site.name}`,
    '',
    site.description,
    '',
    `Author: ${site.author.name} — ${site.author.title}`,
    `URL: ${site.url}`,
    '',
    '## Focus',
    ...site.brand.keywords.map((item) => `- ${item}`),
    '',
    '## Sections',
    ...llmsTypes.map((type) => `- [${type.listTitle}](${listPath(type, locale)}): ${type.listDescription}`),
    ...(topicList.length > 0
      ? ['', '## Topics', ...topicList.map((topic) => `- [${topic.title}](${topicPath(topic.slug, locale)}): ${topic.description}`)]
      : []),
    ...(seriesList.length > 0
      ? ['', '## Series', ...seriesList.map((item) => `- [${item.title}](${seriesPath(item.slug, locale)}): ${item.description}`)]
      : []),
    ...(tagList.length > 0
      ? [
          '',
          '## Tags',
          ...tagList.map(
            (tag) => `- [${tag.title}](${tagPath(tag.slug, locale)})${tag.description ? `: ${tag.description}` : ''}`,
          ),
        ]
      : []),
    ...sections.flat(),
    '',
  ].join('\n');

  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};

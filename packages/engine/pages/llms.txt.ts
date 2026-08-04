import { site } from '@config/site';
import { getActiveSeries, getActiveTopics } from '@lib/taxonomy';
import { entryPath, listPath, llmsTypes } from '@content-types/index';
import { getEntries } from '@lib/content';
import type { APIRoute } from 'astro';

/**
 * Machine-readable site summary for AI crawlers.
 * Sections are derived from the registry, so any content type declaring
 * `surfaces.llms` is covered automatically — no per-type edits here.
 */
export const GET: APIRoute = async () => {
  const topicList = await getActiveTopics();
  const seriesList = await getActiveSeries();
  const sections = await Promise.all(
    llmsTypes.map(async (type) => {
      const entries = (await getEntries(type)).slice(0, type.surfaces.llms!.limit);
      if (entries.length === 0) return [];
      return [
        '',
        `## ${type.listTitle}`,
        type.listDescription,
        '',
        ...entries.map(
          (entry) =>
            `- [${entry.data.title as string}](${entryPath(type, entry.data.slug)}): ${entry.data.description as string}`,
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
    ...llmsTypes.map((type) => `- [${type.listTitle}](${listPath(type)}): ${type.listDescription}`),
    ...(topicList.length > 0
      ? ['', '## Topics', ...topicList.map((topic) => `- [${topic.title}](/topics/${topic.slug}/): ${topic.description}`)]
      : []),
    ...(seriesList.length > 0
      ? ['', '## Series', ...seriesList.map((item) => `- [${item.title}](/series/${item.slug}/): ${item.description}`)]
      : []),
    ...sections.flat(),
    '',
  ].join('\n');

  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};

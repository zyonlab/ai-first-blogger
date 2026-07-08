import { site } from '@data/site';
import { seriesList } from '@data/series';
import { topicList } from '@data/topics';
import { getPublishedPosts, getPublishedVideos } from '@lib/content';
import type { APIRoute } from 'astro';

export const GET: APIRoute = async () => {
  const posts = (await getPublishedPosts()).slice(0, 12);
  const videos = (await getPublishedVideos()).slice(0, 8);
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
    '## Topics',
    ...topicList.map((topic) => `- [${topic.title}](/topics/${topic.slug}/): ${topic.description}`),
    '',
    '## Series',
    ...seriesList.map((series) => `- [${series.title}](/series/${series.slug}/): ${series.description}`),
    '',
    '## Recent writing',
    ...posts.map((post) => `- [${post.data.title}](/writing/${post.data.slug}/): ${post.data.description}`),
    '',
    '## Videos',
    ...videos.map((video) => `- [${video.data.title}](/videos/${video.data.slug}/): ${video.data.description}`),
  ].join('\n');

  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};

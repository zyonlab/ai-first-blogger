import { site } from '@data/site';
import { seriesList } from '@data/series';
import { topicList } from '@data/topics';
import { getPublishedPosts, getPublishedVideos } from '@lib/content';
import type { APIRoute } from 'astro';

export const GET: APIRoute = async () => {
  const posts = (await getPublishedPosts()).slice(0, 12);
  const videos = (await getPublishedVideos()).slice(0, 8);
  const activeTopicSlugs = new Set<string>(posts.map((post) => post.data.category));
  const activeSeriesSlugs = new Set<string>(
    posts.map((post) => post.data.series).filter((slug): slug is string => Boolean(slug)),
  );
  const topics = topicList.filter((topic) => activeTopicSlugs.has(topic.slug));
  const series = seriesList.filter((item) => activeSeriesSlugs.has(item.slug));
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
    ...(topics.length > 0 ? ['## Topics', ...topics.map((topic) => `- [${topic.title}](/topics/${topic.slug}/): ${topic.description}`), ''] : []),
    ...(series.length > 0 ? ['## Series', ...series.map((item) => `- [${item.title}](/series/${item.slug}/): ${item.description}`), ''] : []),
    ...(posts.length > 0 ? ['## Recent writing', ...posts.map((post) => `- [${post.data.title}](/writing/${post.data.slug}/): ${post.data.description}`), ''] : []),
    ...(videos.length > 0 ? ['## Videos', ...videos.map((video) => `- [${video.data.title}](/videos/${video.data.slug}/): ${video.data.description}`)] : []),
  ].join('\n');

  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};

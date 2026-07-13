import { getCollection } from 'astro:content';

export async function getPublishedPosts() {
  const now = Date.now();
  const posts = await getCollection('posts', ({ data }) => !data.draft && data.pubDate.valueOf() <= now);
  return posts.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

export async function getPublishedVideos() {
  const now = Date.now();
  const videos = await getCollection('videos', ({ data }) => !data.draft && data.pubDate.valueOf() <= now);
  return videos.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

export async function getPublishedCaseStudies() {
  const now = Date.now();
  const items = await getCollection('case-studies', ({ data }) => !data.draft && data.pubDate.valueOf() <= now);
  return items.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

export function bySlug<T extends { data: { slug: string } }>(items: T[], slug: string) {
  return items.find((item) => item.data.slug === slug);
}

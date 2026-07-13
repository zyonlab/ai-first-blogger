import { getCollection } from 'astro:content';

export async function getPublishedPosts() {
  const posts = await getCollection('posts', ({ data }) => !data.draft);
  return posts.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

export async function getPublishedVideos() {
  const videos = await getCollection('videos', ({ data }) => !data.draft);
  return videos.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

export async function getPublishedCaseStudies() {
  const items = await getCollection('case-studies', ({ data }) => !data.draft);
  return items.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

export function bySlug<T extends { data: { slug: string } }>(items: T[], slug: string) {
  return items.find((item) => item.data.slug === slug);
}

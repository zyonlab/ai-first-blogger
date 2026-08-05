import { z } from 'astro:content';
import { site } from '../config/site';
import { toIsoDuration } from '../lib/duration';
import { absoluteUrl } from '../lib/seo';
import { defineContentType } from './types';

/** Canonical YouTube thumbnail. Required by Google for video rich results. */
export function youtubeThumbnail(youtubeId: string) {
  return `https://i.ytimg.com/vi/${youtubeId}/maxresdefault.jpg`;
}

export default defineContentType({
  name: 'videos',
  card: 'VideoCard',
  detail: 'VideoDetail',
  listLayout: 'grid',
  sortBy: 'pubDate',

  schema: z.object({
    title: z.string(),
    description: z.string(),
    slug: z.string(),
    pubDate: z.coerce.date(),
    draft: z.boolean().default(false),
    youtubeId: z.string().regex(/^[A-Za-z0-9_-]{11}$/, 'must be an 11-character YouTube video id'),
    duration: z.string().optional(),
    topics: z.array(z.string()).default([]),
    relatedPosts: z.array(z.string()).default([]),
    transcript: z.boolean().default(false),
    chapters: z
      .array(z.object({ time: z.string(), title: z.string() }))
      .default([]),
  }),

  seo: (entry) => {
    const data = entry.data as { youtubeId: string; pubDate: Date };
    return { image: youtubeThumbnail(data.youtubeId), publishedTime: data.pubDate };
  },

  jsonLd: (entry, { canonical, locale }) => {
    const data = entry.data as {
      title: string;
      description: string;
      pubDate: Date;
      youtubeId: string;
      duration?: string;
      topics: string[];
    };
    return [
      {
        '@context': 'https://schema.org',
        '@type': 'VideoObject',
        name: data.title,
        description: data.description,
        // thumbnailUrl is required by Google; duration is strongly recommended.
        thumbnailUrl: [youtubeThumbnail(data.youtubeId)],
        ...(toIsoDuration(data.duration) ? { duration: toIsoDuration(data.duration) } : {}),
        uploadDate: data.pubDate.toISOString(),
        embedUrl: `https://www.youtube-nocookie.com/embed/${data.youtubeId}`,
        contentUrl: `https://www.youtube.com/watch?v=${data.youtubeId}`,
        url: absoluteUrl(canonical),
        author: { '@type': 'Person', name: site.author.name, url: site.url },
        inLanguage: locale,
        keywords: data.topics,
      },
    ];
  },

});

import { z } from 'astro:content';
import { site } from '../config/site';
import { categorySlugs, isCategory, isSeries, seriesSlugs } from '../config/taxonomy';
import { absoluteUrl } from '../lib/seo';
import { defineContentType } from './types';

const category = z.string().refine(isCategory, {
  message: `must be one of: ${categorySlugs.join(', ')} (defined in site/taxonomy.yaml)`,
});

const seriesRef = z.string().refine(isSeries, {
  message: `must be one of: ${seriesSlugs.join(', ')} (defined in site/taxonomy.yaml)`,
});

export default defineContentType({
  name: 'posts',
  card: 'ArticleCard',
  detail: 'PostDetail',
  listLayout: 'grid two',
  listTagCloud: true,
  sortBy: 'pubDate',

  schema: z.object({
    title: z.string(),
    description: z.string(),
    slug: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    draft: z.boolean().default(false),
    heroImage: z.string().optional(),
    category,
    tags: z.array(z.string()).default([]),
    series: seriesRef.optional(),
    seriesOrder: z.number().optional(),
    author: z.string().default(site.author.name),
    youtubeId: z.string().optional(),
    legacySlug: z.string().optional(),
    canonical: z.string().optional(),
  }),

  seo: (entry) => {
    const data = entry.data as {
      heroImage?: string;
      canonical?: string;
      pubDate: Date;
      updatedDate?: Date;
      tags: string[];
    };
    return {
      type: 'article',
      image: data.heroImage,
      canonical: data.canonical,
      publishedTime: data.pubDate,
      modifiedTime: data.updatedDate ?? data.pubDate,
      tags: data.tags,
    };
  },

  jsonLd: (entry, { canonical, locale }) => {
    const data = entry.data as {
      title: string;
      description: string;
      pubDate: Date;
      updatedDate?: Date;
      author: string;
      tags: string[];
      category: string;
    };
    return [
      {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: data.title,
        description: data.description,
        datePublished: data.pubDate.toISOString(),
        dateModified: (data.updatedDate ?? data.pubDate).toISOString(),
        author: { '@type': 'Person', name: data.author, url: site.url },
        publisher: { '@type': 'Person', name: site.author.name, url: site.url },
        mainEntityOfPage: absoluteUrl(canonical),
        inLanguage: locale,
        keywords: data.tags,
        articleSection: data.category,
      },
    ];
  },

});

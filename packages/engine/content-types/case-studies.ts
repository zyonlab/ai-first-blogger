import { z } from 'astro:content';
import { site } from '../config/site';
import { absoluteUrl } from '../lib/seo';
import { defineContentType } from './types';

export default defineContentType({
  name: 'case-studies',
  card: 'CaseStudyCard',
  detail: 'CaseStudyDetail',
  listLayout: 'grid two',
  sortBy: 'pubDate',

  schema: z.object({
    title: z.string(),
    description: z.string(),
    slug: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    draft: z.boolean().default(false),
    heroImage: z.string().optional(),
    category: z.string(),
    tags: z.array(z.string()).default([]),
    relatedProject: z.string().optional(),
  }),

  seo: (entry) => {
    const data = entry.data as {
      heroImage?: string;
      pubDate: Date;
      updatedDate?: Date;
      tags: string[];
    };
    return {
      type: 'article',
      image: data.heroImage,
      publishedTime: data.pubDate,
      modifiedTime: data.updatedDate ?? data.pubDate,
      tags: data.tags,
    };
  },

  jsonLd: (entry, { canonical }) => {
    const data = entry.data as {
      title: string;
      description: string;
      pubDate: Date;
      updatedDate?: Date;
      category: string;
      tags: string[];
    };
    return [
      {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: data.title,
        description: data.description,
        datePublished: data.pubDate.toISOString(),
        dateModified: (data.updatedDate ?? data.pubDate).toISOString(),
        author: { '@type': 'Person', name: site.author.name, url: site.url },
        publisher: { '@type': 'Person', name: site.author.name, url: site.url },
        mainEntityOfPage: absoluteUrl(canonical),
        inLanguage: site.locale,
        articleSection: data.category,
        keywords: data.tags,
      },
    ];
  },

});

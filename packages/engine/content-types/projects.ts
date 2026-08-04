import { z } from 'astro:content';
import { absoluteUrl } from '../lib/seo';
import { defineContentType } from './types';

export default defineContentType({
  name: 'projects',
  card: 'ProjectCard',
  detail: 'ProjectDetail',
  listLayout: 'grid',
  sortBy: 'none',

  schema: z.object({
    title: z.string(),
    description: z.string(),
    slug: z.string(),
    draft: z.boolean().default(false),
    status: z.enum(['active', 'archived', 'planned']).default('planned'),
    role: z.string().optional(),
    techStack: z.array(z.string()).default([]),
    repoUrl: z.string().url().optional(),
    demoUrl: z.string().url().optional(),
    cover: z.string().optional(),
    highlights: z.array(z.string()).default([]),
  }),

  seo: (entry) => {
    const data = entry.data as { cover?: string };
    return { image: data.cover };
  },

  jsonLd: (entry, { canonical }) => {
    const data = entry.data as {
      title: string;
      description: string;
      techStack: string[];
    };
    return [
      {
        '@context': 'https://schema.org',
        '@type': 'CreativeWork',
        name: data.title,
        description: data.description,
        url: absoluteUrl(canonical),
        keywords: data.techStack,
      },
    ];
  },

});

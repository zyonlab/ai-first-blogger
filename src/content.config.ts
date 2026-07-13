import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const posts = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/posts" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    slug: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    reviewAfter: z.coerce.date().optional(),
    draft: z.boolean().default(false),
    heroImage: z.string().optional(),
    category: z.enum([
      "ai-applications",
      "llm-learning",
      "full-stack-engineering",
      "frontend-architecture",
      "vue-react-internals",
      "web3-defi",
      "exchange-systems",
      "engineering-productivity",
      "ai-engineering",
      "career",
      "notes",
    ]),
    tags: z.array(z.string()).default([]),
    series: z.string().optional(),
    seriesOrder: z.number().optional(),
    author: z.string().default("子雍"),
    youtubeId: z.string().optional(),
    legacySlug: z.string().optional(),
    canonical: z.string().optional(),
    workflowId: z.string().optional(),
  }),
});

const videos = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/videos" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    slug: z.string(),
    pubDate: z.coerce.date(),
    reviewAfter: z.coerce.date().optional(),
    draft: z.boolean().default(false),
    youtubeId: z.string(),
    duration: z.string().optional(),
    topics: z.array(z.string()).default([]),
    relatedPosts: z.array(z.string()).default([]),
    transcript: z.boolean().default(false),
    chapters: z
      .array(
        z.object({
          time: z.string(),
          title: z.string(),
        }),
      )
      .default([]),
    workflowId: z.string().optional(),
  }),
});

const projects = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/projects" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    slug: z.string(),
    status: z.enum(["active", "archived", "planned"]).default("planned"),
    role: z.string().optional(),
    techStack: z.array(z.string()).default([]),
    repoUrl: z.url().optional(),
    demoUrl: z.url().optional(),
    cover: z.string().optional(),
    highlights: z.array(z.string()).default([]),
  }),
});

const caseStudies = defineCollection({
  loader: glob({
    pattern: "**/*.{md,mdx}",
    base: "./src/content/case-studies",
  }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    slug: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    reviewAfter: z.coerce.date().optional(),
    draft: z.boolean().default(false),
    category: z.string(),
    tags: z.array(z.string()).default([]),
    relatedProject: z.string().optional(),
    workflowId: z.string().optional(),
  }),
});

export const collections = {
  posts,
  videos,
  projects,
  "case-studies": caseStudies,
};

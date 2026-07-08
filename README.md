# AI First Blogger

AI First Blogger is a reusable Astro + MDX static blog framework designed for AI-assisted planning, writing, SEO/GEO optimization, deployment, and ongoing maintenance.

It is not a traditional CMS. The system is file-based, structured, and agent-friendly: AI can update site settings, generate content briefs, write MDX, audit SEO/GEO, validate builds, and deploy through GitHub Actions.

## Stack

- Astro
- TypeScript
- MDX
- Astro Content Collections
- Static output
- GitHub Actions
- Cloudflare Pages

## Development

```bash
pnpm install
pnpm dev
```

## Build

```bash
pnpm check
pnpm build
pnpm preview
```

## Configure a New Site

Start with:

```txt
prompts/site-intake.md
```

Then update:

```txt
src/data/site.ts
content-plans/site-plan.yaml
```

`src/data/site.ts` controls the brand name, domain, author, email, social links, hero copy, CTAs, and service/contact copy.

## AI-first Workflow

Core instructions live in:

```txt
AGENTS.md
docs/playbooks/ai-first-workflow.md
docs/playbooks/template-customization.md
.ai/skills/ai-first-blogger/SKILL.md
```

Reusable prompts live in:

```txt
prompts/site-intake.md
prompts/content-plan.md
prompts/article-brief.md
prompts/seo-geo-audit.md
prompts/deploy.md
```

## Content

Create posts in:

```txt
src/content/posts/*.mdx
```

Required frontmatter:

```yaml
title: Article title
description: SEO description
slug: article-slug
pubDate: 2026-07-07
category: ai-engineering
tags:
  - AI
  - Blogging
```

Drafts are supported with:

```yaml
draft: true
```

Other collections:

```txt
src/content/videos/*.mdx
src/content/projects/*.mdx
src/content/case-studies/*.mdx
```

## SEO / GEO

Implemented:

- `sitemap`
- `/rss.xml`
- `/robots.txt`
- `/llms.txt`
- canonical URLs
- Open Graph
- Twitter Card
- Person JSON-LD
- Article JSON-LD
- VideoObject JSON-LD
- CollectionPage and ItemList JSON-LD

Use `prompts/seo-geo-audit.md` before launch and after major content changes.

## Cloudflare Pages

This repo includes a GitHub Actions workflow:

```txt
.github/workflows/cloudflare-pages.yml
```

Required GitHub Secrets:

```txt
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

Set the Pages project name in the workflow:

```yaml
CLOUDFLARE_PAGES_PROJECT_NAME: your-pages-project
```

The workflow runs on push to `main`:

```txt
pnpm install --frozen-lockfile
pnpm check
pnpm build
wrangler pages deploy dist
```

## Ghost Migration

Place the Ghost export at:

```txt
migration/ghost-export.json
```

Optionally place exported images at:

```txt
migration/images/
```

Run:

```bash
LEGACY_CONTENT_DOMAIN=https://your-old-domain.com pnpm migrate:ghost
```

The script writes MDX posts to `src/content/posts/` and generates `migration/report.md`.

Manual slug overrides live in `scripts/slug-map.ts`.
Category and series mapping lives in `scripts/category-map.ts`.

## Notes

- Keep secrets out of the repository.
- Keep brand-specific values in `src/data/site.ts`.
- Keep content strategy in `content-plans/site-plan.yaml`.
- Do not edit generated `dist/`, `.astro/`, or `node_modules/`.

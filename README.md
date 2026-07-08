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

Agent tools that support MCP can expose the same context through:

```bash
pnpm mcp:server
```

See `docs/playbooks/mcp-and-skills.md`.

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

Required GitHub Variables:

```txt
CLOUDFLARE_PAGES_PROJECT_NAME
PRODUCTION_SITE_URL
STAGING_SITE_URL
```

The workflow runs on push to `release` for staging and `main` for production:

```txt
pnpm install --frozen-lockfile
pnpm check
pnpm build
wrangler pages deploy dist
```

Recommended release flow:

```txt
feature branch -> release -> main
```

- `release` deploys a Cloudflare Pages preview branch with `STAGING_SITE_URL`.
- `main` deploys the production branch with `PRODUCTION_SITE_URL`.
- Use the same Cloudflare Pages project unless you need full environment isolation.

## Notes

- Keep secrets out of the repository.
- Keep brand-specific values in `src/data/site.ts`.
- Keep content strategy in `content-plans/site-plan.yaml`.
- Do not edit generated `dist/`, `.astro/`, or `node_modules/`.

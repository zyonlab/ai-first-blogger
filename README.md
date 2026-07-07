# ZyonCode Astro

ZyonCode is a static personal brand site and technical content library for frontend architecture, Web3 systems, crypto exchange systems, engineering productivity, and AI engineering.

## Stack

- Astro
- TypeScript
- MDX
- Astro Content Collections
- Static output
- Cloudflare Pages

## Development

```bash
pnpm install
pnpm dev
```

## Build

```bash
pnpm build
pnpm preview
pnpm check
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
category: frontend-architecture
tags:
  - Architecture
```

Drafts are supported with:

```yaml
draft: true
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
pnpm migrate:ghost
```

The script writes MDX posts to `src/content/posts/` and generates `migration/report.md`.

Manual slug overrides live in `scripts/slug-map.ts`.

Category and series mapping lives in `scripts/category-map.ts`.

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

## Cloudflare Pages

Use:

```txt
Framework preset: Astro
Build command: pnpm build
Build output directory: dist
Node version: 20 or 22
```

Connect the GitHub repository to Cloudflare Pages, then add `zyoncode.com` as the custom domain.

## Domain Plan

- `zyoncode.com` → Cloudflare Pages
- `www.zyoncode.com` → redirect to root domain
- Optional `api.zyoncode.com` → existing server
- Optional `assets.zyoncode.com` → future Cloudflare R2/CDN

## Notes

- Ghost is treated as a one-time content export source, not the ongoing CMS.
- The first version uses Git and MDX for content management.
- If image volume grows, move `public/content/images/` to Cloudflare R2 or another CDN.

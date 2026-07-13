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
pnpm test:phase-zero
pnpm test:phase-one
pnpm test:phase-two
pnpm test:phase-three
pnpm test:phase-four
pnpm test:phase-five
pnpm test:site-init
pnpm roadmap:validate
```

## Structured Content Workflow

```bash
pnpm content:new -- topic-research my-topic --title "My Topic" --owner "Author"
pnpm content:validate
pnpm content:audit
pnpm content:transition -- my-article researched --actor "Author"
pnpm content:editorial-audit -- src/content/posts/my-article.mdx
pnpm content:freshness
pnpm content:scheduled -- --now 2026-08-01T01:30:00Z --window-minutes 70
pnpm prompt:regression
pnpm prompt:record-host -- <host> <raw-output-file>
```

The canonical contract is `content-plans/content-pipeline.yaml`. Structured work lives under `content-work/**` and is validated before publishable content builds.

`content-plans/author-style.yaml` is optional and disabled by default. Enable it only after the user approves the writing preferences and at least two reference articles. `content-plans/source-policy.yaml` is mandatory for verified fact ledgers. `content-plans/editorial-scorecard.yaml` keeps machine checks separate from human publication decisions.

Editorial audit findings are review prompts, not automatic publishing decisions. Prompt regression validates local golden briefs and reports each real host attempt. Codex currently passes; Claude Code and OpenClaw remain pending because this machine's provider credentials were rejected, and their failure records are retained under `prompts/regression/host-results/`.

## Configure a New Site

Prepare a complete, non-secret JSON intake file using the shape demonstrated by
`scripts/fixtures/site-intake.json`. Then preview both generated configuration files:

```bash
pnpm site:init -- --input ./site-intake.json --dry-run
```

The preview reports create/overwrite status, current and generated hashes, and the full generated
content. It does not change the repository. After review, explicitly confirm replacement of existing
configuration:

```bash
pnpm site:init -- --input ./site-intake.json --confirm-overwrite
```

The command validates all intake fields before writing `src/data/site.ts` and
`content-plans/site-plan.yaml`. Existing files are never overwritten without
`--confirm-overwrite`; an identical rerun is a safe no-op. The intake accepts public identity,
contact, social, editorial, and planning data only—keep API tokens, deployment credentials, and
other secrets in environment variables or GitHub Secrets.

## AI-first Workflow

Core instructions live in:

```txt
AGENTS.md
docs/playbooks/ai-first-workflow.md
docs/playbooks/template-customization.md
docs/playbooks/content-pipeline.md
docs/playbooks/scheduled-publishing.md
docs/playbooks/search-console-operations.md
docs/playbooks/rich-result-release-validation.md
docs/playbooks/ghost-wordpress-migration.md
docs/research/agent-friendly-maintenance.md
.ai/skills/ai-first-blogger/SKILL.md
```

Reusable prompts live in:

```txt
prompts/site-intake.md
prompts/content-plan.md
prompts/content-pipeline.md
prompts/article-brief.md
prompts/seo-geo-audit.md
prompts/deploy.md
```

Project maturity, gaps, and the executable implementation backlog live in:

```txt
docs/research/ai-first-blogger-gap-analysis.md
content-plans/ai-first-blogger-roadmap.yaml
```

Agent tools that support MCP can expose the same context through:

```bash
pnpm mcp:server
```

See `docs/playbooks/mcp-and-skills.md`.

## Blog Use Cases

Use these examples as prompts for Codex, Claude Code, OpenCode, OpenClaw-like agents, or any MCP-capable coding agent.

### 1. Configure a New Personal Blog

```text
Use this repo as an AI-first blog framework.
Read AGENTS.md, src/data/site.ts, content-plans/site-plan.yaml, and prompts/site-intake.md.
Ask me only for missing brand, domain, author, social, audience, content domains, and conversion goal.
Then update src/data/site.ts and content-plans/site-plan.yaml.
Run pnpm check and pnpm build.
```

Best for:

- replacing the template brand
- setting author, email, social links, domain, CTAs
- preparing the first version of a personal blog

### 2. Plan a 90-day Content Strategy

```text
Act as the content strategist for this blog.
Read content-plans/site-plan.yaml and content-plans/content-pipeline.yaml.
Use Backward Design and Diátaxis.
Create a 90-day plan with pillars, series, article queue, video ideas, project/case-study ideas, search intent, and internal links.
Do not write articles yet.
```

Best for:

- deciding what to write
- building topical authority
- avoiding random, disconnected posts

### 3. Design a Series

```text
Plan a series about [topic] for [target reader].
Use Backward Design, Scaffolding, and Cognitive Load Theory.
Output reader outcome, audience level, article sequence, prerequisite knowledge, difficulty curve, examples needed, and internal links.
Use docs/playbooks/content-pipeline.md as the output contract.
Do not create files until I approve.
```

Best for:

- tutorials or deep-dive series
- turning a broad topic into a teachable path
- making article order easier to understand

### 4. Research a Topic Before Writing

```text
Run the topic_research stage for [topic].
Read content-plans/content-pipeline.yaml.
Identify reader problem, search intents, source list, competitor patterns, content gaps, and a differentiated angle.
Use primary sources for facts that may change.
Return assumptions and missing questions.
```

Best for:

- avoiding shallow AI-generated posts
- finding a strong angle before writing
- collecting credible sources and search intent

### 5. Create an Article Brief

```text
Create an article brief for [topic].
Target reader: [reader].
Search intent: [intent].
Conversion goal: [newsletter / consulting / product / portfolio].
Use prompts/article-brief.md and docs/playbooks/content-pipeline.md.
Output title, description, slug, category, tags, direct answer, H2/H3 outline, definitions, examples, diagrams, FAQ, internal links, and SEO/GEO notes.
Do not draft the article until I approve the brief.
```

Best for:

- making every article deliberate
- aligning SEO, GEO, reader intent, and site structure
- handing off writing to another agent

### 6. Write a Technical Article

```text
Write the approved brief as an MDX article under src/content/posts/.
Use short paragraphs, clear H2/H3 hierarchy, direct definitions, worked examples, code blocks, Mermaid diagrams where useful, tradeoffs, and failure modes.
Avoid generic AI tone.
Run pnpm check after creating the file.
```

Best for:

- long-form technical essays
- engineering notes
- practical tutorials

### 7. Improve an Existing Article

```text
Improve src/content/posts/[slug].mdx.
Use the teaching_review and human_edit stages from content-plans/content-pipeline.yaml.
Reduce cognitive load, clarify section jobs, add examples, remove generic AI tone, add practical constraints and tradeoffs.
Preserve the original topic and slug unless there is a strong SEO reason.
Run pnpm check.
```

Best for:

- upgrading old posts
- making articles easier to understand
- removing robotic tone

### 8. Optimize an Article for SEO/GEO

```text
Audit src/content/posts/[slug].mdx for SEO and GEO.
Check title, description, canonical, heading hierarchy, direct answer block, entity coverage, definitions, FAQ, internal links, JSON-LD readiness, llms.txt usefulness, and sitemap/rss impact.
Return prioritized fixes first.
Only edit files after approval.
```

Best for:

- Google search readiness
- AI answer engine readability
- improving snippets, summaries, and internal links

### 9. Add a Video Post

```text
Create a video content entry under src/content/videos/.
Use the existing video schema and style.
Include title, description, slug, pubDate, youtubeId, topics, related posts, transcript flag, and chapters if available.
Add summary notes that help users understand the video without watching the whole thing.
Run pnpm check.
```

Best for:

- YouTube companion pages
- video transcripts or summaries
- connecting videos to article series

### 10. Add a Project or Case Study

```text
Create a project or case study page for [project].
Use src/content/projects/ or src/content/case-studies/ depending on whether this is a product/project note or an outcome story.
Include problem, context, decisions, tradeoffs, tech stack, screenshots or diagrams if useful, and links to related articles.
Run pnpm check.
```

Best for:

- portfolio projects
- consulting proof
- turning work into content assets

### 11. Maintain Internal Links and Navigation

```text
Review the current content inventory.
Use get_content_inventory if MCP is available.
Find missing internal links between posts, topics, series, projects, videos, and case studies.
Suggest navigation or topic changes only when they improve information architecture.
Run pnpm check after edits.
```

Best for:

- content library maintenance
- improving crawlability
- helping users move through a learning path

### 12. Run a Publishing Review

```text
Run the publishing_review stage.
Check changed files, frontmatter, drafts, internal links, canonical URLs, JSON-LD, robots.txt, sitemap, rss.xml, llms.txt, and build output.
Run pnpm check and pnpm build.
Summarize whether this should go to release staging or main production.
```

Best for:

- final QA before deployment
- avoiding broken metadata
- staging review before production

### 13. Deploy to Staging

```text
Prepare this branch for staging.
Verify GitHub Actions, CLOUDFLARE_PAGES_PROJECT_NAME, STAGING_SITE_URL, and release branch behavior.
Do not modify DNS.
Commit and push to release only after pnpm check and pnpm build pass.
```

Best for:

- previewing layout, SEO, and generated files
- validating with a public staging URL

### 14. Release to Production

```text
Promote the approved release changes to main.
Confirm staging has been reviewed.
Do not change DNS or custom domains.
Merge release into main and push.
After GitHub Actions completes, verify homepage, robots.txt, sitemap, rss.xml, and llms.txt.
```

Best for:

- final production deployment
- keeping production stable

### 15. Agent Maintenance Session

```text
You are maintaining this AI-first blog.
Start with AGENTS.md.
If MCP is available, call healthcheck, get_site_context, get_content_pipeline, and get_content_inventory.
Identify stale content, missing internal links, weak SEO/GEO pages, and broken assumptions.
Return a prioritized maintenance plan before editing files.
```

Best for:

- weekly/monthly content maintenance
- delegating upkeep to OpenCode/OpenClaw/Codex-style agents
- preventing random edits without a plan

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

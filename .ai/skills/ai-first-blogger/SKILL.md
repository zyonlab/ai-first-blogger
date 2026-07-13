---
name: ai-first-blogger
description: Configure, plan, research, write, review, optimize, deploy, and maintain this AI-first Astro blog. Use for site setup, structured content workflows, article or series creation, SEO/GEO review, content lifecycle transitions, Cloudflare deployment, and framework roadmap work.
---

# AI First Blogger

## Run a Task

1. Read `AGENTS.md`, `src/data/site.ts`, and `content-plans/site-plan.yaml`.
2. For content work, read the canonical contract at `content-plans/content-pipeline.yaml` and run `pnpm content:audit`.
3. Use `src/content-workflow/schemas.ts` for artifact fields and `content-plans/content-types.yaml` for article-type requirements.
4. Apply `content-plans/author-style.yaml` only when the user has enabled it; always enforce `content-plans/source-policy.yaml` and `content-plans/editorial-scorecard.yaml`.
5. Create artifacts under `content-work/**`; do not draft publishable content before required artifacts are approved.
6. Treat machine editorial findings as evidence only. Require explicit human decisions for every scorecard dimension before approving publication.
7. Use `pnpm content:transition` for lifecycle changes and `pnpm content:validate` after artifact or content edits.
8. For platform work, select a ready task from `content-plans/ai-first-blogger-roadmap.yaml`.
9. Run `pnpm check` and `pnpm build` for code, schema, SEO, layout, content, or deployment changes.

## MCP

- Call `healthcheck`, then `get_workflow_contract`, `get_content_pipeline`, or `get_site_context`.
- Read `contractVersion` from MCP output; do not rely on remembered stage definitions.
- Call `get_content_inventory` before changing navigation, topics, series, or internal links.
- Keep changes in repository files so Git can review and revert them.

## Guardrails

- Do not modify DNS or custom domains without explicit approval.
- Do not commit credentials or edit generated directories.
- Keep brand and owner values in `src/data/site.ts`.
- Hide empty content surfaces and optional links.
- Do not invent personal experience, measurements, sources, or publication evidence.
- Fix failed lifecycle requirements instead of overriding state manually.

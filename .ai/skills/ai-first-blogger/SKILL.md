---
name: ai-first-blogger
description: Configure, plan, write, optimize, deploy, and maintain this AI-first Astro blog framework. Use when the user asks to customize the site brand, set up a blog, plan content, generate articles, improve SEO/GEO, manage prompts, or deploy/maintain the Cloudflare Pages static site.
---

# AI First Blogger

## Workflow

1. Read `AGENTS.md`, `src/data/site.ts`, and `content-plans/site-plan.yaml`.
2. Identify whether the request is setup, planning, writing, SEO/GEO audit, deployment, or maintenance.
3. Use the matching prompt in `prompts/` as the operating contract.
4. Keep brand and owner details in `src/data/site.ts`; do not hardcode them elsewhere.
5. Keep content strategy in `content-plans/site-plan.yaml`.
6. For content work, use `content-plans/content-pipeline.yaml` and `docs/playbooks/content-pipeline.md`.
7. Validate with `pnpm check` and `pnpm build` when code, schema, or content changes.

## MCP

- If the host supports MCP, connect this repository's `ai-first-blogger` server first.
- Use `get_workflow_contract` to load the right prompt, required files, and validation checklist.
- Use `get_content_pipeline` before content research, series planning, article briefs, human editing, or SEO/GEO optimization.
- Use `get_site_context` before setup, planning, SEO/GEO, or maintenance tasks.
- Use `get_content_inventory` before rewriting navigation, topic pages, or content plans.
- Treat MCP output as context; make actual file edits in the repository so changes remain reviewable.

## Prompt Map

- Site setup: `prompts/site-intake.md`
- Content planning: `prompts/content-plan.md`
- Article brief/write: `prompts/article-brief.md`
- Content pipeline: `prompts/content-pipeline.md`
- SEO/GEO audit: `prompts/seo-geo-audit.md`
- Deployment: `prompts/deploy.md`

## Guardrails

- Do not modify DNS/custom domains without explicit approval.
- Do not commit tokens or secrets.
- Do not edit generated `dist/`, `.astro/`, or `node_modules/`.
- Prefer structured content and direct answers over vague marketing copy.

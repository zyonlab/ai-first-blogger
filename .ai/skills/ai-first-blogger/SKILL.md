---
name: ai-first-blogger
description: Configure, plan, write, optimize, deploy, and maintain this AI-first Astro blog framework. Use when the user asks to customize the site brand, set up a blog, plan content, generate articles, improve SEO/GEO, manage prompts, or deploy/maintain the Cloudflare Pages static site.
---

# AI First Blogger

## The boundary

```
site/       intent    — what the site is about. Change it when asked.
content/    material  — the articles. This is what you produce.
the engine  mechanism — aifb-engine + aifb-cli. Never touched to make a site decision.
```

`site/` is YAML and Markdown; the engine is code. If a site decision seems to
require editing the engine, that is an engine bug — say so instead of working
around it.

## Workflow
0. **Run `pnpm context <task>` before reading config files.** `write` / `setup` /
   `type` / `status` each print the slice that task needs — one tool call instead
   of ~9k tokens of YAML, and `write` includes the real link targets.
1. Read `AGENTS.md`. Open a `site/` file directly only when `context` did not
   already answer the question; `site/README.md` is the index.
2. Identify whether the request is setup, planning, writing, SEO/GEO audit,
   deployment, or maintenance.
3. Use the matching prompt in `prompts/` as the operating contract.
4. Put values in the right plane. Thresholds go in `site/policy.yaml`, never as
   constants in the engine.
5. Validate with `pnpm check && pnpm build && pnpm validate`, then read
   `validate-report.json` and clear every error before reporting completion.
6. Run `pnpm analyze` and act on `content-report.json` — it reports `file:line`
   and a `fix` per finding, the same shape as the gate.
7. `pnpm context status` merges the reports and flags stale ones. Never conclude
   from a report that ran before your last edit.

## Prompt Map
- Site setup: `prompts/site-intake.md`
- Content planning: `prompts/content-plan.md`
- Article brief/write: `prompts/article-brief.md`
- SEO/GEO audit: `prompts/seo-geo-audit.md` — run the gate first; audit only what it cannot decide
- Deployment: `prompts/deploy.md`

## Key Docs
All of it ships with the framework, not the site:
<https://github.com/zyonlab/ai-first-blogger/tree/main/docs>

- `getting-started.md` — blank to live site
- `specs/content-contract.md` — what "publishable" means (29 rules + preflight)
- `specs/site-config-contract.md` — which plane a value belongs to
- `specs/templates.md` — overriding markup without losing the gate
- `recipes/` — add a content type / theme / locale · `adr/` — decisions

## Guardrails
- Do not modify DNS/custom domains without explicit approval.
- Do not commit tokens or secrets.
- Do not edit generated `dist/`, `.astro/`, or `node_modules/`.
- Do not hand-write list/detail pages, nav entries, `llms.txt` or `rss.xml`
  sections for a content type — declare `surfaces` in `site/content-types.yaml`.
- Do not silence a validation rule to make a build pass. If a threshold is wrong,
  change `site/policy.yaml` and say why.
- If a *site* decision needed engine code, file a **Boundary** issue at
  <https://github.com/zyonlab/ai-first-blogger/issues/new/choose> with the
  workaround pasted in, then ship the workaround anyway. `npx aifb env` prints
  the version block the form asks for.
- Set `draft: true` on unfinished work: drafts are neither built nor gated, so
  they cannot block the deploy.
- Prefer structured content and direct answers over vague marketing copy.

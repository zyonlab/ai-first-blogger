# AI First Blogger Agent Rules

Scope: entire repository.

## Product Direction

- Treat this repo as a reusable AI-first Astro blog framework, not a single personal site.
- Keep brand, domain, author, social, CTA, and deployment details configurable.
- Avoid hardcoding owner-specific strings in components, pages, SEO, or generated files.

## Agent Entry Points

- Start with this file for cross-agent project rules.
- Use `docs/playbooks/content-pipeline.md` for content research, series planning, article briefs, teaching edits, human edits, and SEO/GEO optimization.
- Use `content-plans/content-pipeline.yaml` for machine-readable methodology, stages, and quality gates.
- Use `docs/research/agent-friendly-maintenance.md` for why the repo is structured this way for Codex, OpenCode, OpenClaw-like agents, Claude Code, and similar tools.
- Use `docs/research/ai-first-blogger-gap-analysis.md` and `content-plans/ai-first-blogger-roadmap.yaml` before changing platform capabilities, workflow contracts, quality gates, or agent integrations.
- If MCP is available, call `healthcheck`, then `get_workflow_contract`, `get_content_pipeline`, or `get_site_context`.

## Change Discipline

- Prefer small, reviewable changes.
- Do not edit `dist/`, `.astro/`, `node_modules/`, or secrets.
- Do not add real API tokens, emails, private domains, or credentials to the repo.
- Use `src/data/site.ts` for site identity and brand configuration.
- Use `content-plans/site-plan.yaml` for content strategy and editorial planning.
- Do not show navigation links, homepage sections, cards, CTAs, or placeholder copy for content collections that have no published content.
- Do not expose placeholder email, social links, domains, or external channels. Leave them empty and hide dependent UI until real values exist.

## Validation

- Run `pnpm content:validate` after content-workflow artifacts or publishable content change.
- Run `pnpm check` after TypeScript/Astro/content schema changes.
- Run `pnpm build` before claiming deployment readiness.
- For SEO/GEO changes, verify canonical URL, JSON-LD, sitemap, RSS, robots.txt, and llms.txt still build.

## Content Rules

- All publishable content lives under `src/content/**`.
- Use structured frontmatter and descriptive slugs.
- Prefer MDX content that includes definitions, examples, tradeoffs, next steps, and internal links.
- Do not write final articles from a bare topic; create topic research, a series plan, or an article brief first.
- Use Backward Design for series planning, Diátaxis for content type, Cognitive Load Theory for readability, and Worked Examples for technical teaching.
- Remove generic assistant tone. Avoid filler such as 即将更新, 敬请期待, 预留, 占位, 内容资产, 一站式, 赋能, 深度解析 unless explicitly requested.
- Do not publish drafts unless explicitly requested.

## Deployment Rules

- GitHub Actions deploys `release` as staging and `main` as production to Cloudflare Pages.
- Do not bind custom domains or modify DNS unless explicitly requested.
- Use GitHub Secrets for Cloudflare credentials.

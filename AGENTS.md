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
- If MCP is available, call `healthcheck`, then `get_workflow_contract`, `get_content_pipeline`, or `get_site_context`.

## Change Discipline

- Prefer small, reviewable changes.
- Do not edit `dist/`, `.astro/`, `node_modules/`, or secrets.
- Do not add real API tokens, emails, private domains, or credentials to the repo.
- Use `src/data/site.ts` for site identity and brand configuration.
- Use `content-plans/site-plan.yaml` for content strategy and editorial planning.

## Validation

- Run `pnpm check` after TypeScript/Astro/content schema changes.
- Run `pnpm build` before claiming deployment readiness.
- For SEO/GEO changes, verify canonical URL, JSON-LD, sitemap, RSS, robots.txt, and llms.txt still build.

## Content Rules

- All publishable content lives under `src/content/**`.
- Use structured frontmatter and descriptive slugs.
- Prefer MDX content that includes definitions, examples, tradeoffs, next steps, and internal links.
- Do not write final articles from a bare topic; create topic research, a series plan, or an article brief first.
- Use Backward Design for series planning, Diátaxis for content type, Cognitive Load Theory for readability, and Worked Examples for technical teaching.
- Do not publish drafts unless explicitly requested.

## Deployment Rules

- GitHub Actions deploys `release` as staging and `main` as production to Cloudflare Pages.
- Do not bind custom domains or modify DNS unless explicitly requested.
- Use GitHub Secrets for Cloudflare credentials.

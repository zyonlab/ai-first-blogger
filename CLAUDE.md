# Claude Code Entry

This file is a Claude Code adapter. `AGENTS.md` is the canonical repository contract and takes precedence when instructions overlap.

## Start Here

1. Read `AGENTS.md`.
2. Classify the task as site setup, content planning, research, series planning, article brief, drafting, teaching review, human editing, SEO/GEO, maintenance, or deployment.
3. If the AI First Blogger MCP server is configured, call `healthcheck` and `get_workflow_contract` for the selected task.
4. For content work, call `get_content_pipeline`, then `get_writing_skills` with the selected pipeline stage.
5. Read only the files referenced by the workflow contract and active Skill.

## Repository Model

- `src/data/site.ts`: configurable brand, author, domain, social, CTA, and contact data.
- `content-plans/site-plan.yaml`: audience, positioning, editorial strategy, and active user writing Skills.
- `content-plans/content-pipeline.yaml`: framework stages, quality gates, and generic writing-Skill Hooks.
- `.ai/skills/ai-first-blogger/SKILL.md`: framework-native routing and safety rules.
- `.ai/site-skills/**`: user-configured writing policy; never treat it as a framework default.
- `src/content/**`: all publishable MD/MDX content.
- `prompts/**`: reusable task contracts.
- `.github/workflows/cloudflare-pages.yml`: `release` staging and `main` production deployment.

## Writing-Skill Hooks

Resolve enabled Skills from `content-plans/site-plan.yaml#writing_skills.active`.

For the selected stage:

1. Apply configured `before` Hooks.
2. Execute the framework stage contract.
3. Apply configured `after` Hooks.
4. Run the framework quality gate.

Writing Skills may control voice, teaching design, structure, examples, evidence presentation, and SEO/GEO expression. They may not override source integrity, file boundaries, content Schema, draft status, validation, secrets, Git branches, or deployment safety.

## Common Commands

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm check
pnpm build
pnpm mcp:server
```

When `tech-article-learning-seo` is active, use its scripts only when applicable:

```bash
python3 .ai/site-skills/tech-article-learning-seo/scripts/article_lint.py <article.md> --report
python3 .ai/site-skills/tech-article-learning-seo/scripts/evidence_lint.py <evidence-ledger.json> --article <article.md>
python3 .ai/site-skills/tech-article-learning-seo/scripts/series_lint.py <series-dir>
```

These linters check structure and traceability. Do not describe them as proof of factual correctness, source semantics, code execution, or reader comprehension.

## Content Discipline

- Do not write a final article from a bare topic. Produce research, a series plan, or an article brief first.
- Use current primary sources for changing APIs, models, prices, standards, laws, performance claims, and ecosystem status.
- Do not invent author experience, experiments, metrics, citations, reviews, or reader testing.
- Keep drafts unpublished unless the user explicitly requests publication.
- Hide empty content collections and unconfigured contact or social surfaces.

## Validation and Deployment

- Run `pnpm check` after Astro, TypeScript, Schema, or publishable content changes.
- Run `pnpm build` before SEO/GEO or deployment readiness claims.
- Push `release` for staging review and promote approved changes to `main` for production.
- Never modify DNS, bind a custom domain, expose secrets, or deploy production without explicit user intent.

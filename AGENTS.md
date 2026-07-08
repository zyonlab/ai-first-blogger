# AI First Blogger Agent Rules

Scope: entire repository.

## Product Direction
- Treat this repo as a reusable AI-first Astro blog framework, not a single personal site.
- Keep brand, domain, author, social, CTA, and deployment details configurable.
- Avoid hardcoding owner-specific strings in components, pages, SEO, or generated files.

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
- Do not publish drafts unless explicitly requested.

## Deployment Rules
- GitHub Actions deploys `dist/` to Cloudflare Pages.
- Do not bind custom domains or modify DNS unless explicitly requested.
- Use GitHub Secrets for Cloudflare credentials.

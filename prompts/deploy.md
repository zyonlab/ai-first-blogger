# Deploy Prompt

```text
Prepare this AI-first Astro blog for deployment.
Rules:
- Do not touch DNS or custom domains unless explicitly requested.
- Do not expose secrets.
- Run pnpm check, pnpm build, then pnpm validate — the same order CI uses.
  Read validate-report.json; any error blocks the deploy, so fix it first.
- Verify GitHub Actions workflow if present.
- Verify Cloudflare Pages project name and deployment target.
- Summarize the deployed URL and next DNS steps separately.
```

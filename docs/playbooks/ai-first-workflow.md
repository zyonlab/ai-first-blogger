# AI-first Blogger Workflow

## 1. Intake
Use `prompts/site-intake.md` to collect brand, audience, domain, author, social links, content domains, and conversion goal.

## 2. Planning
Use `prompts/content-plan.md` to produce the content pillars, series, article queue, and internal linking strategy.

## 3. Creation
Use `prompts/article-brief.md` before writing a full article. Require search intent, target reader, and conversion goal.

## 4. Optimization
Run the gate first — it decides most of what a manual audit used to:

```bash
pnpm build && pnpm validate
```

Read `validate-report.json`, clear every error, then use `prompts/seo-geo-audit.md`
for the judgement calls a script cannot make (search intent, positioning, whether the
content actually answers the query).

Rules and thresholds: `docs/specs/content-contract.md`.

## 5. Deployment
Use GitHub Actions to deploy to Cloudflare Pages. Do not bind custom domains or edit DNS without explicit approval.

## 6. Maintenance
Weekly: generate new briefs; clear any `pnpm validate` errors.
Monthly: run `pnpm metrics`, act on failing targets (internal link density, orphans,
GEO coverage); refresh old articles.
Quarterly: revisit positioning, navigation, and content pillars.

## The loop

```
generate → pnpm build → pnpm validate → read validate-report.json → fix → repeat
```

The loop ends at 0 errors, not at "looks fine". `validate-report.json` is the
interface; every violation carries a `fix` field written as an instruction.

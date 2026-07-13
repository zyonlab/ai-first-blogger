# Content Pipeline Playbook

The canonical workflow contract is `content-plans/content-pipeline.yaml`. Do not copy its stages, methods, lifecycle states, or quality gates into this playbook.

## Start a Content Task

1. Read `AGENTS.md`, `src/data/site.ts`, and `content-plans/site-plan.yaml`.
2. Read `content-plans/content-pipeline.yaml` and use its current `contract_version`.
3. Run `pnpm content:audit` to inspect artifact and lifecycle state.
4. Create or update one artifact under `content-work/**`.
5. Run `pnpm content:validate` before drafting or publishing.

## Artifact Locations

| Artifact | Directory |
| --- | --- |
| Topic research | `content-work/research/` |
| Series plan | `content-work/series/` |
| Article brief | `content-work/briefs/` |
| Fact ledger | `content-work/facts/` |
| Review report | `content-work/reviews/` |
| Editorial scorecard | `content-work/scorecards/` |
| Content lifecycle | `content-work/workflows/` |

Executable schemas live in `src/content-workflow/schemas.ts`. Content-type requirements live in `content-plans/content-types.yaml`.

`content-plans/author-style.yaml` is optional and user-controlled. When disabled, agents must not infer a personal style. `content-plans/source-policy.yaml` is mandatory for fact ledgers and publication review. `content-plans/editorial-scorecard.yaml` separates automated evidence from accountable human decisions.

## Commands

```bash
pnpm content:new -- <kind> <id> --title "Title" --owner "Owner"
pnpm content:validate
pnpm content:audit
pnpm content:transition -- <workflow-id> <state> --actor "Owner"
```

Use `--dry-run true` with `content:new` or `content:transition` when an agent needs to inspect changes before writing.

## Publishing Contract

Published posts, videos, and case studies require a `workflowId` in frontmatter. The referenced workflow must pass the lifecycle requirements enforced by `pnpm content:validate`.

Before publication, create an `editorial-scorecard` and record a human decision for factual, teaching, writing-style, SEO, and display quality. Machine checks may warn or fail, but they never calculate a publication verdict. Approval requires every human dimension to pass and no unresolved blocking risk.

Do not bypass a failed transition by editing lifecycle state manually. Fix the missing research, brief, evidence, content file, scorecard, or review artifact instead.

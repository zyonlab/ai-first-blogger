# Metrics

`pnpm metrics` measures whether this repo is still a **framework** — reusable by
someone who is not its author — rather than whether the site looks good.

Output: `metrics.json` (latest) and `metrics-history.jsonl` (append-only, trendable).

## Why these three

Everything else is downstream of them:

| | Question | Fails when |
|---|---|---|
| **T1** | Can a stranger rebrand it? | brand, locale or copy is baked into components |
| **T2** | Can a stranger extend it? | a surface is hand-wired to a specific content type |
| **T3** | Can a machine judge the output? | the validation gate is missing or not running |

## Definitions

### T1 — reuse cost

**Value**: number of files under `packages/engine/components/`, `packages/engine/pages/`,
`packages/engine/layouts/`, `packages/engine/lib/`, `packages/engine/config/` containing, *in code*:

- CJK characters (natural-language copy)
- a locale literal (`'zh-CN'`, `'zh_CN'`, …)
- a brand string

Comments and doc blocks are stripped before matching — documentation may name these
strings legitimately.

**The brand strings are read out of `site/site.yaml`** (`name`, `author.email`, the
host of `url`) plus the `name` in `package.json` — they are not a fixed list in the
script. A hardcoded list would keep every fork checking for the *template author's*
brand: the metric would report a perfect 0 while the fork's own brand strings sat
un-detected in component code. The check has to follow whoever owns the site.

**Target**: `0`. **Baseline before this work**: 9.

### T2 — extensibility cost

**Value**: number of places outside `packages/engine/content-types/` that name a specific
collection, i.e. `getCollection('posts')` or `getEntries('posts')`.

Any such call is a surface that will not pick up a newly added content type.

**Target**: `0`. **Baseline before this work**: adding a content type touched 8 files.

Also reported: `contentTypes` (how many are registered) and `registryDriven`.

### T3 — gate coverage

Read from `validate-report.json`:

- `rulesRun` / `rulesTotal` — a rule skipped for a missing `dist/` counts as not run
- `errors`, `warnings`

**Target**: all rules run, `0` errors.

## Content metrics

| Metric | Definition | Target |
|---|---|---|
| `avgInternalLinks` | mean distinct site-internal links per content file | ≥ 3 |
| `minInternalLinks` | worst file | ≥ 2 (rule C-02) |
| `orphanPages` | count of C-04 violations | 0 |
| `geo.coverage` | content types declaring `surfaces.llms` in `site/content-types.yaml` ÷ total | 1.0 |

`geo.coverage` is the GEO metric that matters: a content type absent from `llms.txt`
is invisible to AI summarisers regardless of how well it ranks.

Content files counted here exclude drafts, matching the gate. With no content at all
the link and orphan metrics print `–` rather than `✗`: a fresh fork has nothing to
measure yet, and marking that as a failure makes a correct install look broken.

## Reading the output

```
✓ T1 reuse            0 file(s) block a rebrand (target 0)
✓ T2 extensibility    0 hand-wired surface(s) across 4 content types (target 0)
✓ T3 gate             24/24 rules run, 0 error(s)
✗ internal links      2.68 avg per entry (target ≥3, min 2)
✓ orphan pages        0 (target 0)
✓ GEO coverage        4/4 content types in llms.txt
```

Failing metrics print the offending files, so the output is directly actionable.

## Order of operations

```bash
pnpm build      # T3 and the link metrics need dist/
pnpm validate   # writes validate-report.json
pnpm metrics    # reads it
```

Running `metrics` without a prior `validate` leaves T3 fields null rather than
reporting a false pass.

## Trending

Each run appends one JSON object to `metrics-history.jsonl`. Both files are
generated; add them to `.gitignore` if you would rather not track them, or commit
them to see the numbers move across the repo's history.

## What is deliberately not measured

- **Time to first deploy** — the target is ≤ 30 minutes, but it is measured by
  watching a real person follow [`../getting-started.md`](../getting-started.md), not
  by a script. Treat a failed run as a documentation bug.
- **Traffic and rankings** — outside the repo. This tool measures whether the site is
  *structurally capable* of ranking, not whether it does.

## Related

- [`content-contract.md`](./content-contract.md)
- [`validation-pipeline.md`](./validation-pipeline.md)

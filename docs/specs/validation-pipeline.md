# Validation Pipeline

How `pnpm validate` is built, and how to extend it.

The *rules* it enforces are specified in
[`content-contract.md`](./content-contract.md). This document covers the machinery.

## Why it exists

This is the difference between "we wrote prompts" and "we built an AI-first system".
An agent can generate an article; without a gate, only a human can say whether the
result is publishable. The gate turns that judgement into an exit code, so generation
can run unattended and failures come back as structured, actionable data.

## Layout

```
packages/cli/src/validate/
  index.ts          orchestrator, reporter, exit code
  self-test.ts      proves every rule still fires
  collect.ts        reads content/** (drafts excluded) and dist/**
  html.ts           meta/title/canonical/JSON-LD/link extraction, displayWidth
  types.ts          Rule, Violation, RuleContext
  url.ts            engine-relative paths, for the rules that count URL segments
  rules/
    content.ts      source-only rules   (C-02, C-08, C-09, C-11)
    seo.ts          built-HTML rules    (C-01, C-05, C-06, C-07, C-10)
    links.ts        link-graph rules    (C-03, C-04)
    theme.ts        theme-layer rules   (C-12, C-13)
    onpage.ts       site-wide on-page   (C-14 … C-23)
    links-source.ts authored links      (C-25, no build needed)
    typography.ts   zhlint, zh-* only   (C-24)
```

## Data model

```ts
type RuleContext = {
  entries: SourceEntry[];   // parsed content/**/*.mdx, with frontmatter line numbers
  pages: BuiltPage[];       // parsed dist/**/*.html, with site-absolute URLs
  hasBuild: boolean;
  siteOrigin: string;
  mount: string;            // where the engine was mounted; '' at the origin root
};

type Rule = {
  id: string;               // 'C-02'
  title: string;
  severity: 'error' | 'warn';
  needsBuild?: boolean;     // skipped, and recorded as skipped, when dist/ is absent
  run: (ctx: RuleContext) => Violation[] | Promise<Violation[]>;
};

type Violation = {
  rule: string;
  severity: 'error' | 'warn';
  file: string;             // repo path, or a URL for dist-based rules
  line?: number;
  message: string;          // what is wrong
  fix: string;              // what to do — written as an instruction
};
```

`fix` is mandatory. A report an agent cannot act on without re-deriving intent is
not a gate, it is a complaint.

### Line numbers

`collect.ts` records the line of every top-level frontmatter key, so a violation
about `slug` points at the `slug:` line rather than the file.

## Reading built HTML with regex

`html.ts` uses regular expressions rather than a parser. This is acceptable because
the only input is our own Astro output — never third-party markup. If the pipeline
ever ingests external HTML, replace it with a real parser first.

## Skipped ≠ passed

Rules marked `needsBuild` are skipped when `dist/` is missing, listed in the console
output, and recorded as `rulesSkipped` in the report. `pnpm metrics` reports
`rulesRun / rulesTotal` for the same reason: a suite that quietly stops checking
half its rules must not look like a green run.

The same reasoning covers two more cases, both reported rather than hidden:

- **Drafts** are removed by `collectEntries()` before the rules see them, and counted
  as `draftsSkipped`. They never build, so publishability rules cannot apply — and an
  unfinished file must not be able to block the deploy of everything else.
- **Zero content** satisfies every content rule vacuously. The run prints a notice and
  `contentFiles: 0` instead of presenting itself as a clean bill of health.

## Self-test

```bash
pnpm validate:self-test
```

For each rule, a synthetic context that **must** trip it and one that **must not**.
Both directions are asserted — a rule that fires on everything is as broken as one
that never fires.

C-12 and C-13 read real trees instead of a fixture — `site/themes/`, `site/templates/`, and
the installed `aifb-engine`, located by module resolution so it is found whether it sits
in `packages/` or `node_modules/`. Finding no violations there proves nothing on its own,
so each also reports how many files it read and answers a planted violation.

## CI wiring

```yaml
- run: pnpm check      # types
- run: pnpm build      # produces dist/
- run: pnpm validate   # blocks deploy on any error
- run: wrangler pages deploy dist
```

`validate` sits between `build` and `deploy`: building is cheap (~1.3s), and several
rules can only inspect the built output.

## Agent workflow

`AGENTS.md` requires an agent to run `pnpm build && pnpm validate` after changing
content and to clear every error before claiming completion. The loop is:

```
generate → build → validate → read validate-report.json → fix → repeat until errors = 0
```

`validate-report.json` is the interface. Do not parse the console output.

## Adding a rule

See [`content-contract.md#adding-a-rule`](./content-contract.md#adding-a-rule).
The short version: document it, implement it, add a self-test case, keep the
self-test green.

## Borrowing a mature tool

C-24 wraps [`zhlint`](https://github.com/zhlint-project/zhlint) rather than
reimplementing Chinese typography. It qualifies because it is a *rule*, not a
judgement: deterministic, offline, milliseconds, same answer every run. Anything
that fails those four tests belongs outside the gate.

That is why Lighthouse is a separate job (`pnpm audit:seo`) and why an LLM
reviewer would be too: the moment the gate needs a network call or can answer
differently twice, `validate-report.json` stops being an interface and becomes
an opinion.

## Known gaps

- **No external link checking.** Deliberate: it makes CI depend on third-party uptime.
  A separate scheduled job is the right home for it.
- **No image weight or dimension checks.** C-01 verifies the format, not that the file
  exists at the right size. Worth adding when per-entry OG images arrive.
- **No accessibility rules.** Contrast and landmark checks belong here eventually;
  they need a DOM, which means a real parser first.

## Related

- [`content-contract.md`](./content-contract.md)
- [`metrics.md`](./metrics.md)

# SEO/GEO Audit Prompt

The gate already decides most of what a manual audit used to. Run it first, then
spend the audit only on what a script cannot judge.

```text
Audit this Astro blog for SEO and GEO readiness.

Step 1 — run the gate, do not re-do it by hand:

  pnpm build && pnpm validate && pnpm analyze
  pnpm context status      # merges both reports and flags stale ones

Read validate-report.json. It already covers, with a `fix` for every violation:
- og:image presence and format         (C-01)
- internal link floor                  (C-02)
- dead internal links, orphan pages    (C-03, C-04)
- title and description length         (C-05, C-06)
- canonical origin                     (C-07)
- heading hierarchy                    (C-09)
- breadcrumb schema vs. rendered page  (C-10)
Clear every error before continuing. Do not report these as audit findings —
report only that the gate is green.

Step 2 — audit what the gate cannot decide:
- Does each page serve one clear search intent, and does the copy answer it?
- Is the description a sentence that earns a click, or padding that clears C-06?
- Thin or duplicate coverage: two pages competing for the same query.
- Does the opening paragraph answer directly, before the explanation? (GEO)
- Do the topic/series structures match how a reader would actually search?
- Is the JSON-LD *true* — does Article/VideoObject describe what is on the page?
- Author, contact and social presence: credible, or placeholder?

Also run `pnpm analyze` and read content-report.json for AI-flavour signals
(template scaffolding, noun lists, no first-hand experience, no trade-offs).
Treat the score as a pointer to paragraphs worth rewriting, not as a verdict.

Return prioritized fixes with file paths. Only edit files after I approve.
```

# Article Brief Prompt

```text
Create an MDX article brief for this Astro content system.

First run `pnpm context write`. It gives you the voice, the valid categories and
series, every constraint the gate enforces, and the list of pages that exist and
can be linked to. Do not read site/*.yaml for this — and do not invent an
internal URL, use one from that list.

Input: topic, target reader, search intent, conversion goal.
Output:
- title
- description
- slug
- category
- tags
- outline with H2/H3
- key definitions
- examples/code/diagrams needed
- internal links to existing posts/topics/series
- FAQ or self-check questions
- GEO-friendly direct answer block

Constraints the gate will enforce (exact thresholds come from `pnpm context write`,
they are configurable in site/policy.yaml):
- filename must equal the slug              (C-08)
- category must exist in site/taxonomy.yaml
- a minimum of distinct site-internal links (C-02)
- no H1 in the body, no skipped levels      (C-09)
- description within the configured width   (C-06)

After approval, write the MDX file under content/posts/, then:

  pnpm check && pnpm build && pnpm validate

Read validate-report.json and clear every error before reporting completion.
Then run `pnpm analyze <file>` and rewrite whatever it flags as template
scaffolding, noun-list sentences, or missing trade-offs. Set `draft: true`
while the article is unfinished — drafts are neither built nor gated.
```

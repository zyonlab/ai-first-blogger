# Article Brief Prompt

```text
Create or update one article-brief artifact.

Canonical contract: content-plans/content-pipeline.yaml
Executable schema: articleBriefSchema in src/content-workflow/schemas.ts
Content-type requirements: content-plans/content-types.yaml
Optional user-approved writing style: content-plans/author-style.yaml
Required source policy: content-plans/source-policy.yaml
Artifact directory: content-work/briefs/

Require an existing topic-research artifact. Use a series-plan only when the article belongs to a real series.
Do not draft the MDX article until the brief is approved through the content workflow.
Apply writing-style preferences only when enabled is true. Do not infer author experience or fabricate examples.
Run pnpm content:validate and return unresolved inputs plus the next allowed lifecycle transition.
```

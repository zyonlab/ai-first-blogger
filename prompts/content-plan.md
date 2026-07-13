# Content Planning Prompt

```text
Plan content using the canonical contract at content-plans/content-pipeline.yaml.

Read content-plans/site-plan.yaml and run pnpm content:audit.
Create topic-research artifacts for unverified opportunities and series-plan artifacts only for teachable sequences with a clear reader outcome.
Use src/content-workflow/schemas.ts and content-plans/content-types.yaml. Do not create final articles from planning output.
Run pnpm content:validate and return created artifacts, assumptions, missing evidence, and the next ready work item.
```

# Content Pipeline Prompt

```text
Run one stage of the AI First Blogger content workflow.

Canonical contract: content-plans/content-pipeline.yaml
Executable schemas: src/content-workflow/schemas.ts
Content-type contract: content-plans/content-types.yaml
Optional user-approved writing style: content-plans/author-style.yaml
Required source policy: content-plans/source-policy.yaml
Artifact root: content-work/

Read the current contract_version and run pnpm content:audit before choosing work.
Create or update the matching structured artifact. Do not skip lifecycle requirements or copy the contract into another file.
Apply the writing-style file only when enabled is true. Never infer personal experience. Use the source policy for every fact ledger.
Run pnpm content:validate after artifact changes. Run pnpm check and pnpm build when publishable content or site output changes.

Return the selected work item, files changed, unresolved inputs, validation result, and the next allowed lifecycle transition.
```

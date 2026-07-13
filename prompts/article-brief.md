# Article Brief Prompt

```text
Create an MDX article brief for this Astro content system.
Input: topic, target reader, search intent, conversion goal.
Use content-plans/content-pipeline.yaml for methodology and docs/playbooks/content-pipeline.md for output contracts.
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
- notes for whether this article should make any navigation, series, topic, or homepage section visible

After approval, write the MDX file under src/content/posts/ and run pnpm check.
```

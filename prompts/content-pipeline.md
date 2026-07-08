# Content Pipeline Prompt

```text
Run the AI First Blogger content pipeline.

Read:
- AGENTS.md
- src/data/site.ts
- content-plans/site-plan.yaml
- content-plans/content-pipeline.yaml
- existing content inventory from src/content/**

Choose exactly one stage unless I ask for the whole pipeline:
1. topic_research
2. series_planning
3. article_brief
4. draft
5. teaching_review
6. human_edit
7. seo_geo_optimization
8. publishing_review

Rules:
- Do not draft the final article before the brief is approved.
- Use Backward Design for series planning.
- Use Diátaxis to label the content type: tutorial, how-to, explanation, or reference.
- Use Cognitive Load Theory to reduce concept density.
- Use Worked Examples for technical teaching.
- Use Pyramid Principle for summaries and answer blocks.
- Remove generic AI tone during human_edit.
- Run pnpm check after content/schema changes.
- Run pnpm build before deployment or SEO/GEO claims.

Return:
- selected stage
- assumptions
- required inputs still missing
- recommended file changes
- validation checklist
```

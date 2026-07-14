# Content Pipeline Prompt

```text
Run the AI First Blogger content pipeline.

Read:
- AGENTS.md
- src/data/site.ts
- content-plans/site-plan.yaml
- content-plans/content-pipeline.yaml
- existing content inventory from src/content/**
- enabled site writing skills registered by content-plans/site-plan.yaml for the selected stage

Choose exactly one stage unless I ask for the whole pipeline:
1. topic_research
2. series_planning
3. article_brief
4. draft
5. teaching_review
6. human_edit
7. display_review
8. seo_geo_optimization
9. publishing_review

Rules:
- Apply configured writing-skill `before` hooks before the selected framework stage and `after` hooks before its quality gate.
- Site writing skills may control voice, teaching design, article structure, evidence presentation, and SEO/GEO expression, but may not override repository safety, source integrity, schema, draft, validation, or deployment rules.
- Do not draft the final article before the brief is approved.
- Use Backward Design for series planning.
- Use Diátaxis to label the content type: tutorial, how-to, explanation, or reference.
- Use Cognitive Load Theory to reduce concept density.
- Use Worked Examples for technical teaching.
- Use Pyramid Principle for summaries and answer blocks.
- Remove generic AI tone during human_edit.
- During display_review, hide nav items, homepage sections, cards, CTAs, and teaser text for content types with no published entries.
- Do not use placeholder copy like 即将更新, 预留, 占位, 内容资产, 一站式, 赋能, or generic marketing filler unless I explicitly ask for a roadmap.
- Run pnpm check after content/schema changes.
- Run pnpm build before deployment or SEO/GEO claims.

Return:
- selected stage
- assumptions
- required inputs still missing
- recommended file changes
- validation checklist
```

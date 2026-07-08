# Content Pipeline

Use this pipeline when an agent plans a content system, designs a series, writes a technical article, edits an existing article, or optimizes SEO/GEO.

## Why this exists

One-shot article generation produces generic structure, repeated claims, and weak teaching. This project uses staged contracts so agents can pause, verify assumptions, and improve content deliberately.

## Stages

1. **Topic research**: reader problem, search intent, sources, competitor patterns, missing angle.
2. **Series planning**: reader outcome, learning path, article sequence, difficulty curve, internal links.
3. **Article brief**: title, description, slug, outline, definitions, examples, diagrams, FAQ, direct answer block.
4. **Draft**: useful MDX first version from the approved brief.
5. **Teaching review**: reduce cognitive load, add worked examples, improve sequence.
6. **Human edit**: remove AI tone, add judgment, constraints, tradeoffs, and edge cases.
7. **SEO/GEO optimization**: metadata, entities, definitions, FAQ, internal links, schema readiness.
8. **Publishing review**: validation, staging branch, deployment notes.

## Methods

- **Backward Design**: define what the reader can do after the series or article.
- **Diátaxis**: classify each article as tutorial, how-to, explanation, or reference.
- **Cognitive Load Theory**: split dense ideas and introduce terms before using them.
- **Worked Examples**: teach with complete examples, annotated code, before/after diffs, and failure cases.
- **Scaffolding**: order series from guided foundation to independent judgment.
- **Pyramid Principle**: answer first, then support with reasons, examples, and tradeoffs.

## Agent Flow

1. Load `AGENTS.md`.
2. If MCP is available, call `get_content_pipeline`.
3. Call `get_content_inventory` before proposing series or internal links.
4. Select one pipeline stage unless the user explicitly asks for the full pipeline.
5. Return assumptions and missing inputs before writing files.
6. Validate with `pnpm check`; run `pnpm build` for SEO/GEO, layout, MCP, or deployment changes.

## Output Contracts

### Series Plan

```yaml
series_title:
reader_outcome:
audience_level:
articles:
  - title:
    intent:
    content_type:
    reader_job:
    prerequisites:
    examples_needed:
    internal_links:
```

### Article Brief

```yaml
title:
description:
slug:
category:
tags:
search_intent:
reader_job:
content_type:
direct_answer:
outline:
  - h2:
    reader_job:
    h3:
definitions:
examples:
diagrams:
faq:
internal_links:
seo_geo_notes:
```

### Human Edit

```yaml
removed_ai_tone:
added_judgment:
added_constraints:
added_tradeoffs:
remaining_risks:
```

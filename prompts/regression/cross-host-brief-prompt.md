Return exactly one JSON object and no Markdown fence or explanation.

Create an approved AI First Blogger article-brief for this topic:

为什么 AI First Blogger 需要可执行内容合同，而不只是提示词

Use these exact fixed fields:

- schemaVersion: `1.0.0`
- id: `cross-host-regression-brief`
- owner: `host-regression`
- createdAt: `2026-07-11T00:00:00.000Z`
- updatedAt: `2026-07-11T00:00:00.000Z`
- kind: `article-brief`
- status: `approved`
- topicResearchId: `cross-host-regression-research`
- targetReader: `维护技术博客的开发者`
- searchIntent: `理解为什么内容工作流需要结构化合同和发布门禁`
- conversionGoal: empty string
- contentType: `explanation`
- slug: `why-ai-first-blogger-needs-executable-contracts`
- category: `ai-engineering`

Also include:

- a concrete Chinese title and description
- 2 to 4 non-empty tags
- an optional directAnswer
- an outline containing at least two H2 items; H3 items are optional
- at least two definitions
- at least one concrete example
- internalLinks as an array
- FAQ as an array, which may be empty

Allowed keys are only:

`schemaVersion`, `id`, `title`, `owner`, `createdAt`, `updatedAt`, `kind`, `status`, `topicResearchId`, `seriesPlanId`, `targetReader`, `searchIntent`, `conversionGoal`, `contentType`, `description`, `slug`, `category`, `tags`, `directAnswer`, `outline`, `definitions`, `examples`, `internalLinks`, `faq`.

Outline items use `{ "level": 2 or 3, "heading": string, "readerJob": string }`.
Definitions use `{ "term": string, "definition": string }`.
Examples use `{ "type": string, "purpose": string }`.
FAQ items use `{ "question": string, "answerGoal": string }`.

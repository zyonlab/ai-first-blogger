# Taxonomy

`site/taxonomy.yaml` is the single source of truth for topics, series and the
category vocabulary. Changing what a site is *about* means editing this one file.

## Why it is one file

The category list previously existed twice: as a `z.enum([...])` in the collection
schema and as a `TopicSlug` union in a separate TypeScript file. The two drifted — the enum
had eight values, the union had six — and nothing detected it, because neither was
derived from the other.

Categories are now **derived** from the topic map. Duplication is impossible.

## Structure

```yaml
pillars:
  foundations:
    name: Foundations
    goal: 解释核心概念，建立主题权威度。

topics:
  frontend-architecture:
    title: Frontend Architecture
    description: …          # used on the topic page, cards and llms.txt
    pillar: foundations     # must be a key of `pillars`
  notes:
    title: Notes
    description: …
    pillar: opinions
    listed: false           # valid category, but no page and hidden from listings

series:
  vue-internals:
    title: …
    description: …
    topic: vue-react-internals   # must be a key of `topics`
```

### Titles and descriptions in another language

On a site with `locales:` declared, a topic or series may carry an `i18n:` block:

```yaml
topics:
  llm-reliability:
    title: 可靠性与降级
    description: 模型会超时、会改主意、会编。
    pillar: foundations
    i18n:
      en-US:
        title: Reliability and fallbacks
        description: The model times out, changes its mind, and makes things up.
```

Only `title` and `description` are copy. The slug, the `pillar`, `listed` and
which entries belong to a topic are **structure and are the same in every
language** — a topic translated in one language and not another is one topic
showing its default title on that page, not a second topic.

A topic page is built for a language that has at least one entry in it, so a topic
whose three articles are all in Chinese has no English page rather than an empty
one. Untranslated copy is reported by C-31, not by a build failure. See
[`i18n.md`](./i18n.md).

### `listed: false`

A catch-all bucket such as `notes` or `career` is a legitimate category but does not
deserve a topic page competing for the same queries as real topics. `listed: false`
keeps it valid for content while removing it from `/topics/`, the home page and
`llms.txt`. `categoryLabel()` still resolves its display name.

## Derived exports

| Export | Meaning |
|---|---|
| `categorySlugs` | every valid `category` value; content schemas validate against it |
| `seriesSlugs` | every valid `series` value |
| `topicList` | listed topics only — for pages and listings |
| `allTopicList` | every topic including unlisted — for label lookup |
| `seriesList` | every series with its slug |
| `isCategory` / `isSeries` | runtime guards used by the zod schemas |
| `categoryLabel(slug)` | display name, falling back to the slug |

## Pillars

A pillar is the strategy a group of topics serves. It used to live in a separate
`content-plans/site-plan.yaml` that **no code read**: an agent would treat it as
binding and be wrong. Pillars now live beside the topics that implement them, and
a pillar owning no topic is a build error — strategy and site cannot drift apart
because they are the same file.

## Runtime validation, not a TypeScript enum

Content schemas use `z.string().refine(isCategory)` rather than `z.enum([...])`.

The trade: a bad category is caught at build time with a message listing the valid
values, instead of at type-check time. In exchange, a site owner changes the taxonomy
by editing data — never a type definition. For a fork-and-own template that is the
right side of the trade.

## Self-validation

`taxonomy.ts` throws at build time if:

- a series references a topic that does not exist
- a topic slug is not kebab-case

The error names the offending key, so the fix needs no debugging.

## Changing the taxonomy for a new site

1. Replace the `pillars` entries with your own strategy.
2. Replace the `topics` entries; each `pillar` must be one of your pillar keys.
3. Replace the `series` entries; each `topic` must be one of your topic keys.
4. Update `category` in existing content, or delete the sample content.
5. `pnpm check && pnpm build` — invalid categories fail with the valid list.

No other file changes. Verified by `pnpm metrics` (T1).

## Relationship to content types

Taxonomy is orthogonal to content types. `category` and `series` are just frontmatter
fields; any content type that declares them participates in topic and series pages
automatically, because those pages query across the whole registry with
`findEntries()`. Posts and case studies both appear on topic pages today for exactly
this reason.

## Related

- [`site-config-contract.md`](./site-config-contract.md)
- [`../adr/0001-content-type-registry.md`](../adr/0001-content-type-registry.md)

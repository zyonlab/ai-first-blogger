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

tags:                       # optional, and keyed by the *name* articles write
  重试:
    slug: retries           # the URL segment. Required for a name with no ASCII
    title: 重试与退避        # optional; defaults to the name itself
    description: …          # optional; the archive's own prose
```

### Where the archives live: `routes`

Optional. The three archives are served at `/topics/`, `/series/` and `/tags/`
unless the site says otherwise:

```yaml
routes:
  tags: tag        # /tag/{slug}/  — Ghost's shape, so a migration keeps its URLs
  topics: topic
```

The **key** stays canonical everywhere else: `engine({ pages: ['tags'] })`,
`site/pages.yaml`, and an href written as `/tags/` in `site.yaml` all keep
saying `tags`. Only the URL segment moves, and both halves of an archive move
together — `/tag/` and `/tag/{slug}/`, never one without the other.

Two archives cannot resolve to the same segment, and none of them can take a
segment the engine already serves (`/about/`, `/rss.xml`, …). Both fail the
build by name.

Moving a prefix is a URL change like any other: links already written into
articles still point at the old one, and the gate reports them (C-25/C-03).
Add the old URLs to `site/redirects.yaml` if they were ever public.

### What an archive can say about itself

Topics, series and tags all accept the same optional block. `title` and
`description` are what the page **displays**; these are what it tells a search
engine and a share preview, which are allowed to disagree with the headline.

```yaml
topics:
  llm-reliability:
    title: 可靠性与降级        # the <h1>
    description: …            # the paragraph under it
    pillar: foundations

    metaTitle: …              # the <title>, when the name is the wrong length
    metaDescription: …
    ogTitle: …                # the social card, written for social
    ogDescription: …
    ogImage: /og/topic.png
    twitterTitle: …           # each falls back to its og:* twin
    twitterDescription: …
    twitterImage: …
    heroImage: /hero.png      # an image for the archive itself
    heroImageAlt: …
    canonical: …              # must stay on this origin — rule C-07
    noindex: true             # keep a thin archive out of the index
```

Every field optional, and an archive that declares none renders byte-for-byte
what it rendered before. Shared across the three because an archive is an
archive: they go through the same layout and sit next to each other in the
sitemap, so a tag that could set its OG image while a topic could not would be
a difference nobody chose.

Ghost's `tags` table carries this same column set, and `pnpm migrate:ghost`
hands it over — see [migrating from Ghost](../recipes/migrate-from-ghost.md).
Its one column with no home here is `accent_color`: colour on this site comes
from a theme, so that every value is one somebody chose and both modes account
for it (rules C-12 and C-13, [theming](./theming.md)).

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

## Tags are the taxonomy that comes from the content

Topics and series are planned: a site decides them, and an article picks one of
each. Tags arrive the other way round — an article writes `tags: [重试, 延迟]`
and the vocabulary is whatever the articles say it is. Three consequences, and
all three are why `tags:` in this file looks different from `topics:`.

**The key is a name, not a slug.** `topics.llm-reliability` is a URL; `tags.重试`
is what somebody typed. So `slug` is a field here rather than the key.

**Declaring a tag is optional.** A name that is already kebab-case gets its
archive with no entry in this file at all — `agent-runtime` becomes
`/tags/agent-runtime/`, titled with its own name. That is what makes the
taxonomy work the moment a Ghost export lands, before anyone has planned it.

**A name with no ASCII in it has no address.** `重试` reduces to an empty slug,
and rule C-19 requires every URL segment to be lowercase kebab-case, so there is
no honest URL to invent. Those tags render as plain text and the build names
each one:

```
[aifb] 3 tag(s) in zh-CN have no URL and render as plain text: 重试, 延迟, 成本.
Give each one a slug in site/taxonomy.yaml under `tags:` — e.g. `重试: { slug: retries }`.
```

A warning rather than a failure, deliberately: failing would stop every existing
zh-* site from deploying the day it upgrades, for a feature it did not ask for.
Silence was the old behaviour and is what this change exists to end.

**An archive exists only where there are entries.** `getActiveTags` counts per
locale, the same way `getActiveTopics` does, so a tag used only in Chinese has no
English page to advertise over `hreflang`. The `/tags/` index itself is a fixed
page like `/topics/` — always published while `tags` is in `engine({ pages })`,
showing its empty state when there is nothing to list. Link it from `nav:` or
decline it; a published page nothing links to is rule C-04.

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

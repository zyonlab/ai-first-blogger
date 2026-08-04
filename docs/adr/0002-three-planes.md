# ADR 0002 — Three planes: intent, content, engine

**Status**: accepted · **Date**: 2026-08-02 · **Supersedes**: the `src/data/` configuration layer

## Context

The previous layering split the repository along **configuration vs. code**, and
`pnpm metrics` (T1) measured it as "can a stranger rebrand this without opening
`src/components/`". That axis was chosen for a human forking a template.

It does not answer the questions an operating agent actually has:

1. Am I allowed to change this value?
2. If I get it wrong, who tells me?
3. Who decides the rest — a machine, or a person?

Sorting by "does a new owner edit this file" produced three concrete problems:

- **Files that straddle planes.** `site.ts` held brand copy (a judgement call)
  next to `themeStorageKey` and `og.default` (engine plumbing).
  `content-types/*.ts` held list copy, a zod schema and JSON-LD builders — three
  different owners in one file.
- **No home for thresholds.** `titleMaxWidth`, `descriptionMinWidth` and
  `minInternalLinks` are neither brand nor mechanism: the engine has a sensible
  default and a site may reasonably disagree. With only two categories they
  became constants inside the validation scripts, so the values a site is most
  likely to tune were the ones it could only tune by editing the framework.
- **Intent nothing consumed.** `content-plans/site-plan.yaml` described
  audience, pillars and SEO principles. No code read it. An agent would read it,
  treat it as binding, and be wrong — a plan with no enforcement is worse than
  no plan, because it looks like one.

## Decision

Three planes, divided by **who decides and who checks**, not by file type.

| Plane | Location | Contains | Wrong values caught by |
|---|---|---|---|
| **Intent** | `site/` | What the site is about, for whom, in what voice, called what | Build-time validation naming the key and the fix |
| **Content** | `content/` | The published material | `pnpm validate` (24 rules, after the planning preflight) |
| **Mechanism** | `engine/` | Components, pages, lib, scripts, i18n | Types and tests |

The test for which plane a value belongs to:

> **Intent** — a different owner would choose differently, and there is no
> correct answer.
> **Policy** — the engine has a defensible default, but a site may disagree.
> Lives in `site/policy.yaml`, and every override is reported.
> **Mechanism** — there is one correct implementation; editing it only breaks it.

### The intent plane is YAML and Markdown, not TypeScript

This is the part that makes the boundary hold. A `.yaml` file **cannot contain
an import, a component or a conditional**, so intent cannot slowly acquire
mechanism the way `site.ts` did. It is the same technique as rule C-13 (no
colour literals outside `site/themes/`): enforce the boundary structurally
rather than by convention.

```
site/
  site.yaml            brand, author, social, theme choice, static nav
  taxonomy.yaml        pillars, topics, series — the category vocabulary
  content-types.yaml   route, labels, surfaces per content type
  policy.yaml          thresholds and switches, all with engine defaults
  pages.yaml           copy for the static pages
  voice.md             writing style — frontmatter for scripts, prose for agents
  themes/*.css         the token sets
```

The cost is literal types: `TopicSlug` was a union derived from the topic map
and is now `string`, validated at runtime by `isCategory`. `docs/specs/taxonomy.md`
had already made this trade when it dropped `z.enum` in favour of data a site
owner can edit; this extends it consistently.

### Content types are declared in two halves

`site/content-types.yaml` owns route, labels and surfaces.
`packages/engine/content-types/<name>.ts` owns schema, JSON-LD and components.
A type present in only one half fails the build **naming the missing side** —
the failure that once shipped case-studies as four orphan pages.

### Every plane failure names the fix

`site/` is parsed by `packages/engine/config/`, which validates and refuses to build on:
an unknown pillar, a series pointing at a missing topic, a pillar that owns no
topic, a route colliding with a static page, a non-raster OG default, an
unparseable URL, a theme with no CSS file, a locale with no message table.

## Consequences

**Better**

- One rule for an agent: *intent → `site/`; content → `content/`; never touch
  `engine/`.* It replaces five contract documents and has no exceptions.
- Thresholds are configurable without forking the engine, and overrides are
  visible in the report, so a green run says which numbers it was green against.
- Writing style became data: `site/voice.md` drives `pnpm analyze`, so the
  analyser no longer encodes one person's taste in one language.
- Strategy is checked. Pillars live with the topics they own, and a pillar with
  no topics is a build error rather than a document nobody reads.
- T1's brand strings come from `site/site.yaml`, so the metric follows whoever
  owns the site instead of checking for the template author's name.

**Worse**

- Literal types are gone from the taxonomy (see above).
- Vite does not watch files outside `srcDir`, so `site/` is wired into the dev
  server's watcher by a small plugin in `astro.config.mjs`.
- Node scripts cannot import `packages/engine/content-types/*.ts` (they pull in
  `astro:content`). Scripts read `site/content-types.yaml` instead, which is
  authoritative because both halves are checked against each other at build.
- Adding a locale still means adding a file under `packages/engine/i18n/`. Shipped
  translations are part of the product; only the *choice* of locale is intent.

## Related

- [`0001-content-type-registry.md`](./0001-content-type-registry.md)
- [`../specs/site-config-contract.md`](../specs/site-config-contract.md)
- [`../specs/content-contract.md`](../specs/content-contract.md)

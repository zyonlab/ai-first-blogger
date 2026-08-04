# ADR 0004 — what a template override may import

**Status**: accepted · **Date**: 2026-08-04 · **Builds on**: [0002](./0002-three-planes.md)

## Context

`site/templates/` lets a site replace any component, layout, card or page. That
is the one place where **user files depend on the engine's internals** — the
only reverse edge in an otherwise one-way architecture:

```astro
---
// site/templates/pages/[type]/index.astro
import PageLayout from '@layouts/PageLayout.astro';
import { itemListSchema, breadcrumbSchema } from '@lib/schema';
import { registry, listPath } from '@content-types/index';
---
```

It is necessary. The alternative is telling a site that replacing a page means
hand-assembling its JSON-LD and `<head>`, which guarantees the gate will reject
whatever it produces.

But it is currently a promise nobody made. Those aliases are internal paths.
Nothing marks them as public, nothing tests them from a site's point of view,
and a refactor of `lib/schema.ts` would break override files with no warning —
the workspace site does not use them, so `pnpm build` stays green.

An override layer without a stated API is a layer that works until the first
refactor and then makes the framework look unreliable.

## Decision

**A short list of imports is public API, covered by semver. Everything else in
the engine is internal and may change in a patch release.**

Public:

| Import | For |
|---|---|
| `@layouts/BaseLayout.astro` · `@layouts/PageLayout.astro` | the `<head>`, the shell, the breadcrumb trail |
| `@components/cards/card-props` | the `CardProps` type every card takes |
| `@config/site` · `@config/taxonomy` · `@config/nav` · `@config/policy` · `@config/voice` | the intent layer, already loaded and validated |
| `@content-types/index` — `registry`, `getContentTypeByRoute`, `listPath`, `entryPath` | routing and iteration over declared types |
| `@lib/content` — `getEntries` | entries of a type, sorted and draft-filtered |
| `@lib/schema` — `breadcrumbSchema`, `collectionPageSchema`, `itemListSchema` | the JSON-LD C-10 and C-23 expect |
| `@lib/dates` — `formatDate` | dates in the site's locale |
| `@lib/renderers` — `cardFor`, `detailFor` | dispatching to the merged card set |

Internal — importable, but not promised:

`@i18n/*`, `@lib/*` beyond the rows above, every component that is not a card,
and the shape of anything inside `@content-types/<name>.ts`.

## Why draw it here

The public list is exactly **what a page override needs in order to pass the
gate**. C-01/C-05/C-06/C-07 want the `<SEO>` head, which is `BaseLayout`'s job;
C-10 wants a rendered breadcrumb; C-22 wants an `ItemList` whose count matches;
C-23 wants JSON-LD beyond the trail. A site cannot satisfy those and also be
denied the helpers that produce them.

Anything beyond that list is a convenience the engine happens to expose, and
convenience is not worth freezing.

## Consequences

- The list goes in [`../specs/templates.md`](../specs/templates.md) next to the
  rules an override must satisfy — the two halves of the same contract.
- Renaming or changing the signature of a public import is a **minor** bump at
  minimum while on `0.x`, and a major one after `1.0`.
- The examples are the regression test: `examples/indie-ai-builder` overrides a
  page, a card and a component, and `pnpm test:scenarios` builds every example.
  If a refactor breaks a public import, an example stops building.
- Wanting to promote something to public is not a problem — it is a signal that
  the override layer is short a capability. `listLayout` is the worked example:
  a site replaced a whole page to change one class, and the right fix was to
  move the decision into `site/content-types.yaml`, not to bless more imports.

## Alternatives rejected

**Everything is public.** Freezes the engine's internal shape at 0.x, which is
the version range that exists precisely so it can still move.

**Nothing is public; overrides get a slot API instead.** A slot API is the right
long-run answer for *components*, but it cannot serve page overrides — a page
that needs different JSON-LD needs the schema helpers, not a slot. It also has
to be designed against real demand, and there is one real case so far.

**Copy the helpers into `site/templates/` at scaffold time.** Removes the
dependency and replaces it with a fork: the copy stops receiving fixes, which is
[ADR 0003](./0003-workspace.md)'s whole complaint about fork-and-own.

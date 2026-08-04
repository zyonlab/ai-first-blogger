# ADR 0001 — Content type registry

**Status**: accepted · **Date**: 2026-07-29 · **Supersedes**: hand-wired per-type pages

## Context

Adding a content type meant editing eight files:

```
content.config.ts            collection + schema
packages/engine/lib/content.ts               getPublishedX() helper
site/site.yaml                  navigation entry
packages/engine/pages/<type>/index.astro     list page
packages/engine/pages/<type>/[slug].astro    detail page
packages/engine/pages/llms.txt.ts            llms.txt section
packages/engine/pages/index.astro            home section
packages/engine/components/XCard.astro       card
```

Seven of those eight are boilerplate; only the card is real work. The cost was not
just typing — it was that **forgetting one file produced a silent defect**. This
actually happened: `case-studies` shipped without a nav entry, a home section or an
`llms.txt` section, so every case study was an orphan page with zero inbound links,
invisible to crawlers and to AI summarisers alike.

A framework whose extension path is "remember to edit these eight places" is not a
framework.

## Decision

A content type is declared **once**, in `packages/engine/content-types/<name>.ts`, and every
surface derives from that declaration.

```ts
export default defineContentType({
  name: 'tutorials',        // collection name == content/tutorials/
  route: 'tutorials',       // /tutorials/ and /tutorials/<slug>/
  label: 'Tutorial',
  listTitle: 'Tutorials',
  listDescription: '…',
  card: 'TutorialCard',     // packages/engine/components/cards/TutorialCard.astro
  detail: 'TutorialDetail', // packages/engine/components/details/TutorialDetail.astro
  schema: z.object({ … }),
  jsonLd: (entry, { canonical }) => [ … ],
  seo: (entry) => ({ … }),
  surfaces: {               // where it appears — omitting a surface means "not there"
    nav: 45,
    home: { limit: 3, order: 35 },
    rss: true,
    llms: { limit: 6 },
    sitemap: true,
  },
})
```

Register it with one line in `packages/engine/content-types/index.ts`.

### Consumers

| Surface | Derives from |
|---|---|
| `content.config.ts` | `registry.map(...)` over `schema` |
| `packages/engine/pages/[type]/index.astro` | one dynamic route for every list page |
| `packages/engine/pages/[type]/[slug].astro` | one dynamic route for every detail page |
| `site/site.yaml` | `navTypes`, merged with static entries by `order` |
| `packages/engine/pages/index.astro` | `homeTypes` |
| `packages/engine/pages/rss.xml.ts` | `rssTypes` |
| `packages/engine/pages/llms.txt.ts` | `llmsTypes` |
| `/topics/<slug>/`, `/series/<slug>/` | `findEntries(registry, …)` across all types |

### Component resolution by name

Cards and details are resolved with `import.meta.glob` in `packages/engine/lib/renderers.ts`
rather than an import map, so a new component is picked up by dropping the file in
place. A missing component throws at build time with the available names listed.

## Consequences

**Good**

- Adding a content type touches 1 registry file + 1 content directory (+ card/detail
  components if the type needs a new visual treatment — that is real work, not
  boilerplate). Measured as T2 by `pnpm metrics`; target 0 hand-wired surfaces.
- Orphan sections become structurally impossible to create by omission: `surfaces` is
  explicit, and C-04 catches anything still unreachable.
- Taxonomy pages aggregate across every type carrying a `category`, so a topic page
  now surfaces posts *and* case studies. Previously it only showed posts.

**Costs**

- `entry.data` is typed as `Record<string, any>`; each def narrows it at the point of
  use. Per-type inference was traded away for a uniform registry. The zod schema plus
  C-11 provide the actual guarantee.
- Static routes must not collide with a type's `route`. Enforced by a reserved-route
  list in the registry's self-validation.
- One extra indirection to read: a page's behaviour lives in its content type file,
  not the route.

**Rejected alternatives**

- *Keep per-type pages, add a checklist* — the failure mode was forgetting, and a
  checklist does not fail the build.
- *Publish as an npm package* — a real upgrade path, but a larger change than the
  fork-template distribution this project has chosen. Revisit if upgrade friction
  becomes the top complaint.

## Verification

```bash
pnpm metrics   # T2 extensibility: 0 hand-wired surfaces
pnpm validate  # C-04: 0 orphan pages
```

Walkthrough: [`../recipes/add-content-type.md`](../recipes/add-content-type.md).

# Template overrides

A site can replace any part of the engine's markup by putting a file of the same
name under `site/templates/`. This is the WordPress/Ghost child-theme idea, with
one difference that matters.

## The hierarchy

```
site/templates/
  components/<Name>.astro    shadows packages/engine/components/<Name>.astro
  cards/<Name>.astro         shadows (or adds to) the card set
  details/<Name>.astro       shadows (or adds to) the detail set
  layouts/<Name>.astro       shadows BaseLayout / PageLayout
  pages/<route>.astro        replaces an injected route at the same URL
```

Nothing to register. A file that exists wins; a file that does not falls through
to the engine. `templatesDir` in `astro.config.mjs` moves the directory.

```astro
---
// site/templates/components/Footer.astro — replaces the engine's footer
import { site } from '@config/site';
---
<footer><p>— {site.author.name} —</p></footer>
```

Cards and details are merged by name, so `site/templates/cards/TimelineCard.astro`
both **adds** a card a content type can point at and, if it is called
`ArticleCard.astro`, **replaces** the shipped one.

## Before overriding a page, check the intent layer

The first site to want one entry per row replaced the whole list page — 68 lines
of which 44 were the engine's `getStaticPaths` and JSON-LD, copied verbatim, to
change one class name. It did not need to:

```yaml
# site/content-types.yaml
posts:
  listLayout: stack     # grid · grid two · stack
  listTagCloud: false
```

The registry is `{ ...engineType, ...siteType }` and `site/content-types.yaml`
is spread in whole, so anything the engine's content-type module sets can be
overridden from the intent layer. **An override that only changes a value is a
copy that will rot.** Reach for `site/templates/` when the *markup* has to
differ, not when a setting does.

If the value you want has no name yet, that is a gap in the intent layer worth
reporting — not a reason to copy a page.

## Why tokens were not enough

`site/themes/*.css` can change every colour, size and measure. It cannot move the
byline, drop a section, or change what a card shows — and that is the second
thing every site owner wants. A theme layer that can only recolour is a theme
layer people work around.

## The difference from a CMS

In WordPress a bad theme silently ruins the SEO of every page, and you find out
from traffic. Here the gate does not care who wrote the markup:

```
site/templates/pages/index.astro   # a page that skips BaseLayout

C-01 Usable Open Graph image  /   No og:image.
C-07 Same-origin canonical    /   No canonical link.
C-16 Exactly one H1           /   No H1 on the page.
```

Three errors, build blocked. **You can replace anything; you cannot quietly break
the contract.** That is what makes an override layer safe to hand to people —
not restricting what they can change, but checking the result the same way
regardless of who produced it.

## What an override still has to satisfy

The rules that constrain markup, and what they expect:

| Rule | Expects |
|---|---|
| C-01 · C-05 · C-06 · C-07 | the `<SEO>` head — easiest kept by rendering through `BaseLayout` |
| C-10 | a rendered `<Breadcrumbs />` wherever `BreadcrumbList` schema is emitted |
| C-16 | exactly one `<h1>` |
| C-17 | an `alt` on every `<img>` |
| C-21 | prose of its own on a listing page, not only cards |
| C-22 | the ItemList members inside `<section data-item-list>` |
| C-23 | JSON-LD beyond the breadcrumb trail on a detail page |

The shortest safe path for a page override is to keep `BaseLayout` and replace
what is inside it. Replacing the layout too is allowed — it just means taking
over the head, and the gate will tell you what you dropped.

## What an override may import

An override is the one place a site's files depend on the engine's, so the
engine states which of its imports are promises. These are covered by semver;
everything else may change in a patch.

```ts
'@layouts/BaseLayout.astro'   '@layouts/PageLayout.astro'
'@components/cards/card-props'                       // the CardProps type
'@config/site' '@config/taxonomy' '@config/nav' '@config/policy' '@config/voice'
'@content-types/index'        // registry · getContentTypeByRoute · listPath · entryPath
'@lib/content'                // getEntries
'@lib/schema'                 // breadcrumbSchema · collectionPageSchema · itemListSchema
'@lib/dates'                  // formatDate
'@lib/renderers'              // cardFor · detailFor
```

The list is not arbitrary: it is **exactly what a page override needs in order
to pass the gate**. C-01/C-05/C-06/C-07 want the head that `BaseLayout` renders,
C-10 wants a breadcrumb, C-22 an `ItemList` that matches, C-23 JSON-LD beyond
the trail. A site cannot be held to those rules and denied the helpers that
satisfy them.

Not promised: `@i18n/*`, anything in `@lib/*` beyond the rows above, components
that are not cards, and the internals of a content type module.

Reasoning, and what to do when the list feels short:
[`../adr/0004-template-api.md`](../adr/0004-template-api.md).

## Precedence

```
site/templates/<kind>/<name>   →  packages/engine/<kind>/<name>
```

Three different mechanisms, because three different things resolve the import:

| Kind | Redirected by |
|---|---|
| `pages/` | `injectRoute` — the site's file is the entrypoint for that URL |
| `cards/`, `details/` | the `virtual:aifb/renderers` merge, by filename |
| `components/`, `layouts/` | `resolve.alias` with a `customResolver`, plus a plugin for relative sibling imports |

The last row is the one that bit. It was first written as an `enforce: 'pre'`
Vite plugin matching `@components/…`, on the assumption that `pre` runs before
aliases. It does not: Vite applies `resolve.alias` ahead of *every* user plugin,
so the plugin never saw the id, and `site/templates/components/Header.astro` was
silently ignored while the build log still reported the site's page overrides.
The redirect therefore has to live on the alias entry itself.

Two ids reach the same component and both are covered:

```
@components/Header.astro    the alias entry's customResolver
./ThemeToggle.astro         a pre plugin — relative ids are not aliased
```

An override importing its own sibling by relative path gets the **engine's**
copy, not itself. That is what makes `site/templates/components/Header.astro`
able to `import ThemeToggle from '@components/ThemeToggle.astro'` and get the
shipped one.

Overrides are counted in the build output:

```
[aifb-engine] 15 route(s) injected, 2 overridden by site/templates/pages
```

Three scenarios in `pnpm test:scenarios` hold this down — a component override
reaching the page, a page override reaching the URL, and a head-less override
being stopped by the gate. A silent no-op is the failure mode this layer has
already had once; only an end-to-end assertion catches it.

## Related

- [`theming.md`](./theming.md) — the token layer, for when markup does not need changing
- [`content-contract.md`](./content-contract.md) — the rules an override must still satisfy
- [`../adr/0003-workspace.md`](../adr/0003-workspace.md) — why the engine is a package at all

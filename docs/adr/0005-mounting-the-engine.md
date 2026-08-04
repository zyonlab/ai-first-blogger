# ADR 0005 — mounting the engine under a prefix

**Status**: accepted · **Date**: 2026-08-04 · **Builds on**: [0002](./0002-three-planes.md)

## Context

The engine assumed it was the whole site. `collectRoutes()` walked `pages/` and
injected the tree at the origin root, so installing it into an Astro site that
already existed produced:

```
/  /404  /robots.txt  /rss.xml  /llms.txt
/about  /uses  /newsletter  /work-with-me
/topics/*  /series/*  /<type>/*
```

The first three collide head-on with any host site. The next four are pages the
host did not ask for. `EngineOptions` had no way to say either thing.

That is the difference between "a blog generator" and "a blog you can add to a
site", and it blocked a real one: a bilingual marketing site that wanted its
articles under `/zh/blog/` and already served `/`, `/404`, `/robots.txt`,
`/privacy/` and a whole `/zh/*` tree of its own.

Content type routes were never the problem. `route:` is configurable in
`site/content-types.yaml`, and `pages/[type]/index.astro` enumerates statically
via `getStaticPaths`, so it never greedily matched a host route.

## Decision

**`engine({ mount, pages })`. The prefix is applied in exactly one function, and
two routes are not moved but dropped.**

```js
engine({
  mount: '/zh/blog',           // default '/', byte-identical to 0.2.2
  pages: ['topics', 'series'], // whitelist of the fixed pages; default all
})
```

### One chokepoint

`withMount()` in `packages/engine/config/routes.ts` is the only place a mount is
applied, and `listPath()` / `entryPath()` in the content type registry are the
only place a content type becomes a URL. Everything else — canonicals,
breadcrumb and `ItemList` JSON-LD, the RSS item links, `llms.txt`, the cards, the
header and footer — calls one of those.

A prefix sprinkled across thirty components is a prefix that will be missing from
one of them, and a missing prefix is not a crash. It is a canonical pointing at a
page nobody built, or a sitemap entry that 404s: the failure class this project's
gate exists to catch, arriving through the one door the gate cannot see behind.

At `mount: '/'` the helper is the identity function, which is why the default is
byte-identical rather than merely equivalent — proven by diffing the built output
against a build of `main`.

### `/404` and `/robots.txt` are not mounted — they are not injected

A `robots.txt` is only read at the origin root, and a 404 route under a prefix
cannot be what a host serves for an unknown URL. Emitting
`/zh/blog/robots.txt` would be worse than emitting nothing: a file that looks
like it does something and does not. Under a mount both belong to whoever owns
the origin, and the engine says nothing about them.

### `pages` decides whether a URL exists; `site/templates/pages/` decides who renders it

A page excluded by `pages` is not injected **even when the site provides its own
file** at that path. The alternative — an override quietly re-creating a URL the
whitelist removed — makes the whitelist advisory, and "I took it off the list and
it is still there" is not a state anyone should have to debug.

The file is not silently ignored either: the build warns, naming the file and the
two ways out (add the page to the whitelist, or move the file to the site's own
`src/pages/`, where it is the site's route and the mount does not move it).

### Copy is required only for pages that are published

`site/pages.yaml` was a bare `readYaml<PagesConfig>` cast: every key mandatory by
accident, a missing one blowing up mid-render with `undefined is not an object`.
The integration now asks `pageCopyProblems()` for the pages it is about to
inject — skipping any the site renders with its own template — and fails before
the build with the file, the key and both fixes.

### The gate reads the mount from the build, not from the config

`pnpm validate` runs in its own process and never loads `astro.config.mjs`. The
build writes `.aifb/build.json` (mount + published pages) next to `dist/`, and
the rules that count URL segments subtract the mount via `validate/url.ts`.

Without this, C-04, C-10, C-19, C-21, C-22, C-23 and C-25 do not fail — they
stop matching. `pnpm validate:self-test` now runs 14 mounted cases; with the
subtraction removed, six of them go wrong, four as false positives and two as
rules that silently check nothing.

## Consequences

- Sites upgrade with no changes. `mount` defaults to `'/'`, `pages` to all.
- Under a mount, three things a *site* writes are still literal paths, on
  purpose:
  - **Links inside articles.** The engine does not rewrite markdown. On a
    mounted site most root-relative links belong to the host, and guessing which
    are the engine's would break the rest. C-03 catches a link that forgot the
    prefix and now says which URL it should have been.
  - **`site/redirects.yaml` targets.** `from` is a URL that existed in the past;
    making `to` magic while `from` is literal would be a coin flip. The build
    already refuses a target it did not produce.
  - Anything in `site/site.yaml` that is *not* an engine route — a nav entry
    pointing at the host's `/privacy/` stays exactly as written.
- What *is* rewritten from the intent layer: nav entries and hero actions that
  name a route this engine injects. A site writes `/topics/`, gets
  `/zh/blog/topics/`, and never spells the mount out.
- Declining a page removes it from the chrome too — the footer, the end-of-article
  CTA, the home page's taxonomy sections and `llms.txt`. A page a site does not
  publish must not be linked from its own footer.
- The engine still owns one root page. `pages` cannot decline `/`, `/rss.xml` or
  `/llms.txt`: a mounted engine with no root has no landing page and every
  breadcrumb trail points at a 404.
- `@config/routes` joins the public import list in
  [`../specs/templates.md`](../specs/templates.md), extending
  [ADR 0004](./0004-template-api.md) by one row rather than changing it. An
  override that renders a link to an engine page needs the same helper the
  engine uses, for the same reason it needs `@lib/schema`: it is held to the
  gate's rules, so it cannot be denied what satisfies them.

## Rejected alternatives

- **`base` in `astro.config`.** Astro's `base` moves the whole site, including
  the host's own pages, and rewrites asset URLs with it. The host site is not
  ours to move.
- **A prefix argument threaded through every component.** Thirty call sites, each
  one able to forget, and nothing failing when one does.
- **Prefixing `robots.txt` and `404` anyway, for symmetry.** Symmetry is not the
  goal; being read is. Both files only work at the origin.
- **Rewriting root-relative links inside content.** Cannot distinguish the
  engine's routes from the host's without guessing, and guessing wrong hijacks
  the host's links.
- **Putting the mount in `site/site.yaml`.** It is a fact about where the package
  is installed, not about the site's identity — and the site that needs it is the
  one whose `astro.config.mjs` already installs the engine.

## Verification

```bash
pnpm test:scenarios       # six mount scenarios, driving engine({ mount }) in the real config
pnpm validate:self-test   # 14 mounted-engine rule cases
```

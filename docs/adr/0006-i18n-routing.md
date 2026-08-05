# ADR 0006 — publishing one site in more than one language

**Status**: accepted · **Date**: 2026-08-05 · **Builds on**: [0002](./0002-three-planes.md), [0005](./0005-mounting-the-engine.md)

## Context

`i18n/` made the engine locale-*neutral*: one message table per language, one
language per site, picked by `site.locale`. That is a translation layer for the
chrome — "7 min read", "Skip to content" — and it was never routing:

```js
export const activeLocale = isSupportedLocale(site.locale) ? site.locale : DEFAULT_LOCALE;
```

A site that wants to publish the same blog in two languages needs something
else, and the shape is not in dispute. Astro's own i18n routing does it, every
static-site generator does it, and Google documents it: **the default language
at the root, every other language behind a prefix.**

```
/            /writing/       /topics/x/      the default language
/zh/         /zh/writing/    /zh/topics/x/   every other one
```

The one requirement that is easy to state and easy to get quietly wrong:
**not every entry exists in every language.** An article written only in Chinese
must not produce an English page. If it does, that page is empty or — worse —
renders the Chinese text under an English URL, and the `hreflang` tag beside it
tells a crawler this is the English version of a real article. That is a soft
404 with a reference from the page it is impersonating. It builds green, passes
every rule this project had, and is only visible from outside the build.

`mount` shipped in 0.3.0 and is the reason this could be a small change: there
was already exactly one function that turned an engine concept into a URL.

## Decision

**Locales are declared in `site/site.yaml`. The default locale keeps the root,
the others get a prefix, and the prefix is applied inside the mount by the same
chokepoint the mount uses.**

```yaml
locale: zh-CN        # unchanged meaning: the default locale, served at the root
locales:             # new, optional. Absent ⇒ single language, exactly as before.
  zh-CN: zh
  en-US: en
```

### 1. Mount outside, locale inside

`withLocale(path, locale)` in `packages/engine/config/routes.ts` is the
composition, and it is the only place that knows the order:

```ts
withLocale(path, locale) === withMount(`${localePrefix(locale)}${path}`)
```

```
engine({ mount: '/blog' }), default zh-CN, also en-US at 'en'

/blog/       /blog/writing/       zh-CN
/blog/en/    /blog/en/writing/    en-US
```

The order is forced, not chosen. The mount is a fact about the **host's** URL
space — the host decided the engine lives at `/blog`, and it may already serve
`/en/` for pages of its own that this engine will never see. Putting the locale
prefix outside the mount would have the engine claim `/en/blog/`: inventing a
URL in a namespace it was given no authority over, colliding with the host's own
translation of everything else.

The other direction of the same rule, stated because it is the mistake this
repository will actually see: a site whose *host* is bilingual and mounts a
single-language engine at `/zh/blog/` is doing what 0.3.0 already supported and
should **not** also declare `locales`. The language is already in the mount;
declaring it twice is how you get `/zh/blog/zh/`.

Everything that emits a URL — canonicals, breadcrumb and `ItemList` JSON-LD, RSS
item links, `llms.txt`, cards, nav, `hreflang` — goes through `withLocale`, or
through `listPath()` / `entryPath()` in the registry, which are built from it.
Same rule as 0005, one segment deeper.

The read side is `localeOfPath(Astro.url.pathname)`. A component asks its own
URL which language it is rendering. The obvious alternative — a module-level
"current locale" — is not safe: a static build renders pages concurrently
through one module registry, so a mutable global is a page rendering in whichever
language finished last. The other alternative, threading a `locale` prop through
every component, is the thirty-call-sites problem 0005 rejected, and the call
site that forgets produces a correct-looking page with the wrong `lang`.

### 2. Locales are an intent fact, so they live in `site/`

`mount` is in `engine()` because it is a fact about where the package was
installed. Which languages a site publishes is not that — it is the same kind of
decision as its topics, its voice and its brand, and ADR 0002 puts those in
`site/`. It also has to be readable by the tools that never load
`astro.config.mjs`: `pnpm context`, `pnpm validate`, the readiness check.

The default locale still declares a prefix it never uses in a URL. `hreflang`
and `@astrojs/sitemap`'s `i18n.locales` both need a key for it, and a value that
exists in two shapes — declared for one purpose, invented for another — is a
disagreement nobody can see.

### 3. `site.locale` keeps its name and its meaning

It meant "the language this site publishes in". It now means "the language this
site publishes at the root", which for every existing site is the same sentence.

**The migration path for a 0.3.0 site is: nothing.** Omit `locales` and the site
is single-language, no prefix is ever applied, no `hreflang` is emitted, and the
built output is byte-identical — proven below, 145/145 files.

Adding a language is three steps: add `locales`, put the translated files in
`content/<type>/<prefix>/`, and add `i18n:` blocks for the copy. The gate then
tells you what is left: C-31 names every page still showing the default
language's words, C-03 names any nav entry or hero action pointing at a section
that language does not have.

### 4. A translation is a file in a directory, and `translationKey` pairs them

```
content/posts/why-retries-made-it-worse.mdx      the default language
content/posts/en/retries-made-it-worse.mdx       en-US
```

The directory is the URL prefix, so where a translation lives on disk is where
it lives in the URL. `locale:` in frontmatter overrides the path for the file
that needs to contradict it; neither is required, and a file with neither is in
the default language — which is every file in every site that exists today.

`translationKey` defaults to `slug`. A translation that keeps its slug is paired
with no field at all. It is set on the translation whose slug is localised too,
which is the case worth doing: `/en/writing/why-retries-made-it-worse/` is not
the URL an English article deserves.

Both fields are added to every content type's schema in one place
(`content.config.ts`), not written into each type. A content type is two halves
and one of them ships inside `node_modules`: if `locale` had to be declared per
type, a site could not translate a type whose engine module it cannot edit.

This forced one related fix. Astro's glob loader derives an entry's `id` from
`data.slug` when the frontmatter has one — and every content type here requires
one — so `content/posts/x.mdx` and `content/posts/en/x.mdx` were *the same id*,
and the loader's documented answer to that is to overwrite one with the other.
The shipped default silently deleted the article being translated. The id is now
the path.

### 5. Copy is localised by an `i18n:` block on any mapping in `site/`

One rule, stated once, applied by every loader:

```yaml
llm-reliability:
  title: 可靠性与降级
  i18n:
    en-US:
      title: Reliability and fallbacks
```

Mappings merge key by key so a locale states only what differs; lists and
scalars replace, because half-translating a nav bar by index is not a thing
anyone means. It works in `site.yaml`, `taxonomy.yaml`, `pages.yaml` and
`content-types.yaml` — hero copy, topic and series titles, static-page copy, and
a content type's labels.

What is **not** localised, deliberately: a topic's slug, its pillar and its
membership; a content type's `route`. Those are structure, and one route per
type keeps `/writing/` and `/en/writing/` parallel, so a page's translation is
derivable from its own URL rather than from a lookup table.

A locale that translates nothing renders the default language's copy. That
fallback is deliberate and it is *visible*: an English About page reading in
Chinese is obvious to anyone who opens it, and C-31 reports it. An empty one
would be a soft 404 nobody sees.

The rejected alternative was a parallel `site/en-US/` directory holding whole
copies of `taxonomy.yaml` and `pages.yaml`. Duplicated config drifts on
everything that is *not* copy — a topic's `pillar`, a type's `route` — and
nothing notices until a page exists in one language only.

### 6. A page is built for a language that has something to put in it

- A **detail page** exists where its file exists. One `getStaticPaths` emits one
  path per entry, so the asymmetry falls out of the routing instead of having to
  be enforced afterwards.
- A **listing, topic or series page** exists in a language with at least one
  entry — the rule `getActiveTopics()` already applied to topics, applied per
  language.
- A **fixed page** (`/about/`, `/uses/`, …) exists in every declared language. It
  is copy, and a site that declares a language is claiming to serve its About
  page in it.
- **`/404` and `/robots.txt`** get no prefix, the same two routes the mount
  leaves alone and for the same reason: a host serves one 404 and a crawler
  reads one robots.txt.

The default language keeps its empty sections and empty listing pages, because
that is what every earlier version did: a declared type with nothing in it yet is
the site's own section standing ready. A *second* language's empty section is
not that — it is a section nobody has translated.

`hreflang` follows from the same sets, never from "take the path and put every
prefix in front of it". A page that exists in one language emits no `hreflang`
at all: a lone self-referential tag tells a crawler nothing it did not know, and
a tag pointing anywhere else would be the defect this whole ADR is about.

### 7. Two languages of one article are not duplicate content

C-14 and C-15 would have failed a bilingual site on every page it translated,
and a rule that fails on correct work is a rule that gets switched off by the
first person it annoys. They now skip a pair that declares itself a translation.

The signal is the reciprocal `hreflang` pair, not a filename convention and not
a frontmatter field, because it is the same claim the crawler reads: two pages
that do not tell Google they are translations *are* duplicates, and the rule
should still say so.

"Not a duplicate" is not allowed to become "not checked", so the exemption
arrives with two new rules:

- **C-30** (error) — every `hreflang` points at a page this build produced,
  every set includes the page carrying it, every pair is reciprocal, and
  `x-default` names a member of the set.
- **C-31** (warn) — two pages in a `hreflang` set, in different languages, with
  the same `<title>`: the copy was never translated. A warning because
  translating copy lands after routing does, and a section should be able to go
  live before every string in it has.

Both are silent on a single-language site.

The URL-shape rules — C-04, C-10, C-19, C-21, C-22, C-23 — subtract the locale
prefix the way 0005 taught them to subtract the mount. C-08 makes slug
uniqueness per language (the same slug in two languages is the *point*) and adds
the collision that does matter: two entries in one language claiming one
`translationKey`. C-25 resolves an authored link against the language it points
into. C-03 recognises the dead link a translated site actually produces — a nav
entry or hero action naming a section that language has nothing in — and says
so.

## Consequences

- **Single-language sites are unchanged, byte for byte.** No prefix, no
  `hreflang`, no `[...locale]` segment, and the route patterns are literally the
  ones 0.3.0 injected.
- **`homePath`, `rssPath` and `llmsPath` are functions now**, not constants.
  `homePath` → `homePath(locale)`. An override still using the constant is a
  type error naming the line, which is the loud version of the failure; the
  quiet version — keeping the constant beside the function — is an override that
  renders a Chinese link on every English page and builds green.
- **A page override needs `getStaticPaths` once a site declares a second
  locale.** `export const getStaticPaths = localeStaticPaths` — because the
  route becomes dynamic. Astro refuses to build a dynamic route with no paths,
  so this fails loudly. On a single-language site nothing changes, which is why
  the segment is added conditionally rather than always.
- **The sitemap's `i18n` option pairs only URLs that are identical apart from
  the prefix.** `@astrojs/sitemap` reads the locale out of the first path
  segment, so it pairs the roots, the listings and the fixed pages, and cannot
  pair an article whose English slug differs from its Chinese one. That article
  is paired by the `<link rel="alternate">` tags in its head, which Google
  documents as an equivalent signal rather than an additional one. Under a mount
  the option does nothing at all — the first segment is the mount — and the
  build says so rather than leaving it inert and unmentioned.
- **`sitemapOptions()` is a new export**, spread into the site's own
  `sitemap()`. The sitemap integration stays the site's: a preview build drops
  it and a host site may already have one, so the engine answers only the
  question that requires reading `site.yaml`.
- **Links inside articles are still literal paths**, as under a mount and for
  the same reason. A Chinese article linking `/en/writing/x/` is making a
  deliberate cross-language link, and C-25 checks it against the English
  entries.
- **Adding a language costs an `i18n:` block per file that carries copy.** The
  alternative was making every locale mandatory-complete, which turns adding a
  language into a cliff.
- `@config/routes` gains `withLocale`, `localeOfPath`, `localeStaticPaths` and
  `locales` on the public import list in
  [`../specs/templates.md`](../specs/templates.md).

## Rejected alternatives

- **A locale subdirectory in the engine's `pages/` tree** (`pages/[locale]/…`),
  or one injected route per locale. Injecting the same route once per prefix
  gives every prefix the same `getStaticPaths` output — an English URL for every
  Chinese article, which is exactly the defect. An optional rest parameter is
  what lets one `getStaticPaths` emit one path per entry.
- **Prefixing the default locale too** (`/zh/` and `/en/`, nothing at the root).
  Cleaner to implement and worse to own: every existing URL moves, the root
  becomes a redirect, and no existing site can upgrade without a redirect map.
  It is also not what Astro, Next, Hugo or Google's own guidance describe.
- **Inferring `hreflang` from the locale list.** "Take the path and put every
  prefix in front of it" is one line and is the soft-404 machine. The set has to
  come from what exists.
- **Pairing translations by path** (`content/posts/en/x.mdx` ↔
  `content/posts/x.mdx`). Forces the translation to keep the original language's
  slug, which is the one thing a translated URL should not do.
- **A parallel `site/<locale>/` config directory.** Two copies of every
  structural fact, drifting silently. See decision 5.
- **Putting `locales` in `engine()` beside `mount`.** It is not a fact about
  where the package is installed; it is a fact about the site, and the tools
  that never load astro.config need to read it.
- **Translating routes** (`/writing/` → `/en/articles/`). Breaks the parallel
  structure every other part of this design leans on, for a benefit nobody
  asked for. An entry's *slug* is localisable, which is where it matters.

## Verification

```bash
pnpm validate:self-test   # 22 translated-site rule cases, plus mount × locale
pnpm test:scenarios       # 7 locale scenarios driving site.yaml and the real build
```

The single-language guarantee is a file-by-file hash comparison of `dist/`
against a build of `main`: 145 files, 145 identical.

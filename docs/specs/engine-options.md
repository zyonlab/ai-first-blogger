# Engine options

Everything `engine()` takes, in `astro.config.mjs`. A site that is only a blog
needs none of them.

```js
import { engine, sitemapOptions } from 'aifb-engine';

export default defineConfig({
  integrations: [
    mdx(),
    sitemap(sitemapOptions()),
    engine({
      cloudflare: true,               // emit _redirects and _headers
      themesDir: 'site/themes',       // where the token files live
      templatesDir: 'site/templates', // where markup overrides live
      mount: '/',                     // where the engine lives in the URL space
      pages: undefined,               // which fixed pages to publish; default all
    }),
  ],
});
```

| Option | Default | What it decides |
|---|---|---|
| `cloudflare` | `true` | Emit `_redirects` and `_headers` at the end of the build. Turn it off for a host that reads neither. |
| `themesDir` | `'site/themes'` | Where the site keeps its theme token files. |
| `templatesDir` | `'site/templates'` | Where the site keeps markup overrides — see [templates.md](./templates.md). |
| `mount` | `'/'` | The prefix every injected route lives under. |
| `pages` | all | Whitelist of the fixed pages: `about`, `newsletter`, `series`, `topics`, `uses`, `work-with-me`. |

There is one export beside `engine()`. `sitemapOptions()` returns what
`@astrojs/sitemap` needs to know about the site's languages — `{}` until
`site/site.yaml` declares more than one, so `sitemap(sitemapOptions())` is
`sitemap()` for every site that has not. The sitemap integration stays the
site's: a preview build drops it and a host site may already have one, so the
engine answers only the question that requires reading `site.yaml`. See
[i18n.md](./i18n.md).

**Languages are not an option here.** Which languages a site publishes is an
intent fact and lives in `site/site.yaml`, not in `astro.config.mjs` — `mount` is
about where the *package* was installed, and that is a different kind of
decision. [ADR 0006](../adr/0006-i18n-routing.md) has the argument.

## Installing into a site that already exists

```js
engine({
  mount: '/zh/blog',
  pages: ['topics', 'series'],
})
```

produces

```
/zh/blog/                  the engine's root
/zh/blog/writing/          list page of each content type
/zh/blog/writing/<slug>/   detail pages
/zh/blog/topics/*  /zh/blog/series/*
/zh/blog/rss.xml   /zh/blog/llms.txt
```

and injects **no** `/`, `/404` or `/robots.txt`. Those three are facts about the
origin, so under a mount they belong to whoever owns it — the engine does not
emit them at a prefix where nothing would read them. Why, at length:
[ADR 0005](../adr/0005-mounting-the-engine.md).

Everything the engine emits carries the prefix: canonicals, `og:url`, breadcrumb
and `ItemList` JSON-LD, sitemap entries, RSS item links, `llms.txt`, and every
link in the header, footer and cards.

Assets do not move, and should not: `/_astro/…`, `/favicon.svg` and everything
in `public/` are served from the origin root, which is where the host site
serves its own. Moving those is Astro's `base`, a different decision about a
different thing.

### What the site still writes out in full

Three things belong to the site rather than the engine, and none of them is
rewritten:

| Where | Under `mount: '/zh/blog'`, write |
|---|---|
| links inside articles | `/zh/blog/writing/my-post/` |
| `site/redirects.yaml` → `to:` | `/zh/blog/writing/my-post/` |
| `site/site.yaml` → anything pointing at the **host's** pages | `/privacy/`, untouched |

A link in an article that forgot the prefix is caught by rule C-03, which names
the URL it should have been. A redirect target the build did not produce fails
the build, as it always has.

### What is rewritten

Nav entries and hero actions in `site/site.yaml` that name a route the engine
injects. A site writes `/topics/` and gets `/zh/blog/topics/`; it never has to
spell the mount out, and changing `mount` does not mean editing the intent layer.

An href that is *not* an engine route is left exactly as written — that is how a
mounted site keeps linking to the host's own pages from the same nav.

## Declining a page

`pages` is a whitelist of the six fixed pages. Anything not listed is not
injected, at any URL.

```js
engine({ pages: ['topics', 'series'] })   // no /about/, /uses/, /newsletter/, /work-with-me/
```

- **Its copy stops being required.** `site/pages.yaml` needs a key only for the
  pages the site publishes. A published page with no copy fails *before* the
  build, naming the key.
- **Its links disappear with it** — footer, end-of-article CTA, the home page's
  topic and series sections, `llms.txt`. A page the site does not publish is not
  linked from its own chrome.
- **An override does not bring it back.** `site/templates/pages/uses.astro` is
  ignored — with a warning — when `uses` is not in the list. `pages` decides
  whether a URL exists; `templatesDir/pages/` decides who renders one that does.
  To serve your own page at that URL, put it in the site's own `src/pages/`,
  where it is the site's route and the mount does not move it.

The root page, `/rss.xml`, `/llms.txt` and the content type routes are not
governed by `pages`. A content type is declined by removing it from
`site/content-types.yaml`.

## A mount and a second language together

Mount outside, locale inside:

```
engine({ mount: '/blog' }) + locales: { zh-CN: zh, en-US: en }

/blog/       /blog/writing/       zh-CN
/blog/en/    /blog/en/writing/    en-US
```

The mount is where the *host* put the engine, and the host may already serve
`/en/` for pages of its own. The engine partitions the space it was given rather
than claiming a new one.

The other direction is the one to watch: a site whose host is already bilingual
and mounts a single-language engine at `/zh/blog/` is doing what 0.3.0 supported
and should **not** also declare `locales`. The language is in the mount already,
and declaring it twice produces `/zh/blog/zh/`.

## What the gate does with it

`pnpm validate` runs in its own process and does not read `astro.config.mjs`. The
build records the mount **and the locales** in `.aifb/build.json`, and the rules
that read meaning out of URL shape — C-04, C-10, C-19, C-21, C-22, C-23, C-25 —
measure from the engine's root in its own language rather than from the origin.
`AIFB_MOUNT` overrides the mount when driving the rules by hand.

Verified by `pnpm validate:self-test` (14 mounted cases and 22 translated ones,
each asserting a rule still fires or still stays quiet, plus the mounted *and*
translated composition) and by the scenarios in `pnpm test:scenarios`, which
drive the real option through `astro.config.mjs` and the real `locales:` through
`site/site.yaml`.

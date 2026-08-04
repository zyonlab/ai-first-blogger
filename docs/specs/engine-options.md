# Engine options

Everything `engine()` takes, in `astro.config.mjs`. A site that is only a blog
needs none of them.

```js
import { engine } from 'aifb-engine';

export default defineConfig({
  integrations: [
    mdx(),
    sitemap(),
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

## What the gate does with it

`pnpm validate` runs in its own process and does not read `astro.config.mjs`. The
build records the mount in `.aifb/build.json`, and the rules that read meaning
out of URL shape — C-04, C-10, C-19, C-21, C-22, C-23, C-25 — measure from the
engine's root rather than the origin's. `AIFB_MOUNT` overrides it when driving
the rules by hand.

Verified by `pnpm validate:self-test` (14 mounted cases, each asserting a rule
still fires or still stays quiet) and by the mount scenarios in
`pnpm test:scenarios`, which drive the real option through `astro.config.mjs`.

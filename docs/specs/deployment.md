# Deployment

Static output to Cloudflare Pages, deployed by GitHub Actions after the gate passes.

Cloudflare Pages is the only target the framework ships. That is a deliberate
scope choice, not an oversight — see [Other hosts](#other-hosts).

## Pipeline

```
push to main        install → config check → check → build → validate → deploy → lighthouse
pull request        install → config check → check → build(preview) → validate → deploy preview
```

`validate` sits between build and deploy, so an error never reaches production.
It runs the planning preflight first: an unplanned site cannot deploy at all.

Lighthouse runs only after a production deploy, and never blocks it — it needs
headless Chrome and takes minutes, against a gate that takes about a second.

## Preview deploys

Every pull request deploys to its own Cloudflare branch URL, built with
`DEPLOY_CONTEXT=preview`. A preview is a byte-identical copy of the site on a
second hostname; left indexable it is textbook duplicate content, and the two
URLs split whatever authority each page has.

So a preview build changes three things at once, and they have to agree:

| | Production | Preview |
|---|---|---|
| `<meta name="robots">` | `index,follow,…` | `noindex,nofollow` |
| `robots.txt` | `Allow: /` + sitemap | `Disallow: /` |
| `sitemap-index.xml` | generated | not generated |

Telling crawlers "index this" in a sitemap and "do not" in a meta tag is exactly
the mismatch rule C-20 exists to catch. Changing one of the three without the
others reintroduces it.

Canonical URLs still point at production, because `PUBLIC_SITE_URL` is fixed in
the workflow. That is the intended behaviour: any authority a preview URL
accidentally collects belongs to the real page.

## Generated deploy artefacts

Written into `dist/` by the `aifb:cloudflare-pages` integration at
`astro:build:done`.

### `_redirects` — from `site/redirects.yaml`

The URL history of the site. Without it a migration is a link-loss event:
`pnpm migrate:ghost` renames slugs, every inbound link to an old URL 404s, and
nothing else in the pipeline notices because the new pages are all valid.

Migration **appends to that file automatically** whenever it changes a slug.
It does not own the file — you can add redirects for any other reason.

Every `to` is checked against the pages the build produced. A redirect pointing
at a page that no longer exists fails the build, because it turns one dead link
into two hops ending in a 404.

```yaml
redirects:
  - from: /old-ghost-slug/
    to: /writing/the-new-slug/
    status: 301          # default; 302 only for something genuinely temporary
    note: renamed during the Ghost migration
```

### `_headers` — cache policy

| Path | Policy | Why |
|---|---|---|
| `/_astro/*` | `max-age=31536000, immutable` | Astro fingerprints these filenames, so content can never change under a given URL |
| `*.png` `*.jpg` `*.webp` `*.svg` | `max-age=86400` | Not fingerprinted — a day helps, and replacing one is not a week-long rollout |
| everything else | `max-age=0, must-revalidate` | HTML must revalidate, or a deploy reaches readers whenever their cache feels like it |

Plus `X-Content-Type-Options`, `Referrer-Policy` and `X-Frame-Options` on all
responses.

With no `_headers` file at all the host has to guess, and either HTML is cached
too long or hashed assets are re-fetched forever. Both are wrong.

## Environment contract

Three categories, and they are not interchangeable. Full reference:
[`../../.env.example`](../../.env.example).

| Category | Variable | Where it lives |
|---|---|---|
| Build-time, public | `PUBLIC_SITE_URL` | the workflow `env:` block — it is baked into canonical URLs, sitemap, RSS and `llms.txt` |
| Build-time, public | `DEPLOY_CONTEXT` | set by the workflow per event; `preview` on pull requests |
| Deploy-time, secret | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | GitHub repository secrets, never the repo |
| CI-provided | `GITHUB_TOKEN` | injected by Actions |

Both non-secret values ship as `REPLACE_ME`, and the workflow fails fast while
they are — it will not deploy to someone else's project. Missing secrets fail
with a pointer to where to add them, rather than a wrangler stack trace.

### Who sets Astro's `site`

By default the engine does, from `site/site.yaml` (`PUBLIC_SITE_URL` first). The
origin is stated once, in the intent layer, and a site's `astro.config.mjs` needs
no YAML parser to restate a fact it has already stated.

A site that owns its own environment plumbing wants the opposite, and the reason
is not that the two values would disagree — they almost never do. It is that an
`astro.config.mjs` can make supplying the origin a **precondition**: `throw` when
`PUBLIC_SITE_URL` is unset, so a misconfigured pipeline cannot ship a sitemap
pointing at the wrong domain. The engine answering the question turns that guard
into a no-op — `site.url` falls back to `site.yaml`'s `url`, which is exactly the
value the build meant to refuse.

```js
// astro.config.mjs — the site keeps its own fail-closed origin
if (!process.env.PUBLIC_SITE_URL) throw new Error('PUBLIC_SITE_URL is required');

export default defineConfig({
  site: process.env.PUBLIC_SITE_URL,
  integrations: [engine({ site: false })],
});
```

`site: false` only hands back Astro's `site`, which in practice means the
sitemap. Canonical tags, RSS, `llms.txt` and rule C-07 keep reading `site.url`
either way. If the two disagree the build warns and continues — a preview or
branch domain serving a production canonical is that disagreement working as
designed, and it is the same shape as the mistake.

## Rollback

Cloudflare Pages keeps every deployment. Roll back from the dashboard —
Workers & Pages → the project → Deployments → *Rollback* — which is instant and
needs no build.

Reverting the commit also works and is what you want when the bad state came
from content rather than from the deploy.

## Other hosts

The framework targets Cloudflare Pages only. Porting to Netlify or Vercel is
mostly mechanical — both read `_redirects`/`_headers` equivalents and serve a
static directory — so it is a workflow file plus a different artefact writer.

**GitHub Pages is still the exception.** A project page is served from
`user.github.io/repo`, so the site lives under `/repo/` rather than at the root.
`engine({ mount: '/repo' })` now moves the routes, the canonicals, the sitemap
entries and `llms.txt`, and the URL-shaped rules measure from the mount — see
[`engine-options.md`](./engine-options.md). What it does **not** move is the
assets: `/_astro/…`, `/favicon.svg` and everything from `public/` stay at the
origin root, which is correct for an engine installed into a site that owns that
root and wrong for a project page. That part is Astro's `base`, and the two have
not been used together here. Do not treat it as a configuration change yet.

## Related

- [`content-contract.md`](./content-contract.md) — what blocks a deploy
- [`../getting-started.md`](../getting-started.md) — first deploy, step by step

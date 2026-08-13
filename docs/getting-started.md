# Getting Started

From nothing to a live site on your own domain. Budget 30 minutes.

If a step takes you into the source code, that is a bug in this document — please say
so. The whole point is that a new site needs configuration, not code.

## 0. Prerequisites

- Node ≥ 20.11, pnpm 11
- A Cloudflare account (free tier is fine)
- A GitHub account

## 1. Create and run (2 min)

```bash
npm create aifb@latest my-blog
cd my-blog
pnpm install
pnpm dev            # http://localhost:4321
```

What lands in `my-blog` is only ever the site: `site/`, `content/`, an Astro
config. `aifb-engine` and `aifb-cli` are dependencies.

Prefer to edit a finished site down rather than fill in a blank one?
`npm create aifb@latest my-blog --example agent-native-engineer`

Already have an Astro site? Add `aifb-engine` to it instead of scaffolding a new
one, and mount the blog under a prefix — `engine({ mount: '/blog' })`. See
[`specs/engine-options.md`](./specs/engine-options.md).

The site builds and runs with no content at all — that is the shipped state. Astro
logs one "collection is empty" notice per content type until you add your first file.

**Diagrams are opt-in.** `mermaid` is an optional peer, because 11.x is a lot of
weight for a site that publishes none. Without it a ```mermaid fence renders as a
readable code block and the build says so once; `pnpm add mermaid` turns the
diagrams on. Nothing else needs installing — `aifb-engine` declares what it
imports.

## 2. Brand (5 min)

Edit **`site/site.yaml`** only.

```yaml
name: Your Site
title: Your Site · what it is for      # home page <title>
description: ...                       # one sentence, ≤160 display columns (C-06)
url: https://your-domain.com           # overridden by PUBLIC_SITE_URL in CI
locale: zh-CN                          # needs packages/engine/i18n/<locale>.ts
# locales:                             # optional — omit it and the site is one language
#   zh-CN: zh                          #   default: served at the root, no prefix
#   en-US: en                          #   others: served under /en/
theme:
  name: default                        # a file in site/themes/
  storageKey: your-site-theme          # avoid clashing with other sites
author: { name, title, bio, email }
social: { github, youtube, x, linkedin }
hero: { eyebrow, title, description, actions, signals }
services: { ... }                      # Work-with-me page + Service schema
nav: [ ... ]                           # static entries; content types self-register
```

Nothing under `engine/` needs to change for any of this — if it does, that is a
bug in the engine, not a step you missed.

Not in English or Chinese? See [`recipes/add-locale.md`](./recipes/add-locale.md)
first — `site.locale` must have a message table or the build stops with instructions.

Publishing in **two** languages is the `locales` block above: the default keeps the
root, the others get a prefix, and translations go in `content/<type>/<prefix>/`.
Leave `locales` out until you need it — a single-language site behaves exactly as
it did before the option existed. [`specs/i18n.md`](./specs/i18n.md) has the whole
of it.

## 3. Taxonomy and page copy (8 min)

**`site/taxonomy.yaml`** — replace `pillars`, `topics` and `series` with your own
subjects. Each topic's `pillar` and each series' `topic` must exist, and a pillar
owning no topic is an error: the strategy and the site are the same file, so they
cannot drift apart.

**`site/pages.yaml`** — rewrite the About sections, the Uses table, the Newsletter
copy and the Work-with-me service list.

**`site/voice.md`** (optional, 2 min) — how this site writes. The prose half is
what a writing agent reads; the frontmatter is what `pnpm analyze` scores. Ships
with a working Chinese default; rewrite it for your own language and taste.

**`site/policy.yaml`** (optional) — thresholds. Only touch it if you disagree
with a default; every value ships with one.

Full reference: [`specs/taxonomy.md`](./specs/taxonomy.md).

## 4. Deployment target (5 min)

Create a Cloudflare Pages project (Workers & Pages → Create → Pages → Direct Upload).
Note the project name.

Edit **`.github/workflows/cloudflare-pages.yml`**:

```yaml
CLOUDFLARE_PAGES_PROJECT_NAME: your-pages-project
PUBLIC_SITE_URL: https://your-pages-project.pages.dev
```

Both ship as `REPLACE_ME`, and the workflow fails fast with a pointer back here if you
forget — it will not deploy someone else's project name.

Add two GitHub repository secrets:

| Secret | Where to get it |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens → *Edit Cloudflare Workers* template |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard URL, or the Workers & Pages sidebar |

Do not put either in the repository. Do not bind a custom domain yet.

## 5. Write the first post (5 min)

`content/` ships empty. Write your first post at `content/posts/<slug>.mdx`. The filename must equal the
slug (rule C-08):

```mdx
---
title: Your first post
description: One sentence saying what the reader gets. Do not pad it to hit a length.
slug: your-first-post
pubDate: 2026-07-29
category: one-of-your-topic-keys
tags: [Tag]
---

## Heading

Body. Include at least two internal links (rule C-02), for example to
[a topic](/topics/your-topic/) or [another post](/writing/other/).
```

Drafts: add `draft: true`. Drafts never produce a page, so they cannot leak — and
`pnpm validate` skips them, so an unfinished file cannot block your deploy either.

## 5.5 The pipeline will stop you if you skipped a step

`pnpm validate` runs a planning preflight before any content rule. Until steps
2–4 are actually done it refuses, listing every decision still on its shipped
default and what each one affects. `pnpm context setup` prints the same list at
any time.

This is deliberate: a category, a canonical URL and a voice are all cheap to
choose now and expensive to change once articles exist.

If you are keeping a default on purpose, say so — add its area to
`planning.acknowledged` in `site/policy.yaml`.

## 6. Verify before pushing (3 min)

```bash
pnpm check      # types
pnpm build      # produces dist/
pnpm validate   # content and SEO gate — must report 0 errors
pnpm metrics    # framework health
```

`pnpm validate` prints a `fix:` line for every problem. Warnings (title/description
length) do not block; errors do. Thresholds come from `site/policy.yaml`.

```bash
pnpm analyze    # writing-style signals, with file:line and a fix for each
```

## 7. Ship (2 min)

```bash
git add -A && git commit -m "Configure site" && git push
```

The workflow runs `install → config check → check → build → validate → deploy`.
Your site is at `https://<project>.pages.dev`.

## 8. Custom domain (optional)

Cloudflare Pages → your project → Custom domains. Then set `PUBLIC_SITE_URL` in the
workflow to the real domain and push again, so canonical URLs, sitemap, RSS and
`llms.txt` all point at it.

Do this **before** you accumulate traffic — changing the canonical origin later
resets the URLs search engines have indexed.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `The collection "posts" does not exist or is empty` | The template ships with no content | Expected until you add your first `.mdx`. Astro logs it once per empty collection; it is a notice, not an error. |
| `locale "xx" has no message table` | no `packages/engine/i18n/xx.ts` | [`recipes/add-locale.md`](./recipes/add-locale.md) |
| `site.theme.name is "x" but site/themes/x.css does not exist` | typo in `theme.name` | error lists available themes |
| `series "y" references unknown topic "z"` | taxonomy mismatch | fix `topic` in `site/taxonomy.yaml` |
| `must be one of: …` on build | frontmatter `category` not in the taxonomy | use a listed key |
| `Cross-origin canonical in …` | frontmatter `canonical` points elsewhere | remove it, or fix `PUBLIC_SITE_URL` |
| CI: `CLOUDFLARE_PAGES_PROJECT_NAME is still REPLACE_ME` | step 4 skipped | set both env values |
| `UnknownContentCollectionError` for a file you deleted | Astro's content-layer cache still holds it | `rm -rf node_modules/.astro .astro dist` and rebuild |
| `validate` reports orphan pages | a content type has no `surfaces` | [`recipes/add-content-type.md`](./recipes/add-content-type.md) |

## Next

- [`recipes/add-content-type.md`](./recipes/add-content-type.md) — a new kind of content
- [`recipes/migrate-from-ghost.md`](./recipes/migrate-from-ghost.md) — bringing a Ghost blog across
- [`recipes/add-theme.md`](./recipes/add-theme.md) — restyle
- [`recipes/add-locale.md`](./recipes/add-locale.md) — another language
- [`playbooks/ai-first-workflow.md`](./playbooks/ai-first-workflow.md) — the AI loop
- [`specs/content-contract.md`](./specs/content-contract.md) — what "publishable" means
- [`specs/engine-options.md`](./specs/engine-options.md) — every option `engine()` takes,
  including mounting the blog under a prefix of a site you already have

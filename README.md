# AI First Blogger

A reusable Astro + MDX blog framework built to be operated by an AI agent: plan,
write, audit, deploy, maintain.

It is not a CMS. Everything is file-based and structured, and — the part that makes it
AI-first rather than AI-flavoured — **what counts as publishable is a set of rules a
script can decide**, not a human read-through.

```bash
npm create aifb@latest my-blog
cd my-blog && pnpm install
pnpm validate     # lists every decision still marked TODO
pnpm dev
```

Start from a worked example instead of a blank form:

```bash
npm create aifb@latest my-blog --example agent-native-engineer
```

New here? → **[docs/getting-started.md](docs/getting-started.md)** (blank to live site, ~30 min)

| Package | |
|---|---|
| [`aifb-engine`](https://npmjs.com/package/aifb-engine) | Astro integration: injects the routes, resolves the theme, emits the deploy artefacts |
| [`aifb-cli`](https://npmjs.com/package/aifb-cli) | The pipeline. The command is `aifb` |
| [`create-aifb`](https://npmjs.com/package/create-aifb) | Scaffold |

This repository is the workspace that builds them, and its root is a site that
uses them — every rule it ships is a claim about content it must satisfy itself.

## Using the packages from an agent

A scaffolded site is not a folder of files an agent has to reverse-engineer. It
carries its own operating contract:

```
AGENTS.md                            the plane boundary, and what to run before claiming done
.ai/skills/ai-first-blogger/SKILL.md the skill to load
prompts/                             one per task: intake · plan · brief · audit · deploy
site/README.md                       which file holds which decision
```

Every command runs through `npx aifb`, so nothing depends on this repository's
`pnpm` scripts:

```bash
npx aifb context write      # exactly what drafting an article needs — voice,
                            # categories, and the pages that actually exist to link to
npx aifb validate           # planning preflight, then 29 rules → validate-report.json
npx aifb analyze            # writing style → content-report.json
npx aifb context status     # both reports merged, stale ones flagged
npx aifb env                # versions, for a bug report
```

Three habits matter more than the command list:

**Read the report file, not the console.** `validate-report.json` carries a `fix`
field per violation, written as an instruction. The console is a summary for a
human watching it scroll.

**Do not read all of `site/`.** It costs ~9k tokens; one task needs one or two
files. `npx aifb context <task>` prints that slice.

**A refusal is information.** `validate` and `context write` both refuse to run
until the site is planned — identity, domain, copy, taxonomy, template, voice.
Writing into an unplanned site means writing into someone else's taxonomy and
voice, and every rule that then passes is measuring the wrong thing. Plan it, or
ask what to plan it as. Do not route around the refusal.

## When the framework is in the way

The rule the architecture rests on: **`site/` holds what a person decides, the
engine holds how it is rendered.** So if a decision about *your site* requires
editing the engine, copying its code, or patching `node_modules`, that is a
defect here — not a limitation to work around quietly.

[**Open an issue**](https://github.com/zyonlab/ai-first-blogger/issues/new/choose).
Three forms, because three different things go wrong:

| | When |
|---|---|
| **Boundary** | you had to touch engine code to decide something about your own site |
| **Gate** | a `C-nn` rule blocked something correct, or let something broken through |
| **Bug** | a command crashed, or the output is wrong |

Both of the last release's boundary fixes started as this shape of report: the
footer's social links were hardcoded to four platforms, and a list page could
only be a grid. In both cases someone's workaround *was* the bug report — so
paste it. **The workaround is the evidence.**

Run `npx aifb env` and paste the output; it catches version mismatches between
the three packages, which are a fault on their own.

One thing worth checking first: most numbers live in `site/policy.yaml` and are
yours to change. If a threshold is wrong for *your* site, change it there. File
an issue when it is wrong for everyone, or when the setting you need has no name
yet.

## What makes it a framework

| | Cost |
|---|---|
| Rebrand for a different subject and language | edit `site/*.yaml`, no code |
| Add a content type | 1 yaml block + 1 engine file + 1 content directory |
| Add a theme | 1 CSS file + 1 line |
| Add a locale | 1 message file + 2 lines |
| Change what counts as publishable | `site/policy.yaml` |
| Change the writing voice | `site/voice.md` |
| Change what the SEO gate enforces | `site/policy.yaml` |

`pnpm metrics` measures each of these and fails when the guarantee breaks.

## Stack

Astro · TypeScript · MDX · Content Collections · static output · GitHub Actions ·
Cloudflare Pages

## Commands

```bash
pnpm context write        # what an agent needs to draft an article (voice, categories, link targets)
pnpm exec aifb env        # versions + site shape, for an issue report
pnpm context setup|type|status
pnpm dev                  # dev server
pnpm check                # types
pnpm build                # static build to dist/
pnpm validate             # planning preflight + content/SEO gate (29 rules)
pnpm validate --strict    # warnings fail too
pnpm validate:self-test   # prove every rule still catches its own violation
pnpm test:scenarios       # drive the real pipeline: themes, voice, taxonomy, deploy
pnpm metrics              # framework health → metrics.json
pnpm analyze              # writing style, articles + every outward-facing string
pnpm audit:seo            # Lighthouse over the built site (separate job, needs Chrome)
pnpm og:default           # regenerate the fallback Open Graph image
pnpm migrate:ghost        # import a Ghost export
```

CI order is `check → build → validate → deploy`; errors block the deploy.

## Configuration

Three planes, split by who decides:

```
site/       intent    — what the site is about (YAML + Markdown, no code)
content/    material  — the articles
packages/   mechanism — aifb-engine · aifb-cli · create-aifb
examples/   reference — complete planned sites to copy from
```

A site's own repository contains only `site/`, `content/` and a config file —
the framework is a dependency. See the top of this file to start one.

The repository is a pnpm workspace: the root **is** the site, and the framework
lives in `packages/`. A site's own repo therefore contains only `site/`,
`content/` and a config file.

`site/` ships as a **skeleton**: every decision a person must make is marked
`TODO`, and `pnpm validate` refuses to run the content pipeline until they are
gone. Publishing into an unplanned site is not a content defect — it is doing
the steps out of order. Start from a worked example instead of a blank form:

```bash
cp -r examples/agent-native-engineer/site/. site/
```

| File | Holds |
|---|---|
| `site/site.yaml` | brand, URL, locale, author, social, hero, theme choice, static nav |
| `site/taxonomy.yaml` | pillars, topics, series — the source of the category vocabulary |
| `site/content-types.yaml` | each content type's route, labels and surfaces |
| `site/policy.yaml` | thresholds and switches — what counts as publishable |
| `site/pages.yaml` | About / Uses / Newsletter / Work-with-me copy |
| `site/voice.md` | writing style: frontmatter for the analyser, prose for the agent |
| `site/redirects.yaml` | URL history — emitted as `_redirects`, targets verified at build |
| `site/themes/<name>.css` | the design token set |
| `site/templates/**` | markup overrides — any engine component, layout, stylesheet, card or page |
| `packages/engine/content-types/<name>.ts` | schema, JSON-LD and components for one type |
| `packages/engine/i18n/<locale>.ts` | UI chrome strings |

`site/README.md` indexes which file a task needs. Better still, `pnpm context <task>`
prints just that slice — reading all of `site/` costs ~9k tokens, one task needs one
or two.

The intent plane is YAML and Markdown on purpose: those files cannot contain an
import or a component, so the boundary cannot erode. The contract is
[`docs/specs/site-config-contract.md`](docs/specs/site-config-contract.md); the
reasoning is [`docs/adr/0002-three-planes.md`](docs/adr/0002-three-planes.md).

## Content

```
content/posts/*.mdx
content/videos/*.mdx
content/projects/*.mdx
content/case-studies/*.mdx
```

```yaml
title: Article title
description: 110-160 display columns
slug: article-slug        # must equal the filename
pubDate: 2026-07-29
category: ai-engineering  # must exist in site/taxonomy.yaml
tags: [AI, Blogging]
draft: true               # optional — never built, and never gated
```

Add a new kind of content: [`docs/recipes/add-content-type.md`](docs/recipes/add-content-type.md).

## SEO / GEO

Sitemap · `/rss.xml` · `/robots.txt` · `/llms.txt` · canonical URLs · Open Graph ·
Twitter Card · visible breadcrumbs · JSON-LD for Person, Article, VideoObject,
CreativeWork, BreadcrumbList, CollectionPage and ItemList.

Each of these is checked, not just implemented. The gate covers site-wide on-page
SEO, not just per-page markup: title and description uniqueness, exactly one H1,
image alt text, anchor-text quality, URL structure, noindex/sitemap agreement,
thin listing pages, and structured data that matches what the page renders.
Rule table: [`docs/specs/content-contract.md`](docs/specs/content-contract.md).

`pnpm audit:seo` runs Lighthouse over the whole build as a separate CI job — it
needs headless Chrome and takes minutes, so it reports rather than blocks.

## AI-first workflow

```
generate → pnpm build → pnpm validate → read validate-report.json → fix → repeat until 0 errors
```

- Agent rules: [`AGENTS.md`](AGENTS.md)
- Skill: [`.ai/skills/ai-first-blogger/SKILL.md`](.ai/skills/ai-first-blogger/SKILL.md)
- Playbooks: [`docs/playbooks/`](docs/playbooks/)
- Prompts: [`prompts/`](prompts/) — intake, content plan, article brief, SEO/GEO audit, deploy

## Deployment

`.github/workflows/cloudflare-pages.yml` deploys on push to `main`.

Set `CLOUDFLARE_PAGES_PROJECT_NAME` and `PUBLIC_SITE_URL` in the workflow — they ship
as `REPLACE_ME` and the job fails fast until you do. Add `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` as GitHub Secrets.

Pull requests deploy to a preview URL built with `DEPLOY_CONTEXT=preview`: noindex,
no sitemap, `robots.txt` disallowed — a copy of the site on a second hostname must
not compete with production for the same queries.

The build emits `_redirects` (from `site/redirects.yaml`, targets verified against
the pages actually built) and `_headers` (immutable for fingerprinted assets,
revalidate for HTML). Full contract:
[`docs/specs/deployment.md`](docs/specs/deployment.md).

## Ghost migration

Put the export at `migration/ghost-export.json` (images at `migration/images/`), then:

```bash
LEGACY_CONTENT_DOMAIN=https://your-old-domain.com pnpm migrate:ghost
```

Writes MDX to `content/posts/` and a report to `migration/report.md`.
Slug overrides: `packages/cli/src/slug-map.ts`. Category and series mapping:
`packages/cli/src/category-map.ts`. Both ship empty — fill in the mapping with **your**
categories. It is checked against `site/taxonomy.yaml` before anything is written,
so a mismatch aborts the run instead of producing hundreds of files that fail the
build. Posts matching no rule land in `fallbackCategory` and are listed in the report.

## Documentation

```
docs/getting-started.md      fork → live site
docs/capabilities.md         capability map · boundaries · optimisation backlog
docs/evaluation-2026-08.md   full-pipeline evaluation against a lookalike site
docs/specs/                  content-contract · site-config-contract · taxonomy
                             theming · i18n · validation-pipeline · metrics
                             deployment · releasing · templates
docs/recipes/                add-content-type · add-theme · add-locale
docs/adr/                    decisions (0002 planes · 0003 workspace · 0004 template API)
docs/playbooks/              AI-first workflow · template customization
.github/ISSUE_TEMPLATE/      boundary · gate · bug — the three ways to report
```

## Notes

- Keep secrets out of the repository.
- Do not edit generated `dist/`, `.astro/`, or `node_modules/`.

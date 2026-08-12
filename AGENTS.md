# AI First Blogger Agent Rules

Scope: this repository.

## The rule

```
site/       intent    — what the site is about. Change it when asked.
content/    material  — the articles. This is what you produce.
the engine  mechanism — aifb-engine renders, aifb-cli runs the pipeline.
                        Installed as dependencies in a site; `packages/` in the
                        framework repo. Either way, not a site decision.
```

That is the whole boundary. `site/` is YAML and Markdown; the engine is code.
If a change requires editing the engine to make a *site* decision, that is a bug in
the engine — say so instead of working around it.

"Say so" has an address: open a **Boundary** issue at
<https://github.com/zyonlab/ai-first-blogger/issues/new/choose>, and paste the
workaround you used. The workaround is the evidence — it shows exactly which
decision had no home in `site/`. Run `npx aifb env` for the version block.

Report it *and* keep going: ship the workaround so the user is not blocked, and
say in your summary that you filed it. A silent workaround is how a boundary
defect survives — it works for one person and is never seen again.

Rationale: `docs/adr/0002-three-planes.md`.

## Plan before writing

`pnpm validate` and `pnpm context write` both refuse to run until the site is
planned — identity, domain, copy, taxonomy, template, voice, and the AI-first
surfaces. If you are asked to write an article into an unplanned site, **plan it
first or ask what to plan it as**; do not work around the refusal.

Writing into an unplanned site means writing into someone else's taxonomy, voice
and domain, and every rule the gate then applies is measuring the wrong thing.

## Start here, do not read the whole config

```bash
pnpm context write     # writing an article
pnpm context setup     # changing brand / taxonomy / page copy
pnpm context type      # adding or changing a content type
pnpm context status    # what is broken right now, in one list
```

Each prints exactly the slice that task needs. Reading all of `site/` costs
~9k tokens; one task needs one or two. `pnpm context write` also lists the pages
that actually exist, so internal links (C-02) point at real URLs instead of being
invented and caught later by C-03.

`site/README.md` is the index if you would rather open a file directly.

## Where things go

| Kind of value | Location |
|---|---|
| Brand, author, social, theme choice, static nav | `site/site.yaml` |
| Pillars, topics, series, categories, tags | `site/taxonomy.yaml` |
| A content type's route, labels, surfaces | `site/content-types.yaml` |
| Thresholds and switches (what counts as publishable) | `site/policy.yaml` |
| Static page copy | `site/pages.yaml` |
| Ghost keyword → category mapping for a migration | `site/migration.yaml` |
| Which languages the site publishes | `locales:` in `site/site.yaml` |
| The same copy in another language | an `i18n:` block on the mapping that holds it |
| Writing style | `site/voice.md` |
| Colours and typography | `site/themes/<name>.css` |
| Markup — a component, layout, card or whole page | `site/templates/<kind>/<Name>.astro` |
| A content type's schema, JSON-LD, components | the engine — `aifb-engine/content-types/<name>.ts` |
| UI chrome strings | the engine — `aifb-engine/i18n/<locale>.ts` |

Never add these by hand — they are derived: navigation entries, list pages, detail
pages, `llms.txt` sections, `rss.xml` entries, home page sections. Declare
`surfaces` in `site/content-types.yaml` instead.

## Change Discipline
- Prefer small, reviewable changes.
- Do not edit `dist/`, `.astro/`, `node_modules/`, or secrets.
- Do not add real API tokens, emails, private domains, or credentials.
- Do not add a page under the engine's `pages/<type>/` for a content type — use the registry.
- Read `docs/adr/` before changing an architectural decision.

## Validation — required before claiming done
```bash
pnpm check      # types
pnpm build      # produces dist/
pnpm validate   # planning preflight, then 34 content/SEO rules; must report 0 errors
pnpm metrics    # framework health
pnpm analyze    # writing style: articles AND every outward-facing string in site/*.yaml
pnpm context status   # the three reports above merged, with staleness flagged
```

- `pnpm validate` writes `validate-report.json`. **Read that file, not the console.**
  Every violation carries a `fix` field written as an instruction.
- `pnpm analyze` writes `content-report.json` in the same shape: `file`, `line`,
  `message`, `fix`. Act on it the same way.
- `pnpm context status` merges both and marks a report **stale** when `content/`
  or `site/` changed after it ran. A stale report is not evidence — re-run.
- `pnpm audit:seo` (Lighthouse) is a separate job, not part of the gate: it needs
  Chrome and takes minutes. Run it when changing templates or layout.
- Errors block. Warnings do not, but do not add new ones.
- Thresholds come from `site/policy.yaml`. If one seems wrong, propose a change
  there — do not silence a rule and do not edit the constant in the engine.
- After adding or changing a validation rule, `pnpm validate:self-test` must stay
  green — it proves each rule still catches its own violation.
<!-- repo-only:start -->
- After changing anything under `packages/`, run `pnpm test:scenarios`. It drives
  the real pipeline over real files (swap a theme, swap a voice, override a
  template, break the taxonomy, run a preview build) and catches what the
  self-test cannot: a check that is present but wired to nothing.
<!-- repo-only:end -->
- Never report completion with a non-zero error count.

## Content Rules
- All publishable content lives under `content/**`.
- Frontmatter must satisfy the content type's schema; `category` and `series` must
  exist in `site/taxonomy.yaml`.
- Filename must equal `slug` (C-08). Slugs are unique per content type **and
  language** — the same slug in two languages is a translation, not a clash.
- Body needs at least `content.minInternalLinks` site-internal links (C-02).
- No H1 in the body and no skipped heading levels (C-09) — the page H1 comes from
  the title.
- **Read `site/voice.md` before writing.** Its prose half is the voice; its
  frontmatter is what `pnpm analyze` scores. Write for the prose, not for the score.
- **Writing a translation** (only on a site with `locales:` in `site/site.yaml`):
  put it in `content/<type>/<prefix>/`, e.g. `content/posts/en/`. Give it a slug in
  its own language and add `translationKey:` naming the original's slug — that
  field, and only that field, is what produces the `hreflang` pair. A translation
  that keeps the original slug needs no field at all.
  **Do not create a file just to fill a gap.** An article that exists in one
  language is finished; a stub in the other becomes an indexed empty page that
  claims to be the real one.
- Prefer MDX with definitions, examples, tradeoffs, next steps, and internal links.
- Do not publish drafts unless explicitly requested. `draft: true` keeps an entry
  unbuilt and outside the gate — use it for work in progress rather than leaving a
  half-finished file to fail `pnpm validate` for the whole site.

## Deployment Rules
- GitHub Actions deploys `dist/` to Cloudflare Pages after `validate` passes.
- `CLOUDFLARE_PAGES_PROJECT_NAME` and `PUBLIC_SITE_URL` must be set in the workflow;
  it fails fast while they are `REPLACE_ME`.
- Do not bind custom domains or modify DNS unless explicitly requested.
- Use GitHub Secrets for Cloudflare credentials.
- When a slug changes, add the old URL to `site/redirects.yaml`. `migrate:ghost`
  does it automatically; a hand-renamed slug is on you. Build fails if a redirect
  points at a page that does not exist.
- Never make a preview deploy indexable. Contract: `docs/specs/deployment.md`.

<!-- repo-only:start -->
## Releasing the packages
- The three packages share one version; `create-aifb` pins the others at its own.
- Bump all three, run `pnpm release:check`, then tag `v<version>`. The tag
  publishes; a push to main does not.
- Never publish from a working tree the release check rejects. Contract:
  `docs/specs/releasing.md`.
<!-- repo-only:end -->

## Reference
- Prompts: `prompts/` — one per task (intake · plan · brief · audit · deploy)
- Everything else lives with the framework:
  <https://github.com/zyonlab/ai-first-blogger/tree/main/docs>
  — `getting-started.md`, `specs/` (contracts), `adr/` (decisions), `recipes/`

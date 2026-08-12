# Content Contract

What "publishable" means in this framework, expressed as rules a script can decide.

Every rule below is implemented in `packages/cli/src/validate/rules/` and runs via `pnpm validate`.
A rule that is documented but not implemented is a bug — `pnpm validate:self-test`
fails if any rule stops catching its own violation.

## Why this exists

An AI-first system needs a machine-decidable definition of "good enough". Without
one, every generated article requires a human read-through, which is the bottleneck
the system is supposed to remove. These rules are that definition.

## Before any of this: the planning preflight

`pnpm validate` refuses to run a single content rule until the site is planned.

The gate answers *is this article publishable*. It cannot answer the question
that comes first — *is there a site to publish it into*. An article validated
against an unplanned site passes rules that mean nothing: its `category` belongs
to someone else's taxonomy, its canonical points at a template domain, its author
is "Site Owner", and the voice it was written against is a sample.

So an unplanned site is not reported as a list of violations. It stops the
pipeline, because publishing into one is not a content defect — it is doing the
steps in the wrong order.

Two kinds of check, and the difference matters:

**Unfilled placeholders.** `site/` ships as a skeleton in which every value a
person must decide is literally marked `TODO`. A value is unconfigured because
it *says* so — visible when you open the file, visible on the rendered page —
not because a hash somewhere still matches a snapshot.

**Structural.** Things that can be wrong in a fully-written site too: a
theme-color that disagrees with the theme's `--bg`, an OG image that does not
exist, a voice written for a different language than the site publishes in, a
content type missing from `llms.txt`. These apply for the life of the site.

Seven areas:

| Area | Asks |
|---|---|
| `identity` | Who is publishing, and does the Person schema say anything true |
| `domain` | Is the canonical origin real — the one decision that is destructive to defer |
| `copy` | Do About / Uses / hero describe this site or the framework |
| `taxonomy` | Are the categories yours, and do their descriptions read as your own |
| `template` | Theme key, theme-color vs. the theme's `--bg`, a real OG fallback image |
| `voice` | Is there a voice to write against, and does its language match the site's |
| `ai` | `llms.txt` coverage, a content directory per type, somewhere to link to |

A worked example of a planned site lives in `examples/agent-native-engineer/`.
Copying it wholesale passes the preflight — it contains no `TODO` — which is
intentional: adopting someone else's plan is a decision, leaving a form blank
is not.

The last row is what an ordinary blog would not check. A type missing from
`llms.txt` is invisible to AI summarisers; a missing `content/<type>/` means an
agent has nowhere to write; a voice written for another language makes
`pnpm analyze` score every article as clean.

`pnpm context write` refuses for the same reason, which is the stronger
enforcement: an agent that cannot get the writing context cannot start writing.
Failing at validate time means the article already exists.

**Escape hatch.** `planning.acknowledged` in `site/policy.yaml` opts an area out,
and the opt-out is printed on every run and recorded in the report. Deliberately
keeping a shipped default is fine; doing it silently is not.

## Thresholds live in site/policy.yaml

Every number in the table below is a default the engine ships and a site may
overrule in `site/policy.yaml`. The shipped values are in the Threshold column;
`--strict` can also be made permanent there. Change the policy, not the rule —
a threshold edited inside `engine/` is lost on the next update and invisible to
anyone reading the report.

## Severity

| Severity | Effect |
|---|---|
| `error` | Blocks CI and deployment. |
| `warn` | Reported, does not block. `pnpm validate --strict` promotes warnings to errors. |

## Rules

| ID | Rule | Threshold | Severity | Source | Implementation |
|---|---|---|---|---|---|
| C-01 | Usable Open Graph image | raster (`png`/`jpg`/`webp`), never SVG | error | `dist/` | `rules/seo.ts` |
| C-02 | Internal link floor | ≥ `content.minInternalLinks` distinct site-internal links | error | `content/` | `rules/content.ts` |
| C-03 | No dead internal links | every internal `href` resolves to a built page | error | `dist/` | `rules/links.ts` |
| C-04 | No orphan pages | every page has ≥ 1 inbound internal link | error | `dist/` | `rules/links.ts` |
| C-05 | Title length | ≤ `seo.titleMaxWidth` display columns | warn | `dist/` | `rules/seo.ts` |
| C-06 | Description length | `seo.descriptionMinWidth`–`descriptionMaxWidth` columns | warn | `dist/` | `rules/seo.ts` |
| C-07 | Same-origin canonical | canonical origin == `site.url` origin | error | `dist/` | `rules/seo.ts` |
| C-08 | Slug uniqueness & filename match | unique per type **and language**; `translationKey` unique per language; filename == slug | error | `content/` | `rules/content.ts` |
| C-09 | Heading hierarchy | no H1 in body, no skipped levels | error | `content/` | `rules/content.ts` |
| C-10 | Breadcrumb schema matches the page | `BreadcrumbList` ⇒ visible breadcrumb | error | `dist/` | `rules/seo.ts` |
| C-11 | Required base fields | `title`, `description`, `slug` present | error | `content/` | `rules/content.ts` |
| C-12 | Theme token completeness | every theme defines the full token set | error | `site/themes/` | `rules/theme.ts` |
| C-13 | No hardcoded colours outside themes | zero literal colours in engine CSS, components, layouts or site overrides | error | the installed `aifb-engine`, `site/templates/` | `rules/theme.ts` |
| C-14 | Title uniqueness | no two pages share a `<title>`, unless they are `hreflang` translations of each other | error | `dist/` | `rules/onpage.ts` |
| C-15 | Description uniqueness | no two pages share a meta description, unless they are `hreflang` translations of each other | error | `dist/` | `rules/onpage.ts` |
| C-16 | Exactly one H1 | every page has one, and only one | error | `dist/` | `rules/onpage.ts` |
| C-17 | Images carry alt text | every `<img>` has an `alt` attribute | error | `dist/` | `rules/onpage.ts` |
| C-18 | Anchor text carries meaning | no "点击这里" / "read more" links | warn | `dist/` | `rules/onpage.ts` |
| C-19 | URL structure | kebab-case segments, depth ≤ `seo.maxUrlDepth` | error | `dist/` | `rules/onpage.ts` |
| C-20 | Noindex stays out of the sitemap | the two signals must agree | error | `dist/` | `rules/onpage.ts` |
| C-21 | Listing pages introduce their subject | prose ≥ `seo.listingIntroMinWidth` outside the cards | warn | `dist/` | `rules/onpage.ts` |
| C-22 | ItemList matches the page | declared item count == rendered count | error | `dist/` | `rules/onpage.ts` |
| C-23 | Detail pages declare their type | JSON-LD beyond `BreadcrumbList` | error | `dist/` | `rules/onpage.ts` |
| C-24 | Chinese typography | zhlint, rules from policy, zh-* locales | warn | `content/` | `rules/typography.ts` |
| C-25 | Authored links resolve | every link in an article points at a page the site produces | error | `content/` | `rules/links-source.ts` |
| C-26 | Article has substance | prose ≥ `content.minBodyWidth` display columns, code excluded | error | `content/` | `rules/quality.ts` |
| C-27 | Writing style floor | score ≥ `style.minScore`; off until a floor is set | warn | `content/` | `rules/quality.ts` |
| C-28 | Every anchor is followable | no `<a>` with a missing, empty or `javascript:` href | error | `dist/` | `rules/onpage.ts` |
| C-29 | Rendered heading order | no level skipped in the built outline | error | `dist/` | `rules/onpage.ts` |
| C-30 | hreflang is true and reciprocal | every alternate was built, the set includes the page itself, both sides claim each other, `x-default` is in the set | error | `dist/` | `rules/locale.ts` |
| C-31 | A translation says something different | two languages of one page do not share a `<title>` | warn | `dist/` | `rules/locale.ts` |
| C-32 | Frontmatter reaches a surface | every value an author wrote is visible on the entry's page | error | `content/` + `dist/` | `rules/surfaces.ts` |
| C-33 | Meta title fits a search result | `metaTitle` ≤ `seo.titleMaxWidth` display columns | warn | `content/` | `rules/surfaces.ts` |
| C-34 | Hero image has alt text | `heroImage` is accompanied by `heroImageAlt` | warn | `content/` | `rules/surfaces.ts` |

### Display columns, not characters

C-05 and C-06 measure **display width**: a CJK character occupies two columns in a
search result, so a 40-character Chinese title is as long as an 80-character English
one. Counting width instead of `String.length` makes one threshold correct in any
locale. Implemented in `packages/cli/src/validate/html.ts:displayWidth`.

### The rules that only exist on a translated site

C-30 and C-31 are silent until `site/site.yaml` declares more than one locale,
and the URL-shape rules — C-04, C-10, C-19, C-21, C-22, C-23 — measure from the
engine's root **in its own language**, subtracting the locale prefix the same way
they subtract the mount. `/en/writing/` is a listing page; counted from the origin
it looks like a detail page, and the rule stops matching rather than failing.

C-30 is the one that matters. Everything else about publishing in two languages
is visible when you look at the site; an `hreflang` pointing at a page that was
never built is visible only to a crawler, and what it produces is a soft 404 with
a reference from the page it is impersonating.

C-31 is a warning on purpose: translating copy lands after routing does, and a
section should be able to go live before every string in it has. It fires on a
legitimately identical title too — "Uses" is "Uses" in both languages — which is
why it warns rather than blocks.

The pair also replaces something rather than only adding to it. C-14 and C-15
used to call two languages of one article duplicate content, which would have
failed a bilingual site on every page it translated. They now skip a reciprocal
`hreflang` pair, and C-30 proves the pair is real while C-31 reports the one
whose copy was never translated — so "not a duplicate" cannot quietly become
"not checked".

### Per-entry presentation and SEO

Every content type accepts these, all optional, each falling back to today's
behaviour when absent. They are added to every schema in one place
(`content.config.ts`), for the same reason `locale` is: a field declared per
type could not be used by a type whose engine module a site cannot edit.

| Field | What it changes | Ghost equivalent |
|---|---|---|
| `metaTitle` | the `<title>`, not the on-page headline | `meta_title` |
| `metaDescription` | the meta description, not the on-page summary | `meta_description` |
| `ogTitle` / `ogDescription` | the social card | `og_title` / `og_description` |
| `ogImage` | the card image, which need not be the hero | `og_image` |
| `twitterTitle` / `twitterDescription` / `twitterImage` | the Twitter card; each falls back to its `og:*` twin | `twitter_*` |
| `heroImageAlt` | the hero image's alt text — C-34 | `feature_image_alt` |
| `heroImageCaption` | the caption under it | `feature_image_caption` |
| `noindex` | keeps this entry out of the index | — |
| `featured` | pins it to the front of its listings | `featured` |
| `author` (posts) | a byline, when it is not the site owner | `authors` |

Scope and rationale: [ADR 0007](../adr/0007-ghost-parity-scope.md).

### C-32, and why structured data does not count

C-32 asks one question per value an author wrote: is any trace of it on the
page? The rendered body only — `<head>`, `<script>` and `<style>` are stripped
before the check.

That exclusion is the rule. `heroImage` and `posts.author` both reached JSON-LD
and a meta tag while no template rendered either, so an author filled them in,
the build went green, and nothing changed. A check that accepted structured data
would have passed both defects it was written for.

A field that is genuinely addressing rather than content — `slug`, `draft`,
`canonical`, and the head-only overrides in the table above — is exempt through
`NOT_CONTENT` in `rules/surfaces.ts`, where each entry carries the reason it is
not something to render. Adding to that list is a claim, and it should read like
one; a field that is neither content nor addressing does not belong in a schema.

### Notes on specific rules

**C-01** — the framework ships `public/og-default.png`, regenerated with
`pnpm og:default`. Per-entry images come from the content type's `seo()` hook
(`heroImage` for posts, the YouTube thumbnail for videos, `cover` for projects).

**C-04** — the usual cause of an orphan is a content type that never declared a
`surfaces` entry in `packages/engine/content-types/`. Adding `nav`, `home` or `llms` fixes the
whole type at once rather than page by page.

**C-06** — the ceiling is the bound that matters; the floor only catches stubs.
It has been lowered twice from practice. At 110 columns writers padded sentences
with filler to clear it. At 70 it flagged eighteen hand-written descriptions of
21–34 Chinese characters, all of them complete sentences. Length cannot tell
good copy from bad, so the floor is set where a description stops being a
sentence at all (36 columns, ~18 CJK characters) and no higher. Judging whether
a description is *good* is not something this rule can do — that is what the
style analyser (`pnpm analyze`) and human review are for.

**C-25 and C-03** look like the same rule and are not. C-25 reads what an author
wrote, resolves it against the taxonomy and the entries, and runs without a
build — so the fast loop catches a bad link immediately and can say *why*
("declared, but no published entry uses it, so no page is built"). C-03 reads
`dist/` and also covers links emitted by templates, which appear in no article's
source. Same defect class, different inputs, and the earlier one is worth having.

**C-05** measures the rendered `<title>`, which includes whatever
`titleTemplate` in `site/site.yaml` appends. A long site name spends the SERP
budget on every page — dropping the suffix is a legitimate choice, and it is the
site's to make. `pnpm context write` prints the remaining budget rather than the
formula.

**C-07** — a cross-origin canonical hands the page's ranking to another site. This is
also enforced at build time by `assertSameOrigin` in `packages/engine/lib/seo.ts`, so it fails
the build rather than shipping.

**C-10** — structured data must describe what is on the page. Detail pages render
`<Breadcrumbs />`; list pages pass `breadcrumbs` to `PageLayout`.

### Rules that read URL shape, under a mount or a second language

C-04, C-10, C-19, C-21, C-22, C-23 and C-25 all decide something from the segments
of a URL: one segment is a listing page, two is a detail page, `/` is the home
page nothing has to link to. Two things put segments in front of that:

```
/zh/blog/en/writing/my-post/
^^^^^^^^ mount        where the host installed the engine
         ^^ locale    which language this copy of the page is
            ^^^^^^^^^^^^^^^^ what the rule is actually asking about
```

Both are subtracted, mount first, before any rule counts anything — otherwise
every listing page files as a detail page and the rules stop matching what they
were written for, silently.

Both come from `.aifb/build.json`, written by the build; `AIFB_MOUNT` overrides
the mount. The arithmetic is `packages/cli/src/validate/url.ts`, and
`pnpm validate:self-test` exercises fourteen mounted cases and twenty-two
translated ones, each asserting a rule still fires or still stays quiet, plus the
mounted *and* translated composition.

Two consequences worth knowing while writing:

- Links inside articles are real paths. Under a mount they carry the prefix —
  `/zh/blog/writing/my-post/`. C-03 catches one that does not and names the URL
  it should have been.
- A link to a page *outside* the mount belongs to the host site, which C-25 knows
  nothing about, so it does not judge it. C-03 still does, against the pages the
  build produced.
- A link that names a language resolves against that language. `/en/writing/x/`
  written in a Chinese article is a deliberate cross-language link and C-25
  checks it against the English entries, not against all of them.

## What the gate is, and is not

C-01 … C-13 ask *is this page well-formed*. C-14 … C-23 ask what a professional
on-page audit asks: are two pages competing for the same query, does every page
state what it is, can a crawler read the images and follow the links, is the URL
structure consistent, does a listing page say anything of its own.

C-26 and C-27 ask the question all of that can be true without: **does the
article say anything.** Every other rule passes on a hundred-word stub with two
internal links, which is precisely what a thin page is.

Both floors are policy and both default low. The lesson from C-06 — a
description floor lowered twice because it kept flagging good, short writing —
applies exactly: a floor catches a stub, it does not enforce a length. The two
articles in `examples/agent-native-engineer/` run about 1300 display columns
against a floor of 400.

C-27 is off until `style.minScore` is set. A style score is a pointer at
paragraphs worth rewriting; arming it as a gate before calibrating it against
real articles produces the kind of rule people learn to ignore. When it is
armed, it and `pnpm analyze` share one scoring implementation, so the report and
the gate can never disagree about the same article.

Two things sit deliberately outside this file:

- **`pnpm analyze`** scores writing style against `site/voice.md`, including the
  outward-facing strings in `site/*.yaml` — the meta descriptions and `llms.txt`
  entries that are read far more often than any article. Reported, and blocking
  only if `style.minScore` is set.
- **`pnpm audit:seo`** runs Lighthouse over the built site. It needs headless
  Chrome and takes minutes, so it is a separate job rather than part of the gate.
  It overlaps with C-14…C-23 on purpose: an independent implementation catching
  the same defect is a check on ours.

## Running

```bash
pnpm build          # C-01, C-03..C-07, C-10 read dist/
pnpm validate       # exit 1 on any error
pnpm validate --strict   # warnings also fail
pnpm validate:self-test  # prove each rule still fires
```

Rules that need `dist/` are skipped with a notice when it is absent, and the skip is
recorded in `validate-report.json` as `rulesSkipped` — a skipped rule never reads as
a pass.

### Drafts are not gated

An entry with `draft: true` never produces a page, so no rule here applies to it:
"publishable" is not a question you can ask about something that is not being
published. Drafts are counted in the console output and in `draftsSkipped`, but a
half-written file in the repository can never block the deploy of everything else.

Remove `draft: true` and the entry is gated like any other — which is the moment the
rules become meaningful.

### Zero content is not a pass either

A run with no content files satisfies every content rule vacuously. The run says so
in the console rather than reporting a clean bill of health, for the same reason a
skipped rule is not a passed rule. `contentFiles` in the report is the field to check.

## Report format

`validate-report.json` is written on every run and is the machine-readable interface:

```json
{
  "rulesRun": 13,
  "rulesTotal": 13,
  "rulesSkipped": [],
  "contentFiles": 24,
  "draftsSkipped": 2,
  "errors": 0,
  "warnings": 42,
  "violations": [
    { "rule": "C-02", "severity": "error", "file": "content/posts/x.mdx",
      "line": 7, "message": "...", "fix": "..." }
  ]
}
```

Every violation carries a `fix` written as an instruction, so an agent can act on the
report without re-deriving the intent.

## Adding a rule

1. Add it to the table above with an ID, threshold and severity.
2. Implement it in the matching file under `packages/cli/src/validate/rules/`
   (`content.ts` for source, `seo.ts` for built HTML, `links.ts` for the link graph,
   `theme.ts` for the theme layer).
3. Add a self-test case in `packages/cli/src/validate/self-test.ts` — one context that must
   trip the rule and one that must not. If the rule reads a URL, add a mounted
   case and a translated case too: those do not fail when they are wrong, they
   stop matching.
4. `pnpm validate:self-test` must stay green.

Step 3 is not optional. A validation suite reporting zero errors is
indistinguishable from one that is silently broken.

## Related

- [`site-config-contract.md`](./site-config-contract.md) — where configuration lives
- [`metrics.md`](./metrics.md) — the numbers this gate feeds
- [`../adr/0001-content-type-registry.md`](../adr/0001-content-type-registry.md)

# ADR 0007 — how much of Ghost this engine replaces

**Status**: accepted · **Date**: 2026-08-12 · **Builds on**: [0002](./0002-three-planes.md), [0001](./0001-content-type-registry.md)

## Context

Migrating a real Ghost 5.82 blog — [zyoncode.com](https://zyoncode.com/), 61 posts —
onto engine 0.4.0 surfaced a dozen gaps. The design and template layer needed no
engine change at all: 31/31 gate rules green, zero forks. Every gap was in the
content model underneath it.

Individually each one was small enough to argue about. Together they had a single
cause: **nothing in this repository said how much of Ghost the engine is supposed
to be able to replace.** Without that line every gap reads as a maybe. Is a
`meta_title` override missing because it is out of scope, or because nobody has
written it yet? Is `tags` decorative on purpose? Neither question had an answer,
so neither could be closed, and the migration had to guess twelve times.

A missing scope line is not a documentation problem. It is the reason the same
defect kept shipping: a field would be added to a schema, wired into JSON-LD, and
rendered by no template — `heroImage`, `posts.author` — and nothing could call
that wrong, because nothing said what the content model was *for*.

## Decision

> **The engine aims for parity with Ghost on content presentation and SEO.
> Everything Ghost does for the business of publishing is out of scope.**

### In scope — Ghost parity is the target

- the content model a reader can perceive: posts, standalone pages, taxonomies
- URL space: permalinks, taxonomy archives, page addresses, redirects
- per-entry SEO: meta overrides, social cards, canonical, structured data, feeds, sitemap
- images and their accessibility metadata

### Out of scope — deliberately not Ghost

- members, memberships, tiers, paywalled `visibility` / `access`
- growth tooling: analytics dashboards, referral, recommendations
- email newsletters as a delivery mechanism (sending, segments, `email_subject`)
- multi-account / staff / roles, and therefore author archives
- native comments

### Why the exclusions are the point

Every excluded feature needs a runtime database, per-user state, or an admin
surface. The engine has none of the three, and that is not a shortfall it is
working towards — it is the property that makes it **AI-operable**. An agent can
author the in-scope half and a build can verify all of it, because all of it is
files. Add members and the site acquires state no `pnpm build` can check, no
agent can reason about from the repository, and no reviewer can see in a diff.

So the line is not "what we got to"; it is "what stays checkable".

### The corollary that has teeth

If a reader cannot perceive a field, it is not part of the content model. A field
accepted by a schema and rendered by no template is a defect of the same class as
a missing feature — the author fills it in, the build says green, and nothing
changes. Rule **C-32** enforces this: every frontmatter value must reach a
surface a reader can see. Structured data does not count, deliberately: `author`
was in the Article JSON-LD of every post and on screen nowhere, and `heroImage`
was the `og:image` of a page that never showed the image.

## Consequences

**Good.** Twelve open questions become one list with a boundary. The engine can
say no to members and newsletters without apologising, and yes to `metaTitle`
without debating whether SEO is its business. C-32 makes "accepted but
unrendered" impossible to ship again.

**Bad.** C-32 costs something real: a field that is genuinely addressing rather
than content — `slug`, `draft`, `canonical` — has to be named in an exemption
list with its reason. That list is maintenance, and a careless addition to it is
how the rule would rot. It is written to make the careless addition awkward: the
entry is a sentence explaining why the field is not content, not a boolean.

**Bad.** Declaring parity as the target means every future Ghost feature inside
the line is now a gap somebody can point at. That is the intended pressure, but
it is pressure.

## What this ADR does *not* settle

Two in-scope items are deferred with their own reasons, not left ambiguous:

- **A configurable URL space** — issue #26. Ghost puts permalinks, taxonomy
  prefixes and arbitrary routes in `routes.yaml`; the engine hardcodes
  `/topics/{slug}/`, `/series/{slug}/`, `/tags/{slug}/` and requires a
  kebab-case `route` segment per content type, so Ghost's default `/{slug}/`
  permalink cannot be expressed and a migrating site cannot keep its URLs. This
  overlaps issue #21 and is URL-space architecture — it belongs in its own ADR.
- **Declarable standalone pages** — issue #27. A Ghost page is a post at
  `/{slug}/` that stays out of collections and feeds. `OPTIONAL_PAGES` is a
  fixed list and `site/templates/pages/` can only *override* a route the engine
  already injects, so there is no way to declare a new one. The whitelist logic
  is right; what is missing is a way to add to it. Also its own ADR.

### Both landed in 0.6.0, partly

- **The URL space** — `routes:` in `site/taxonomy.yaml` moves the three archive
  prefixes, so `/tag/{slug}/` is expressible and a Ghost tag URL survives the
  migration intact. `routeAtRoot` lets the single content type on a one-type
  site serve entries at `/{slug}/`, which is Ghost's default permalink and
  issue #21. **Not** settled: date-based permalink templates
  (`/{year}/{month}/{slug}/`), which parity does not need.
- **Standalone pages** — `own:` in `site/pages.yaml` declares one, rendered by
  `site/templates/pages/<name>.astro`. The whitelist logic is unchanged, which
  was the point: declaring creates the URL, a file alone still does not, and a
  declaration with no template fails the build. **Not** settled: the
  content-entry shape (`content/pages/*.mdx`), which is closer to what a Ghost
  page actually is and needs its own answers about surfaces and which gate
  rules apply to a page that is not an article.

`migrate:ghost` therefore still skips `type: 'page'` entries and reports the
count rather than importing them as articles — a page silently filed as a post
appears in the archive, the feed and the sitemap as one. What changed is the
advice it prints: each skipped page can now be declared under `own:` at the URL
Ghost served it at, instead of waiting for a feature that had not shipped.

## Rejected alternatives

**"Parity with Ghost, full stop."** Members and newsletter sending are most of
Ghost's actual product. Taking them on means a database and an admin surface,
which ends the property this project exists for. Rejected on the first
consequence.

**"No stated scope; judge each request on merit."** This is the status quo, and
it is what produced the twelve-item list. Merit was never the problem — the
absence of a yardstick was.

**Leaving tags decorative and saying so.** Defensible, and it was on the table:
document that `category` is the only taxonomy and stop rendering tags as
pseudo-links. Rejected because it loses information a migration already has —
Ghost's tag is many-to-many, the engine's `category` is one-to-one, and every
migrated post carrying two or more tags would keep whichever one a mapping rule
matched first and drop the rest. The engine would be discarding content it was
handed.

**Making C-32 accept JSON-LD and meta tags as surfaces.** Cheaper, and it would
have passed both defects that motivated the rule. A check that both known
instances of a defect survive is not a check.

## Verification

```bash
pnpm validate            # C-32 among 32 rules; 0 errors
pnpm validate:self-test  # C-32 catches a planted unrendered field and clears a rendered one
pnpm test:scenarios      # the `content model`, `tags` and `ghost migration` groups
```

The `content model` group is the executable form of this ADR: each scenario fills
in one field and asserts the page changed.

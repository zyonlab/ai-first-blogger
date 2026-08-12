# Migrating a Ghost site

```bash
# Settings → Migration → Export, then:
cp ~/Downloads/ghost-export.json migration/ghost-export.json
cp -r ~/ghost-content/images migration/images        # optional
LEGACY_CONTENT_DOMAIN=https://your-old-blog.com pnpm migrate:ghost
```

It writes `content/posts/*.mdx`, copies images to `public/content/images/`,
appends any changed slug to `site/redirects.yaml`, and writes
`migration/report.md`. **Read the report** — half of what the migration found
is offered there rather than applied, and the reasons are below.

Scope of what is migrated at all: [ADR 0007](../adr/0007-ghost-parity-scope.md).

## Plan the mapping first

`site/migration.yaml` says which Ghost tag means which of *your* topics. It is
optional, and without it every post lands in the fallback category:

```yaml
fallbackCategory: notes          # must be a topic in site/taxonomy.yaml
rules:
  - match: [reliability, timeout, 限流]   # matched against title + slug + tag names
    category: llm-reliability
    series: agent-in-production          # optional
```

First match wins. The mapping is checked against `site/taxonomy.yaml` before a
single file is written — migrating first and discovering the categories do not
exist means hundreds of files that fail `pnpm build`.

## The two export shapes, and why it matters

Ghost hands you a site in one of two shapes and they are not the same:

| | Content API | admin export |
|---|---|---|
| tags | `post.tags`, joined | `tags` + `posts_tags`, separate tables |
| SEO overrides | `post.meta_title`, … | `posts_meta`, a separate table |
| author | `post.authors` | `users` + `posts_authors` |
| site title, nav, socials | not included | `settings` |

`pnpm migrate:ghost` reads both. This matters because reading the wrong one
does not fail — it finds `undefined` and writes a file that is quietly missing
its taxonomy or its SEO. That defect shipped twice before it was caught by a
person migrating a real site, which is why the scenario suite now drives this
command against a fixture in the admin-export shape.

## What lands in frontmatter

| Ghost | frontmatter |
|---|---|
| `title`, `slug`, `html` | `title`, `slug`, the body (converted to Markdown) |
| `custom_excerpt` → `excerpt` → `meta_description` | `description` |
| `published_at`, `updated_at` | `pubDate`, `updatedDate` |
| `feature_image` | `heroImage` |
| `featured` | `featured` |
| tags (visible ones) | `tags` |
| primary author, if not the site owner | `author` |
| `meta_title` / `meta_description` | `metaTitle` / `metaDescription` |
| `og_*` / `twitter_*` | `ogTitle` / `ogDescription` / `ogImage` / `twitter*` |
| `feature_image_alt` / `feature_image_caption` | `heroImageAlt` / `heroImageCaption` |
| `canonical_url`, same-origin only | `canonical` |

Legacy image URLs are rewritten to `/content/images/…` wherever they appear —
body, hero, and both card images.

## What the report offers instead of applying

`site/` is the intent plane. A migration writing into it would be mechanism
editing intent, so three things are printed as ready-to-paste blocks:

- **`tags:` for `site/taxonomy.yaml`** — every tag's slug, description, and the
  same `meta_*` / `og_*` / `twitter_*` / `feature_image` set Ghost keeps on it.
  Take these: the slug is what `/tag/{slug}/` used, so the new archive URL
  matches the old one, and a tag whose name is not kebab-case (any CJK tag) has
  no URL at all until it is declared. See [taxonomy](../specs/taxonomy.md).
  `accent_color` is the one column with no home — colour comes from a theme.
- **`site.yaml` settings** — title, description, share image, social handles,
  navigation. Ghost's `title` is usually the full sentence this engine puts in
  `title:` rather than the short brand it puts in `name:`, which is why it is a
  suggestion rather than an edit.
- **Cross-origin canonicals** — see below.

## What is deliberately not migrated

- **Ghost pages** (`type: 'page'`). The engine has no standalone page type yet
  (deferred in ADR 0007). A page filed into `content/posts/` appears in the
  archive, the feed and the sitemap as an article, and the gate then reports it
  as thin content — because to an article rule that is exactly what an About
  page looks like. They are skipped and counted.
- **A canonical pointing at another domain.** Ghost allows it, and for a
  syndicated post it is correct. This engine refuses one outright (rule C-07):
  the same tag on a post that was *not* syndicated hands that post's ranking to
  another domain, and nothing about the page looks wrong afterwards. The URL is
  in the report with both ways out — add it back by hand if the article really
  did run elsewhere first, or set `PUBLIC_SITE_URL` if that domain is simply
  where this site now lives.
- **Internal tags** (`#featured` and friends). Ghost hides them from the front
  end by definition; migrating them publishes an editorial marker as a keyword.
- **Drafts and scheduled posts.** Only `status: 'published'` is read.
- **Everything outside the parity line** — members, tiers, `visibility`,
  newsletters, `email_*`, comments, staff accounts, `codeinjection_*`. ADR 0007
  says why, and why that exclusion list is what makes this engine AI-operable.

## Then

```bash
pnpm build && pnpm validate     # read validate-report.json, not the console
```

Expect work here. Sixty-one imported articles are sixty-one articles that were
never written against this site's rules: C-02 wants internal links, C-26 wants
substance, C-34 wants alt text on every hero. That is the point — the gate is
telling you what the old site was getting away with.

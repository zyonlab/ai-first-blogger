# Ghost and WordPress migration

Use this playbook to migrate a Ghost content export or a WordPress WXR export into the Git-managed Astro content repository. The importer is deliberately review-first: it creates no files unless an exact dry-run plan is confirmed.

## Supported inputs

- Ghost content export JSON, with `meta` and `data` either at the document root or inside `db[0]`.
- WordPress eXtended RSS (WXR/XML) produced by **Tools → Export** or `wp export`.
- Ghost posts and pages with HTML or Lexical bodies.
- WordPress posts and pages. Custom post types are listed as skipped because their destination semantics are project-specific.

Ghost documents its export as JSON containing posts, pages, staff users, tags, and settings. Its migration format uses database-style arrays plus relationship tables for post-tag and post-author links. WordPress documents WXR as containing posts, pages, custom post types, users, terms, comments, and custom fields.

## Before importing

1. Commit or stash unrelated work. Run the migration on a dedicated branch.
2. Export all content from the source CMS.
3. Back up media separately. Ghost's manual backup guide treats images/files/media as separate files, while WordPress states that WXR contains attachment records but not attachment binaries.
4. Decide which repository category should receive the imported material. The default is `notes`.
5. Keep the export private if it contains unpublished or member-only content. Do not commit source exports containing personal data.

The fixtures under `scripts/fixtures/` contain only `example.com` data and are safe to commit. They are examples, not templates for real credentials.

## Dry-run

Ghost:

```bash
pnpm exec tsx scripts/import-content.ts /path/to/site.ghost.json --category notes
```

WordPress:

```bash
pnpm exec tsx scripts/import-content.ts /path/to/site.wordpress.xml --category notes
```

Format detection uses the extension and document shape. Use `--format ghost` or `--format wordpress` only when detection is ambiguous.

The JSON output contains:

- `confirmationHash`: SHA-256 of the exact source, options, destination paths, rendered content, and audit entries.
- Planned MDX destinations and whether each will be created, overwritten, or blocked.
- Source author, tag/category, publication state, legacy URL, redirect, and media-reference mappings.
- Relevant source metadata such as status, visibility, source slug, SEO fields, page hierarchy, and featured-image linkage. Unknown WordPress custom-field values are not copied because they may contain plugin secrets or private data; their key names and count are reported for review.
- Skipped content and warnings for protected Ghost content, WordPress shortcodes, custom post types, missing dates, or unsupported bodies.
- A deterministic report path under `migration-reports/`.

Review every draft, skipped item, warning, redirect, and media reference before applying.

## Apply the reviewed plan

Copy the complete hash from the dry-run:

```bash
pnpm exec tsx scripts/import-content.ts /path/to/site.ghost.json \
  --category notes \
  --apply \
  --confirm <confirmationHash>
```

Any source or option change produces a different hash and stops the apply. Existing destinations block the plan by default. To replace them, first review a new dry-run with `--overwrite`, then apply that exact plan:

```bash
pnpm exec tsx scripts/import-content.ts /path/to/site.wordpress.xml \
  --category notes \
  --overwrite

pnpm exec tsx scripts/import-content.ts /path/to/site.wordpress.xml \
  --category notes \
  --overwrite \
  --apply \
  --confirm <newConfirmationHash>
```

`--overwrite` is explicit and is part of the confirmation hash. Without it, the writer uses exclusive file creation and cannot replace an existing MDX file or report.

## Mapping rules

| Source | Repository mapping |
| --- | --- |
| Ghost post/page, WordPress post/page | `src/content/posts/<deterministic-slug>.mdx` |
| Published public content | Keeps source publication state |
| Draft, scheduled, private, members, or paid content | Draft; protected Ghost content is never made public automatically |
| First author | `author` frontmatter |
| Additional authors | Migration report for manual editorial decisions |
| Tags and WordPress categories | `tags`; original WordPress categories also remain separately in the report |
| SEO, status, hierarchy, and selected custom metadata | Source metadata in the migration report; old canonicals are not applied automatically |
| Legacy permalink | `legacySlug` plus an explicit proposed redirect in the report |
| Feature/content/attachment images | References remain in content and the report; binaries are not downloaded |
| WordPress custom post types | Skipped with a reason |

Slugs are normalized with the repository slug function. Collisions are sorted by stable source identity and receive `-2`, `-3`, and so on. A missing date becomes `1970-01-01`, forces draft status, and creates a warning rather than inventing a current date.

## Media and redirect follow-up

The importer does not fetch remote files. This avoids silently copying licensed, private, or broken media and avoids inventing dimensions required by `content-plans/images.yaml`.

1. Download approved media from the source backup.
2. Rename files descriptively and add responsive variants where required.
3. Move them under `public/`, update MDX references, and register them in `content-plans/images.yaml`.
4. Review proposed redirects. Imported `legacySlug` values feed the repository redirect generator; keep only routes that should remain public.
5. Run `pnpm images:validate`, `pnpm redirects:generate`, and `pnpm redirects:validate`.

## Editorial and build review

1. Review imported HTML-to-Markdown output, captions, code blocks, embeds, shortcodes, and internal links.
2. Decide whether imported WordPress pages belong as articles or need a purpose-built Astro page.
3. Recover any Ghost Mobiledoc-only body manually. The importer supports the currently documented HTML and Lexical representations and reports Mobiledoc rather than guessing.
4. Complete the repository content workflow before publishing. Imports do not manufacture research briefs, source ledgers, or editorial approval.
5. Run:

```bash
pnpm content:validate
pnpm check
pnpm build
```

Commit source-independent MDX, approved media, image/redirect plan changes, and the migration report. Do not commit a real CMS export unless its privacy and licensing have been reviewed.

## Official references

- [Ghost: Exporting content and data](https://ghost.org/help/exports/)
- [Ghost Developer Docs: migration JSON structure](https://docs.ghost.org/migration/custom/)
- [Ghost: manual backup and separate media files](https://ghost.org/docs/faq/manual-backup/)
- [WordPress: Tools Export screen and WXR contents](https://wordpress.org/documentation/article/tools-export-screen/)
- [WordPress Developer Resources: `wp export` and attachment-file limitation](https://developer.wordpress.org/cli/commands/export/)

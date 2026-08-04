# Template Customization

Where to change what. Full contract: `../specs/site-config-contract.md`.

## Brand
`site/site.yaml` — name, title, description, url, locale, author, social, hero
copy and CTAs, services copy, theme selection, theme storage key, default OG image.

## Taxonomy
`site/taxonomy.yaml` — pillars, topics and series. The valid `category` vocabulary is
derived from the topic keys, so there is nothing else to keep in sync.
Reference: `../specs/taxonomy.md`.

## Page copy
`site/pages.yaml` — About sections, Uses table, Newsletter copy, Work-with-me
service list, and the Topics / Series index descriptions.

## Content types
Two halves. `site/content-types.yaml` — route, label, list copy and surfaces.
`packages/engine/content-types/<name>.ts` — schema, JSON-LD, card and detail components.
Adding one does not touch pages, navigation, `llms.txt` or `rss.xml`; a type
declared in only one half is a build error naming the missing side.
Walkthrough: `../recipes/add-content-type.md`.

## What counts as publishable
`site/policy.yaml` — title/description widths, internal-link floor, whether
warnings block, and the optional writing-score floor. Every value ships with an
engine default; overrides are reported.
Reference: `../specs/content-contract.md`.

## Writing voice
`site/voice.md` — one file, two readers. The frontmatter `signals` block is what
`pnpm analyze` scores; the Markdown body is what a writing agent reads. Change it
to change how the site sounds; nothing in `engine/` encodes taste.

## Navigation
`site/site.yaml` holds static entries only. Content types register themselves via
`surfaces.nav`; `order` interleaves the two lists.

## UI strings
`packages/engine/i18n/<locale>.ts`. Only chrome belongs here — site copy goes in `site/`.
Walkthrough: `../recipes/add-locale.md`.

## Visual design
`site/themes/<name>.css` holds the token set; `packages/engine/styles/global.css` holds structure
and must contain no literal colours (rule C-13).
Walkthrough: `../recipes/add-theme.md`.

## Content
```
content/posts/
content/videos/
content/projects/
content/case-studies/
```

## Validation
```bash
pnpm check
pnpm build
pnpm validate    # must be 0 errors
pnpm metrics     # T1 reports any file that would block a rebrand
pnpm analyze     # writing-style signals per file, with fixes
```

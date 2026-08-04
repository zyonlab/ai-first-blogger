# Theming

A theme is one CSS file containing two token blocks. Nothing else.

## Contract

Themes live with the site, not with the engine — a theme is the one thing every
owner edits, and a package you cannot edit is the wrong shape for one. The
engine receives them through the `virtual:aifb/themes` module the integration
builds; `themesDir` in `astro.config.mjs` says where to look, defaulting to
`site/themes`. Only the selected theme is emitted into the build.


```
site/themes/<name>.css     the token set, for the default mode and the alternate mode
site/site.yaml          theme.name selects it; theme.defaultMode picks the mode
```

Switching themes is a one-line change. Adding a theme is one file. No component,
layout or page is touched — enforced by rule C-13 (`pnpm validate`), which fails if
`packages/engine/styles/global.css` contains any literal colour.

`site/themes/paper.css` ships as a working example: light-first, serif, warm palette.

## The two blocks

The **default mode** goes in `:root`, the **alternate mode** in
`:root[data-theme='<other>']`.

| Theme | `:root` | Override block | `site.theme.defaultMode` |
|---|---|---|---|
| `default.css` | dark | `:root[data-theme='light']` | `'dark'` |
| `paper.css` | light | `:root[data-theme='dark']` | `'light'` |

`defaultMode` must match the theme's `:root` block. Getting this wrong renders the
override block on first paint.

## Token reference

Every theme must define all of these. Rule C-12 checks each theme against
`default.css` and fails the build on a missing token.

### Surfaces

| Token | Role |
|---|---|
| `--bg` | page background |
| `--body-gradient-end` | far end of the body gradient |
| `--surface` | cards, panels |
| `--surface-2` | insets, chips, secondary fills |
| `--panel-bg`, `--panel-bg-soft` | translucent panel fills |
| `--chip-bg` | tag and chip fill |
| `--header-bg` | sticky header, translucent |
| `--embed-bg` | video embed backdrop |

### Text

| Token | Role |
|---|---|
| `--text` | body text |
| `--muted` | secondary text, metadata |
| `--quote-text` | blockquote text |

### Accents and lines

| Token | Role |
|---|---|
| `--accent` | primary accent, links, focus |
| `--accent-2` | secondary accent |
| `--accent-ink` | text on an accent fill |
| `--warn` | warning state |
| `--line` | borders and dividers |
| `--error-line` | error borders (e.g. failed Mermaid render) |
| `--glow-cyan`, `--glow-green` | ambient glows |
| `--orb-gradient` | topic card orb |
| `--card-gradient` | card surface gradient |
| `--quote-bg` | blockquote background |

### Code

| Token | Role |
|---|---|
| `--code-bg`, `--code-text` | code block surface |
| `--code-inline-text`, `--code-inline-bg` | inline `code` |
| `--code-syntax-entity` | Shiki remap: identifiers |
| `--code-syntax-keyword` | Shiki remap: keywords |
| `--code-syntax-function` | Shiki remap: functions |
| `--code-syntax-string` | Shiki remap: strings |
| `--code-syntax-constant` | Shiki remap: constants |
| `--code-syntax-comment` | Shiki remap: comments |

### Depth and layout

| Token | Role |
|---|---|
| `--shadow`, `--panel-shadow`, `--image-shadow` | elevation |
| `--inset-highlight` | top inner highlight |
| `--content-width` | prose measure (e.g. `72ch`) |
| `--article-title` | article H1 size, usually a `clamp()` |

Plus `font-family` on `:root`, and `color-scheme` on each block so form controls and
scrollbars match.

### Diagrams follow the theme too

Mermaid renders with its own palette unless told otherwise. It used to be told
by two hardcoded colour sets in `MermaidRenderer.astro`, one per mode — so a
site that authored its own theme got prose in its colours and diagrams in
someone else's, and twenty hex literals sat in a component where rule C-13 could
not see them.

The component now reads the tokens off `:root` at render time, so diagrams
follow whatever theme and mode are active with no second source of truth. C-13
scans components as well as `global.css`, which is what would have caught the
original.

### Why syntax colours are tokens

Shiki writes github-dark colours as inline styles on every span. Overriding them used
to be keyed to `:root[data-theme='light']`, which silently breaks for a light-first
theme — the mode that needs remapping differs per theme. Routing them through tokens
lets each theme decide. The hex values that remain in `global.css` **selectors** are
Shiki's output, fixed by `markdown.shikiConfig.theme` in `astro.config.mjs`; they are
match targets, not themeable values, and C-13 ignores attribute selectors for that
reason.

## Adding a theme

1. `cp site/themes/default.css site/themes/mytheme.css`
2. Edit the values. Keep every token name.
3. Set `theme.name: 'mytheme'` and `theme.defaultMode` in `site/site.yaml`.
4. Update `theme.colorDark` / `theme.colorLight` to match the new `--bg` values —
   they drive `<meta name="theme-color">`.
5. `pnpm validate` (C-12 catches dropped tokens), then `pnpm build`.

Acceptance: `git diff --name-only` shows only `site/themes/mytheme.css` and
`site/site.yaml`.

## Related

- [`site-config-contract.md`](./site-config-contract.md)
- [`content-contract.md`](./content-contract.md) — rules C-12, C-13
- [`../recipes/add-theme.md`](../recipes/add-theme.md)

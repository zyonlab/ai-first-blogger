# Recipe: add a theme

**Cost**: 1 new CSS file, 1–4 lines in `site/site.yaml`. Zero component changes.

`site/themes/paper.css` already ships as a worked example — a light-first, serif,
warm-palette theme. Read it alongside this recipe.

## 1. Copy the reference theme

```bash
cp site/themes/default.css site/themes/mytheme.css
```

Keep **every** token name. Rule C-12 fails the build if a theme drops one, because a
missing token silently falls back to an unstyled value.

## 2. Decide the default mode

The `:root` block is your default mode; the other mode goes in an override block.

```css
/* Dark-first (like default.css) */
:root { color-scheme: dark;  --bg: #070b14; … }
:root[data-theme='light'] { color-scheme: light; --bg: #f7f8fb; … }

/* Light-first (like paper.css) */
:root { color-scheme: light; --bg: #fbfaf7; … }
:root[data-theme='dark']  { color-scheme: dark;  --bg: #16140f; … }
```

## 3. Activate it

`site/site.yaml`:

```ts
theme: {
  name: 'mytheme',
  defaultMode: 'light',        // must match your :root block
  colorDark: '#16140f',        // <meta name="theme-color"> per mode
  colorLight: '#fbfaf7',       // keep in sync with each block's --bg
},
```

A name with no matching file fails the build and lists the available themes.

## 4. Verify

```bash
pnpm validate   # C-12 token completeness, C-13 no stray colours
pnpm build
pnpm dev        # toggle both modes in the header
```

## Acceptance test

```bash
git status --porcelain
# ?? site/themes/mytheme.css
#  M site/site.yaml
```

Two paths. A modified `.astro` file means a colour was hardcoded in a component
instead of tokenised.

## What to change first

The tokens with the largest visual effect, in order:

1. `--bg`, `--surface`, `--surface-2` — the whole surface stack
2. `--text`, `--muted` — reading comfort
3. `--accent`, `--accent-2`, `--accent-ink` — brand identity
4. `font-family` on `:root`
5. `--content-width`, `--article-title` — reading rhythm
6. `--code-bg`, `--code-text` and the six `--code-syntax-*` tokens

## Syntax highlighting

Shiki writes `github-dark` colours as inline styles. `global.css` remaps them through
`--code-syntax-*`, so each theme decides what those become in each mode. Set all six
for both blocks — a light-first theme that leaves them at the dark values renders
unreadable code.

Changing the highlighter theme itself is `markdown.shikiConfig.theme` in
`astro.config.mjs`; if you do, the hex values in the `global.css` selectors must be
updated to match the new output.

## Gotchas

| | |
|---|---|
| First paint shows the wrong mode | `defaultMode` does not match the `:root` block |
| Browser chrome colour is wrong | `colorDark` / `colorLight` are out of sync with `--bg` |
| Form controls / scrollbars look wrong | `color-scheme` missing from a block |
| C-13 fails after editing `global.css` | move the value into the theme as a token |

## Related

- [`../specs/theming.md`](../specs/theming.md) — the full token reference
- [`../specs/content-contract.md`](../specs/content-contract.md) — rules C-12, C-13

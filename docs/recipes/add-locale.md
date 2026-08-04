# Recipe: add a locale

**Cost**: 1 new file, 2 lines in `packages/engine/i18n/index.ts`, 1 line in `site/site.yaml`.

This changes the **UI chrome** — button labels, `On this page`, `Published {date}`.
It does not translate your articles, the About page or your topic descriptions;
those are site content you rewrite in `site/`. The reasoning is in
[`../specs/i18n.md`](../specs/i18n.md).

## 1. Copy the reference locale

```bash
cp packages/engine/i18n/zh-CN.ts packages/engine/i18n/fr-FR.ts
```

Change the export so it is type-checked against the reference:

```ts
import type { MessageTable } from './types';

const messages: MessageTable = {
  'nav.menu': 'Menu',
  'toc.title': 'Sur cette page',
  'article.readingTime': '{minutes} min de lecture',
  // …
};

export default messages;
```

Keep the `{placeholders}` — `{date}`, `{minutes}`, `{label}`, and `{url}` / `{title}` /
`{description}` in `aiStudy.prompt`. Their position may move; their names may not.

## 2. Register it

`packages/engine/i18n/index.ts`:

```diff
 import enUS from './en-US';
+import frFR from './fr-FR';
 import zhCN from './zh-CN';

 export const locales: Record<string, MessageTable> = {
   'zh-CN': zhCN as unknown as MessageTable,
   'en-US': enUS,
+  'fr-FR': frFR,
 };
```

## 3. Activate it

`site/site.yaml`:

```ts
locale: 'fr-FR',
```

## 4. Verify

```bash
pnpm check   # a missing key is a type error naming the key
pnpm build
```

## Acceptance test

```bash
git status --porcelain
# ?? packages/engine/i18n/fr-FR.ts
#  M packages/engine/i18n/index.ts
#  M site/site.yaml
```

Three paths. A modified `.astro` file means a string was hardcoded in a component
rather than routed through `t()`.

## What follows automatically

Setting `site.locale` also drives:

| | Source |
|---|---|
| `<html lang>` | `activeLocale` |
| Date formatting | `Intl.DateTimeFormat(activeLocale)` |
| `og:locale` | `ogLocale` (underscore form) |
| `inLanguage` in every JSON-LD block | `site.locale` |

## Adding a message key

1. Add it to `packages/engine/i18n/zh-CN.ts` — the reference locale defines the key set.
2. `pnpm check` now fails for every other locale until each defines it.

That failure is the feature: adding a locale cannot half-succeed.

## Gotchas

| | |
|---|---|
| `site.locale "xx" has no message table` | file missing, or not registered in `locales` |
| Text still Chinese after switching | it is site content in `site/`, not chrome — rewrite it there |
| `{minutes}` renders literally | placeholder renamed; only the reference locale's names work |
| Want `/en/` and `/zh/` on one site | out of scope — see "Not covered" in [`../specs/i18n.md`](../specs/i18n.md) |

## Related

- [`../specs/i18n.md`](../specs/i18n.md)
- [`../specs/site-config-contract.md`](../specs/site-config-contract.md)

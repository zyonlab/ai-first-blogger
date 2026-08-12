# Site Configuration Contract

Which plane a value belongs to, and what must never appear in engine code.

## The three planes

```
site/       intent + policy — what a person decides   (YAML + Markdown)
content/    material        — what gets published     (MDX)
packages/   mechanism       — aifb-engine renders, aifb-cli runs the pipeline
```

The repository is a pnpm workspace whose root is the site itself. `packages/` is
the framework; a site's own repository would contain only the first two.

An agent needs one rule, not a table: **intent goes in `site/`, articles go in
`content/`, and `packages/` is not edited to make a site decision.** If a site
decision cannot be expressed in `site/`, that is a missing feature in the engine —
report it rather than working around it in code.

Reasoning and trade-offs: [`../adr/0002-three-planes.md`](../adr/0002-three-planes.md).

## Deciding where a value goes

| | Test | Home |
|---|---|---|
| **Intent** | A different owner would choose differently, and there is no correct answer. | `site/*.yaml`, `site/voice.md` |
| **Policy** | The engine has a defensible default, but a site may disagree. | `site/policy.yaml` |
| **Mechanism** | There is one correct implementation; editing it only breaks it. | `packages/` |

The middle row is the one that used to be missing. A threshold like "titles under
60 display columns" is neither brand nor implementation — it is a judgement the
engine ships an opinion about and a site may overrule. Before `policy.yaml` these
lived as constants inside the validation scripts, which made the values a site is
most likely to tune the ones it could only tune by forking the engine.

## The test this contract exists to pass

> Someone who is not the author forks this repo and publishes a site about a
> completely different subject, in a different language, without opening a single
> file under `packages/`.

`pnpm metrics` measures it as **T1** and reports the exact files that would block it.

## The intent plane

| File | Holds | Edited |
|---|---|---|
| `site/site.yaml` | name, url, locale, `locales`, `titleTemplate`, author, social, hero, `home`, services, theme choice, static nav, OG default | Always |
| `site/taxonomy.yaml` | pillars, topics, series — and the category vocabulary derived from them | Always |
| `site/content-types.yaml` | route, label, list copy and surfaces per content type | When adding a type |
| `site/policy.yaml` | thresholds and switches | When the defaults do not fit |
| `site/pages.yaml` | copy for the fixed pages — a key per page the site publishes | Always |
| `site/voice.md` | writing style — signals for the analyser, prose for the agent | When the voice changes |
| `site/themes/<name>.css` | the token set | When restyling |
| `site/templates/**` | markup that shadows the engine's, file for file | When tokens are not enough |

### Why YAML and Markdown, not TypeScript

A `.yaml` file cannot contain an import, a component or a conditional. The
boundary is therefore structural rather than conventional: intent cannot slowly
acquire mechanism the way the old `src/data/site.ts` did when it accumulated
`themeStorageKey` and `og.default` alongside brand copy.

It is the same technique as rule C-13 — no colour literals outside the theme
files. Enforce the line with the format, not with discipline.

The cost is literal types. `TopicSlug` used to be a union derived from the topic
map; it is now `string`, validated at runtime by `isCategory`. `taxonomy.md` had
already made that trade when it replaced `z.enum` with `refine`.

### The landing page: `home`

Which blocks the home page stacks, and in what order. Both were markup before,
so a site that wanted a different landing page had to fork `index.astro` and
take the SEO contract with it.

```yaml
home:
  # Order, and omission is subtraction: a site that lists only [content]
  # renders no taxonomy blocks. Default: [topics, series, content].
  sections: [content, topics, series]
  # The Focus Map beside the hero. Unset means "render it when hero.signals
  # has something in it", which is what a site with signals already saw.
  panel: false
```

`content` is one token for every content type declaring `surfaces.home` — their
order *among themselves* stays `surfaces.home.order`'s question, in
`site/content-types.yaml`. This list only says where that group sits relative
to Topics and Series.

## The dividing line inside text: chrome vs. content

- **Chrome** is text the framework emits regardless of what the site is about —
  `On this page`, `Published {date}`, `Copy prompt`, `Skip to content`.
  It lives in `packages/engine/i18n/` because it must be **translated**.
- **Content** is text about this particular site — the About page, the Uses
  table, topic descriptions, content type labels.
  It lives in `site/` because it must be **rewritten**, not translated.

Translating the About page into English is not what a new owner wants; they want
to replace it. Adding a *locale* is therefore an engine change (a shipped
translation), while choosing the locale — or choosing two — is intent.

Site copy in a second language is intent as well, and lives beside the copy it
translates: any mapping in `site/` may carry an `i18n:` block keyed by locale
tag. See [`i18n.md`](./i18n.md).

## Prohibitions

Under `packages/`, none of the following may appear **in code** (comments and
documentation are exempt):

| Prohibited | Instead |
|---|---|
| Natural-language copy (any script) | `t('key')` from `@i18n/index`, or `pages.*` |
| A locale literal (`'zh-CN'`, `'en_US'`) | `localeOfPath(Astro.url.pathname)` in a component; `site.locale` outside a render |
| A brand string, domain, or email | `site.*` from `@config/site` |
| A colour literal | a theme token via `var(--token)` |
| A collection name in `getCollection('posts')` | `getEntries(type)` with a type from the registry |
| A publishing threshold | `policy.*` from `@config/policy` |
| A title/label composition rule | `site.titleTemplate` — how pages are named is the site's call, not the layout's |

### Enforcement

`pnpm metrics` scans for the first five and fails T1/T2 with the offending file
list. C-13 in `pnpm validate` covers the colour case for CSS. The brand strings
it hunts for are read from `site/site.yaml`, so the check follows whoever owns the
site rather than the template author.

```bash
pnpm metrics
# ✓ T1 reuse            0 file(s) block a rebrand (target 0)
# ✓ T2 extensibility    0 hand-wired surface(s) across 4 content types (target 0)
```

## Failure behaviour

Misconfiguration fails at build time, naming the key and the fix, rather than
degrading silently:

| Mistake | What happens |
|---|---|
| `locale` has no message table | Build error listing how to add one |
| A locale in `locales` has no message table | Build error naming each one |
| `locale` is not listed in `locales` | Build error — the default locale is still a locale |
| Two locales share a URL prefix | Build error naming both |
| A locale prefix collides with a content type route or a fixed page | Build error naming the section it would shadow |
| An `i18n:` block names a locale the site does not publish | Build error listing the declared ones |
| `theme.name` has no CSS file | Build error listing available themes |
| A series references an unknown topic | Build error from the taxonomy loader |
| A topic references an unknown pillar | Build error listing valid pillars |
| A pillar owns no topic | Build error — strategy the site never implemented |
| A content type is declared but the engine has no module for it | Build error listing the available types |
| Two content types claim one route | Build error naming both |
| A content type route shadows a static page | Build error naming the collision |
| `og.default` is an SVG | Build error — no platform renders it (C-01) |
| YAML is malformed | Build error with the parser's message |

## Related

- [`../adr/0002-three-planes.md`](../adr/0002-three-planes.md) — why it is shaped this way
- [`i18n.md`](./i18n.md)
- [`theming.md`](./theming.md)
- [`taxonomy.md`](./taxonomy.md)
- [`content-contract.md`](./content-contract.md)

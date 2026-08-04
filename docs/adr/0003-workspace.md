# ADR 0003 — pnpm workspace: the framework becomes packages

**Status**: accepted · **Date**: 2026-08-03 · **Builds on**: [0002](./0002-three-planes.md)

## Context

The three planes were directories in one repository, which made the boundary
*legible* but not *enforceable at the dependency level*. The distribution model
was still fork-and-own, and that has one consequence nobody wants: **upstream
fixes cannot reach a fork.**

That is not hypothetical. In a single working session this engine gained a
planning preflight, ten on-page SEO rules, a source-level link resolver, and
three fixed defects — a theme-colour check whose block indices were off by one
so it never ran, C-12 counting tokens file-wide so a missing alternate-mode
token was invisible, and C-22 counting every `<article>` so a correct topic page
reported a mismatch. Anyone who had forked earlier gets none of it except by
merging a repository that has since diverged.

## Decision

The repository is a pnpm workspace whose **root is the site**:

```
site/       intent      — what a person decides
content/    material    — the articles
packages/
  engine/   aifb-engine  components, layouts, routes, config loader, deploy
  cli/      aifb-cli     preflight, gate, analyser, context, metrics, migration
examples/   reference sites
```

A site's own repository is the first two plus a config file. `packages/` is a
dependency.

### Why the root is the site

Dogfooding is not optional for this product: every rule it ships is a claim
about content it must itself satisfy. Keeping the site at the root means the
framework is exercised by `pnpm build` on every change, rather than by an
example nobody runs.

### Routes are injected, not found

`srcDir` pointing at `packages/engine` would have worked while the engine is a
sibling directory, and stopped working the moment it is a dependency in
`node_modules` — which is the entire point of packaging it.

So the engine is an Astro integration. It derives its route patterns from its own
`pages/` tree and calls `injectRoute` for each, and it registers Vite aliases for
its internal `@components` / `@lib` / `@config` imports so they resolve to the
package wherever it is installed. Verified by deleting `paths` from the site's
`tsconfig.json` and rebuilding: 15 routes injected, 12 pages built.

Patterns are derived rather than listed, for the same reason content types
self-register — a list maintained by hand is a list that will be wrong.

The site keeps exactly one file of its own beyond `site/` and `content/`:
`src/content.config.ts`, a two-line re-export, because Astro requires the
collection config inside the project's own srcDir.

### Engine content types are a menu, not a mandate

The registry used to require both halves of every content type: a module in the
engine *and* a key in `site/content-types.yaml`, with either one alone failing
the build by name. That was right while both halves lived in one repository.

It became wrong the moment the engine was a dependency, and a simulated site
found it within minutes: the persona did not publish videos, deleted the
`videos` key — and could not build, because the engine half sits in
`node_modules` where no site can delete it. A site could never decline a type
the engine happened to ship.

So the asymmetry is now deliberate. An engine type nobody declares is simply not
published; its routes, nav entry and `llms.txt` section never exist. A declared
type with no engine module is still an error, because the site asked for
something that does not exist and dropping it silently would leave a section
missing for reasons nobody can see.

The remaining limitation is the mirror of this: a packaged site cannot *add* a
content type either, because there is nowhere to put the engine half. Passing
site-provided modules through `engine({ contentTypes: [...] })` is the obvious
answer and is not built yet.

### The site's files are handed over, never reached for

The engine used to load themes with a relative `import.meta.glob` from a layout
up into `site/themes/`. That path silently resolved to nothing the moment the
engine became a package: the build failed at render time, and only
`pnpm test:scenarios` caught it — not types, not the self-test.

A package must not know how the project that installed it is laid out. The
integration knows, because Astro hands it the project root, so it supplies a
virtual module (`virtual:aifb/themes`) holding the selected theme's URL and the
names of the rest for error messages. `themesDir` is an option, defaulting to
`site/themes`.

It also fixed something the glob had been doing quietly: eagerly importing every
theme emitted all of them as build assets, and every one but the active theme
was dead weight no page linked to.

### Scaffolding is part of the product

`create-aifb` writes a site and nothing else: `site/`, `content/`,
`src/content.config.ts`, an Astro config, `public/`, the workflow. It defaults to
the skeleton and takes `--example` to start from a planned site instead.

### The CLI is a real binary

`packages/cli` exposes `aifb <command>`. The root scripts still work and are
what the docs use; the binary is what a site depending only on the package will
call.

## Consequences

**Better**

- An engine fix can reach a site through a version bump instead of a merge.
- The intent/mechanism boundary is a dependency edge, not a convention: editing
  the framework from a site now means editing something in `node_modules`.
- `aifb-cli` depends on `aifb-engine`, never the reverse — the pipeline reads
  the config loader, and the renderer knows nothing about the pipeline.

**Worse**

- Themes are copied by the scaffold rather than depended on. A theme is the
  site's to edit, and a package you cannot edit is the wrong shape for one — but
  it does mean theme improvements do not arrive with a version bump.
- Nothing is published yet, so the version numbers in a scaffolded
  `package.json` do not resolve. `create-aifb` produces a correct site; making
  `pnpm install` succeed in it needs a registry.

## Related

- [`0002-three-planes.md`](./0002-three-planes.md)
- [`../specs/deployment.md`](../specs/deployment.md)

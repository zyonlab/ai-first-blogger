# Releasing

Three packages, one version, published by a tag.

| Package | |
|---|---|
| [`aifb-engine`](https://npmjs.com/package/aifb-engine) | Astro integration |
| [`aifb-cli`](https://npmjs.com/package/aifb-cli) | the pipeline; the command is `aifb` |
| [`create-aifb`](https://npmjs.com/package/create-aifb) | scaffold |

## Why they share a version

`create-aifb` writes a `package.json` that pins the other two at **its own
version**. Releasing them independently would let it scaffold a site asking for
`aifb-engine@^0.3.0` when only `0.2.0` exists — a broken install that nothing in
this repository would notice.

So the version is a property of the set, and `tools/check-release.mjs` refuses a
release where the three disagree.

## The risk this process exists to manage

This repository has a double identity: it is the workspace that builds the
packages, **and** a site that consumes them. The site resolves them through
workspace links, so it always exercises what is on disk and never what is on
npm.

That means `pnpm build`, `pnpm validate` and `pnpm test:scenarios` can all be
green while the published `aifb-engine` is several commits behind. Nothing in
the normal loop can see the gap. The release check is what looks.

## Releasing

```bash
# 1. Bump all three, together
#    packages/{engine,cli,create}/package.json → "version": "0.2.0"

# 2. Check before tagging
pnpm release:check

# 3. Tag and push
git tag v0.2.0 && git push origin v0.2.0
```

The tag triggers `.github/workflows/release.yml`, which runs the framework's own
tests, re-runs the release check against the tag, then publishes.

> **The tag path does not work today.** `NPM_TOKEN` is not set on this
> repository — `gh secret list` shows only the two Cloudflare secrets. Tagging
> runs the whole workflow, passes every check, and then fails at `Publish` with
> an auth error, leaving a tag behind that published nothing.
>
> Until the secret exists, release from a machine that is logged in:
>
> ```bash
> npm whoami                 # must be the account that owns the three packages
> pnpm release:check         # same gate CI would run
> pnpm build:packages
> pnpm publish -r --access public
> git tag v0.5.0 && git push origin v0.5.0   # after, as the record
> ```
>
> The local path loses `--provenance`, which is the signed record of the commit
> and workflow that built each package. That is a real difference, not a
> formality: it is the thing that lets someone verify a tarball on npm came from
> this repository. Adding the secret and re-running the tag is the better fix.

`pnpm publish -r` walks the workspace in dependency order and skips any package
whose version is already on npm — so re-running a failed release is safe, and
publishing order is not something anyone has to remember.

## What `pnpm release:check` verifies

| | |
|---|---|
| One version across all three | `create-aifb` pins the others at its own version |
| Nothing is `private` | a private package fails at the registry, after the tag exists |
| `author` / `license` / `repository` / `files` present | `files` especially — without it, everything in the directory ships |
| No placeholders | `Your Name`, `TODO`, `REPLACE_ME`, `example.com`. A previous package by this author shipped `author: "Your Name"` to npm; this product refuses to publish a site full of placeholders and should hold itself to the same rule |
| Every bare import is declared | reads the specifiers out of each package's own source and fails on one the manifest does not account for. `aifb-engine` shipped 0.4.0 importing `@astrojs/rss` and `mermaid` while declaring neither: this repository builds anyway, because the root installs both, so nothing else can catch it |
| A locale table is in its locale | flags a value in a non-Latin message table containing no character from that script. `zh-CN.ts` shipped ten English values — the keys were all present, which is the only thing the type system sees |
| What is already on npm | reports which versions the publish step would actually create |
| Changes since the last tag | `packages/` changed but the version did not → the release would ship nothing while looking successful |
| The tag matches | only when a tag argument is passed, i.e. in CI |

## Credentials

CI needs `NPM_TOKEN` as a repository secret — a **granular access token with
"bypass 2FA" enabled**, because the account requires 2FA for publishing and a
workflow cannot answer an OTP prompt. **It is not currently set**, which is why
the box above exists; check with `gh secret list` before trusting a tag to
publish anything.

A failed publish is recoverable and does not need a new version: `pnpm publish
-r` skips any package already on npm, so adding the secret and re-running the
workflow on the same tag finishes the job.

Locally, the token belongs in `~/.npmrc`, never in the repository. `.npmrc` is
in `.gitignore` so a project-local one cannot be committed by accident.

The workflow publishes with `--provenance`, which requires `id-token: write` and
attaches a signed record of the commit and workflow that built each package.

## Versioning

`0.x` while the known limitations stand — a packaged site cannot add a content
type (#24), cannot declare a standalone page (#27), cannot move a taxonomy
prefix (#26), adding a locale still means touching the engine, and themes are
copied rather than depended on. Those are interface-shaped gaps, and `0.x` says
the interface can still move.

## Related

- [`deployment.md`](./deployment.md) — deploying a site, which is a different thing
- [`../adr/0003-workspace.md`](../adr/0003-workspace.md) — why the framework is packages

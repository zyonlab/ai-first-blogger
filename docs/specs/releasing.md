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
| What is already on npm | reports which versions the publish step would actually create |
| Changes since the last tag | `packages/` changed but the version did not → the release would ship nothing while looking successful |
| The tag matches | only when a tag argument is passed, i.e. in CI |

## Credentials

CI needs `NPM_TOKEN` as a repository secret — a **granular access token with
"bypass 2FA" enabled**, because the account requires 2FA for publishing and a
workflow cannot answer an OTP prompt.

Locally, the token belongs in `~/.npmrc`, never in the repository. `.npmrc` is
in `.gitignore` so a project-local one cannot be committed by accident.

The workflow publishes with `--provenance`, which requires `id-token: write` and
attaches a signed record of the commit and workflow that built each package.

## Versioning

`0.x` while the known limitations stand — a packaged site cannot add a content
type, adding a locale still means touching the engine, and themes are copied
rather than depended on. Those are interface-shaped gaps, and `0.x` says the
interface can still move.

## Related

- [`deployment.md`](./deployment.md) — deploying a site, which is a different thing
- [`../adr/0003-workspace.md`](../adr/0003-workspace.md) — why the framework is packages

# Dependency Update Policy

- Direct dependencies use exact versions in `package.json`.
- `pnpm-lock.yaml` is committed and CI installs with `--frozen-lockfile`.
- Node.js and pnpm versions are declared in GitHub Actions and `packageManager`.
- Dependabot opens grouped weekly updates for npm packages and GitHub Actions.
- Dependency pull requests must pass `pnpm check` and `pnpm build`.
- Astro major upgrades require a release preview and a check of content collections, generated routes, Mermaid, sitemap, RSS, and JSON-LD.
- Do not merge dependency updates only because a newer version exists. Review release notes for breaking behavior and security impact.

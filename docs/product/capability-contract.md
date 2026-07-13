# AI First Blogger Capability Contract

This document defines the supported product boundary. It prevents the framework from becoming a partial clone of a traditional CMS.

## Core Capabilities

The framework must provide these capabilities without external publishing services:

- Validated site, author, domain, locale, navigation, and social configuration.
- File-based articles, series, topics, videos, projects, and case studies.
- Structured research, briefs, evidence, editorial reviews, and publishing states.
- Static previews, production builds, RSS, sitemap, robots.txt, canonical URLs, and supported structured data.
- Search, pagination, archives, related content, redirects, and media optimization when the content inventory requires them.
- Automated checks for configuration, content contracts, internal links, structured data, accessibility, and page experience.
- Git-based review, history, rollback, and release-to-main promotion.
- Search Console and optional analytics feedback for maintenance decisions.

## Git-native Replacements

These traditional CMS features are intentionally implemented through Git and CI:

| CMS capability | Framework contract |
| --- | --- |
| Revision history | Git commits and diffs |
| Editorial review | Pull requests and required checks |
| Preview | `release` deployment |
| Production publish | Merge to `main` |
| Rollback | Revert a reviewed commit and redeploy |
| Scheduled publish | Future-date filtering and scheduled GitHub Actions build |
| Permissions | Repository and branch protection permissions |

The supported baseline is a single publication with one primary author. Multi-author identity and permissions are optional extensions.

## Optional Adapters

The machine-readable adapter contract is `content-plans/optional-adapters.yaml`.

The following capabilities must remain optional and must not create empty UI, scripts, secrets, or runtime dependencies when disabled:

- Newsletter delivery.
- Comments and reactions.
- Memberships and paid subscriptions.
- Privacy-friendly web analytics.
- Web-based CMS editing.
- Multiple authors and editorial roles.
- External search services.

## When to Introduce Ghost

Keep Git and MDX as the only content source while the site is maintained by technical authors and agents.

Consider Ghost as a headless CMS only when at least one requirement is real:

- Non-technical authors need a browser editor.
- The publication needs native email delivery and subscriber management.
- Paid memberships or gated content are part of the business model.
- A multi-author editorial team needs CMS roles and workflows.

If Ghost is introduced, choose one canonical content source. Do not edit the same article independently in Ghost and Git.

## Capability Change Rule

A platform capability is complete only when it has:

- A canonical contract or schema.
- Automated validation, or a documented human check when automation is not reliable.
- A passing example and a failing example.
- Agent-facing instructions that reference the canonical contract.
- A release preview before production promotion.

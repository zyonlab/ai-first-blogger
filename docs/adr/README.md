# Architecture Decision Records

One file per decision that is expensive to reverse. Format: context → decision →
consequences, including the alternatives that were rejected and why.

An ADR is not documentation of how the code works — that is what `docs/specs/` is
for. An ADR records **why** it works that way, so a future reader (or agent) does not
undo the decision without knowing what it cost.

| # | Title | Status |
|---|---|---|
| [0001](./0001-content-type-registry.md) | Content type registry | accepted |
| [0002](./0002-three-planes.md) | Three planes: intent, content, engine | accepted |
| [0003](./0003-workspace.md) | pnpm workspace: the framework becomes packages | accepted |
| [0004](./0004-template-api.md) | What a template override may import | accepted |
| [0005](./0005-mounting-the-engine.md) | Mounting the engine under a prefix | accepted |

## Writing one

Copy an existing file. Keep it short — a page is usually enough. Required sections:

- **Context** — what forced the decision, including the concrete failure if there was one
- **Decision** — what was chosen, in enough detail to implement
- **Consequences** — good and bad, honestly; a decision with no downside was not a decision
- **Rejected alternatives** — and the reason each lost
- **Verification** — the command that proves the decision is still holding

Status is `proposed`, `accepted`, `superseded by NNNN` or `deprecated`. Never edit an
accepted ADR's decision — write a new one that supersedes it.

## Decisions that would need an ADR

Recorded here so they are not made by accident:

- **Distributing as an npm package** instead of a fork template. Changes the whole
  extension model and the upgrade path. Considered and deferred in 0001.
- **Video generation and YouTube publishing.** Introduces long-running jobs, third-party
  OAuth, and writing build artefacts back into the repository — none of which the
  current static pipeline does. Deferred.
- **Multi-locale routing** (`/en/`, `/zh/` from one build). Needs per-locale content
  collections, hreflang and route changes. Out of scope for the current i18n layer.
- **Replacing regex HTML inspection in the validation pipeline with a real parser.**
  Required before any accessibility rule, or before validating third-party HTML.

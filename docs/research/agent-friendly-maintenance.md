# Agent-friendly Maintenance Research

## Findings

- Use `AGENTS.md` as the primary cross-agent instruction file. Codex, OpenCode, Copilot-style coding agents, and many newer agent tools recognize or recommend this convention.
- Keep instructions concise and operational. Agents need commands, file ownership rules, validation gates, and deployment rules more than broad product prose.
- Use MCP for portable context access. A tool-specific skill is useful, but MCP gives different hosts a common way to read site configuration, prompts, content inventory, and workflow contracts.
- For OpenClaw-like always-on agents, assume workspace routing and broad tool access. Make destructive operations explicit: no DNS changes, no secrets, no generated folder edits, no production deploy without the intended branch.
- For OpenCode-like tools, project-local agent definitions can help specialized roles. Keep role prompts narrow and non-destructive.
- For Claude Code-like tools, slash-command style workflows are useful for repeatable tasks. The repository should still keep the canonical instructions in normal Markdown so other agents can reuse them.

## Practical conventions for this repo

- Root `AGENTS.md`: stable rules and validation gates.
- `.ai/skills/ai-first-blogger/SKILL.md`: Codex-style skill entry.
- `mcp/server.ts`: portable project context and workflow contracts.
- `content-plans/*.yaml`: structured plans that agents can parse without prose guessing.
- `prompts/*.md`: reusable task contracts.
- `docs/playbooks/*.md`: human-readable and agent-readable operating procedures.

## Agent safety rules

- Prefer `release` for staging and `main` for production.
- Never edit `dist/`, `.astro/`, `node_modules/`, or secrets.
- Never modify DNS/custom domains without explicit approval.
- Run `pnpm check` after content/schema/code changes.
- Run `pnpm build` before SEO/GEO, layout, deployment, or MCP readiness claims.

## Content maintenance rules

- Do not draft final articles from a topic alone.
- First produce research or a brief.
- Use `content-plans/content-pipeline.yaml` for methodology and quality gates.
- Use `docs/playbooks/content-pipeline.md` for output contracts.
- Use `get_content_inventory` before internal links or series planning.

## Source notes

- `AGENTS.md`: https://agents.md/
- OpenCode rules: https://opencode.ai/docs/rules/
- OpenCode agents: https://opencode.ai/docs/agents/
- OpenCode skills: https://opencode.ai/docs/skills/
- OpenCode config for project agents and commands: https://opencode.ai/docs/config/
- MCP TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk

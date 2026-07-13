# MCP and Skills

This project should use both layers:

- **Skill**: tells an agent when and how to operate this framework.
- **MCP server**: gives Codex, Claude Code, OpenCode-style tools, and other MCP hosts the same project context and prompt contracts.

## Why both

Skills are useful for agent-native triggering, but they are not equally portable across tools. MCP is the portable integration layer. The practical split is:

| Layer | Responsibility                                                                                   |
| ----- | ------------------------------------------------------------------------------------------------ |
| Skill | Trigger words, workflow rules, editing discipline, validation expectations                       |
| MCP   | Read project context, expose prompt templates, list content inventory, return workflow contracts |
| Agent | Apply edits, run checks, commit, deploy, and make judgment calls                                 |

## Local MCP command

Run the server from the project root:

```bash
pnpm mcp:server
```

The server uses stdio and is intended to be started by an MCP host, not used directly in a terminal.

## Generic MCP config

Use this shape in tools that accept JSON MCP server config:

```json
{
  "mcpServers": {
    "ai-first-blogger": {
      "command": "pnpm",
      "args": ["mcp:server"],
      "cwd": "/absolute/path/to/ai-first-blogger"
    }
  }
}
```

For Codex-style TOML config:

```toml
[mcp_servers.ai-first-blogger]
command = "pnpm"
args = ["mcp:server"]
cwd = "/absolute/path/to/ai-first-blogger"
```

If a tool does not support `cwd`, set:

```bash
AI_FIRST_BLOGGER_ROOT=/absolute/path/to/ai-first-blogger
```

## Exposed tools

- `healthcheck`: confirms required project files are readable.
- `get_site_context`: returns agent rules, site config, content plan, prompt map, and optional inventory.
- `list_prompts`: lists bundled prompt templates.
- `read_prompt`: reads one prompt template.
- `get_workflow_contract`: returns the prompt, required files, and checklist for setup, planning, writing, SEO/GEO, deployment, or maintenance.
- `get_content_pipeline`: returns methodology, pipeline stages, and quality gates for research, series planning, article briefs, editing, and SEO/GEO.
- `get_content_inventory`: lists MD/MDX content files with collection, title, slug, status, and tags.

## Recommended agent flow

1. Call `healthcheck`.
2. Call `get_workflow_contract` with the closest workflow.
3. For content tasks, call `get_content_pipeline`.
4. Read only the referenced files needed for the task.
5. Edit repository files directly.
6. Run `pnpm check`; run `pnpm build` for SEO/GEO, layout, schema, and deployment changes.

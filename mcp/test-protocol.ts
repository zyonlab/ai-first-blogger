import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = await mkdtemp(path.join(os.tmpdir(), "afb-mcp-protocol-"));
const transport = new StdioClientTransport({
  command: path.join(process.cwd(), "node_modules/.bin/tsx"),
  args: [path.join(process.cwd(), "mcp/server.ts")],
  cwd: process.cwd(),
  env: {
    PATH: process.env.PATH ?? "",
    AI_FIRST_BLOGGER_ROOT: root,
  },
  stderr: "pipe",
});
const client = new Client({ name: "afb-write-smoke", version: "1.0.0" });

function readTextContent(result: unknown): string {
  const content = (result as { content?: unknown }).content as
    | Array<{ type: string; text?: string }>
    | undefined;
  const item = content?.find((entry) => entry.type === "text");
  if (!item?.text) throw new Error("Expected MCP text content.");
  return item.text;
}

try {
  await client.connect(transport);
  const tools = await client.listTools();
  const names = new Set(tools.tools.map((tool) => tool.name));
  for (const name of [
    "healthcheck",
    "get_site_context",
    "create_content_artifact",
    "create_draft_content",
    "update_content_plan",
  ]) {
    assert(names.has(name), `Expected MCP tool ${name}`);
  }

  const preview = await client.callTool({
    name: "create_content_artifact",
    arguments: {
      path: "research/protocol.yaml",
      content: "kind: topic-research\ntitle: Protocol smoke\n",
    },
  });
  assert.equal(preview.isError, false);
  const previewPayload = JSON.parse(readTextContent(preview));
  assert.equal(previewPayload.dryRun, true);
  assert.equal(previewPayload.written, false);
  assert.match(previewPayload.diff, /protocol\.yaml/);

  const refused = await client.callTool({
    name: "create_content_artifact",
    arguments: {
      path: "../escape.md",
      content: "escape\n",
      dryRun: false,
      confirmWrite: true,
    },
  });
  assert.equal(refused.isError, true);
  assert.equal(JSON.parse(readTextContent(refused)).code, "UNSAFE_PATH");
} finally {
  await client.close();
}

console.log("MCP guarded write protocol smoke passed.");

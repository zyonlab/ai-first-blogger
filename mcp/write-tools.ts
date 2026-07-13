import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  GuardedWriteError,
  guardedProjectWrite,
  type WriteScope,
} from "./write-guard.js";

const writeInputSchema = {
  path: z.string().min(1).describe("Path relative to the tool's fixed safe directory."),
  content: z.string().describe("Complete UTF-8 file content."),
  dryRun: z.boolean().optional().default(true).describe("Preview only. Defaults to true."),
  confirmWrite: z.boolean().optional().default(false).describe("Required with dryRun=false."),
  confirmOverwrite: z.boolean().optional().default(false).describe("Required to replace an existing file."),
  confirmStateChange: z.boolean().optional().default(false).describe("Required for publication or workflow state changes."),
  expectedSha256: z.string().regex(/^[a-f0-9]{64}$/).optional().describe("Current previousSha256 from a fresh dry-run; required for overwrite."),
};

function response(payload: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    isError,
  };
}

function registerScopedWrite(
  server: McpServer,
  projectRoot: string,
  options: {
    name: string;
    title: string;
    description: string;
    scope: WriteScope;
  },
) {
  server.registerTool(
    options.name,
    {
      title: options.title,
      description: options.description,
      inputSchema: writeInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      try {
        return response(
          await guardedProjectWrite(projectRoot, {
            scope: options.scope,
            relativePath: input.path,
            content: input.content,
            dryRun: input.dryRun,
            confirmWrite: input.confirmWrite,
            confirmOverwrite: input.confirmOverwrite,
            confirmStateChange: input.confirmStateChange,
            expectedSha256: input.expectedSha256,
          }),
        );
      } catch (error) {
        if (error instanceof GuardedWriteError) {
          return response(
            { ok: false, code: error.code, message: error.message },
            true,
          );
        }
        throw error;
      }
    },
  );
}

export function registerGuardedWriteTools(server: McpServer, projectRoot: string) {
  registerScopedWrite(server, projectRoot, {
    name: "create_content_artifact",
    title: "Create or update a content workflow artifact",
    description:
      "Preview or write one bounded research, brief, series, fact, review, scorecard, or workflow file under content-work/. Defaults to dry-run and returns a unified diff.",
    scope: "artifact",
  });

  registerScopedWrite(server, projectRoot, {
    name: "create_draft_content",
    title: "Create or update Git-managed blog content",
    description:
      "Preview or write one Markdown/MDX content file under src/content/. Defaults to dry-run. Publishing or changing draft/state fields requires separate explicit confirmation.",
    scope: "content",
  });

  registerScopedWrite(server, projectRoot, {
    name: "update_content_plan",
    title: "Create or update a content plan",
    description:
      "Preview or write one bounded planning document under content-plans/. Defaults to dry-run; existing files require a fresh hash and explicit overwrite confirmation.",
    scope: "plan",
  });
}

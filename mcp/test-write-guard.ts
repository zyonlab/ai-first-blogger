import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  GuardedWriteError,
  guardedProjectWrite,
} from "./write-guard.js";

async function expectGuardError(
  code: string,
  operation: () => Promise<unknown>,
) {
  await assert.rejects(operation, (error: unknown) => {
    assert(error instanceof GuardedWriteError);
    assert.equal(error.code, code);
    return true;
  });
}

const root = await mkdtemp(path.join(os.tmpdir(), "afb-mcp-write-"));

const preview = await guardedProjectWrite(root, {
  scope: "artifact",
  relativePath: "briefs/example.yaml",
  content: "kind: article-brief\ntitle: Example\n",
});
assert.equal(preview.dryRun, true);
assert.equal(preview.written, false);
assert.equal(preview.operation, "create");
assert.match(preview.diff, /--- \/dev\/null/);

await expectGuardError("WRITE_CONFIRMATION_REQUIRED", () =>
  guardedProjectWrite(root, {
    scope: "artifact",
    relativePath: "briefs/example.yaml",
    content: "kind: article-brief\ntitle: Example\n",
    dryRun: false,
  }),
);

const created = await guardedProjectWrite(root, {
  scope: "artifact",
  relativePath: "briefs/example.yaml",
  content: "kind: article-brief\ntitle: Example\n",
  dryRun: false,
  confirmWrite: true,
});
assert.equal(created.written, true);
assert.equal(
  await readFile(path.join(root, "content-work/briefs/example.yaml"), "utf8"),
  "kind: article-brief\ntitle: Example\n",
);

const identical = await guardedProjectWrite(root, {
  scope: "artifact",
  relativePath: "briefs/example.yaml",
  content: "kind: article-brief\ntitle: Example\n",
  dryRun: false,
});
assert.equal(identical.operation, "unchanged");
assert.equal(identical.written, false);

const updatePreview = await guardedProjectWrite(root, {
  scope: "artifact",
  relativePath: "briefs/example.yaml",
  content: "kind: article-brief\ntitle: Revised\n",
});
assert(updatePreview.previousSha256);

await expectGuardError("OVERWRITE_CONFIRMATION_REQUIRED", () =>
  guardedProjectWrite(root, {
    scope: "artifact",
    relativePath: "briefs/example.yaml",
    content: "kind: article-brief\ntitle: Revised\n",
    dryRun: false,
    confirmWrite: true,
    expectedSha256: updatePreview.previousSha256 ?? undefined,
  }),
);

await expectGuardError("STALE_OR_MISSING_HASH", () =>
  guardedProjectWrite(root, {
    scope: "artifact",
    relativePath: "briefs/example.yaml",
    content: "kind: article-brief\ntitle: Revised\n",
    dryRun: false,
    confirmWrite: true,
    confirmOverwrite: true,
    expectedSha256: "0".repeat(64),
  }),
);

const updated = await guardedProjectWrite(root, {
  scope: "artifact",
  relativePath: "briefs/example.yaml",
  content: "kind: article-brief\ntitle: Revised\n",
  dryRun: false,
  confirmWrite: true,
  confirmOverwrite: true,
  expectedSha256: updatePreview.previousSha256 ?? undefined,
});
assert.equal(updated.operation, "update");
assert.equal(updated.written, true);

const repeatedConfirmedWrite = await guardedProjectWrite(root, {
  scope: "artifact",
  relativePath: "briefs/example.yaml",
  content: "kind: article-brief\ntitle: Revised\n",
  dryRun: false,
  confirmWrite: true,
  confirmOverwrite: true,
  expectedSha256: updated.nextSha256,
});
assert.equal(repeatedConfirmedWrite.operation, "unchanged");
assert.equal(repeatedConfirmedWrite.written, false);

const statePreview = await guardedProjectWrite(root, {
  scope: "content",
  relativePath: "posts/guarded-write.mdx",
  content: "---\ntitle: Guarded write\ndraft: true\n---\n\nDraft.\n",
});
assert.equal(statePreview.stateChangeDetected, true);

await expectGuardError("STATE_CHANGE_CONFIRMATION_REQUIRED", () =>
  guardedProjectWrite(root, {
    scope: "content",
    relativePath: "posts/guarded-write.mdx",
    content: "---\ntitle: Guarded write\ndraft: true\n---\n\nDraft.\n",
    dryRun: false,
    confirmWrite: true,
  }),
);

await guardedProjectWrite(root, {
  scope: "content",
  relativePath: "posts/guarded-write.mdx",
  content: "---\ntitle: Guarded write\ndraft: true\n---\n\nDraft.\n",
  dryRun: false,
  confirmWrite: true,
  confirmStateChange: true,
});

await expectGuardError("UNSAFE_PATH", () =>
  guardedProjectWrite(root, {
    scope: "artifact",
    relativePath: "../../outside.md",
    content: "outside\n",
  }),
);
await expectGuardError("UNSAFE_PATH", () =>
  guardedProjectWrite(root, {
    scope: "artifact",
    relativePath: "dist/generated.md",
    content: "generated\n",
  }),
);
await expectGuardError("SENSITIVE_PATH", () =>
  guardedProjectWrite(root, {
    scope: "plan",
    relativePath: "deployment-token.yaml",
    content: "example: redacted\n",
  }),
);
await expectGuardError("SECRET_DETECTED", () =>
  guardedProjectWrite(root, {
    scope: "plan",
    relativePath: "deployment.yaml",
    content: `api_token: ${"a".repeat(32)}\n`,
  }),
);

await mkdir(path.join(root, "outside"), { recursive: true });
await mkdir(path.join(root, "content-work"), { recursive: true });
await symlink(path.join(root, "outside"), path.join(root, "content-work/linked"));
await expectGuardError("SYMLINK_PATH", () =>
  guardedProjectWrite(root, {
    scope: "artifact",
    relativePath: "linked/escaped.md",
    content: "escaped\n",
  }),
);

console.log("MCP guarded write unit tests passed.");

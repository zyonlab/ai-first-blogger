import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

export const writeScopes = {
  artifact: {
    root: "content-work",
    extensions: new Set([".json", ".md", ".yaml", ".yml"]),
  },
  content: {
    root: "src/content",
    extensions: new Set([".md", ".mdx"]),
  },
  plan: {
    root: "content-plans",
    extensions: new Set([".json", ".md", ".yaml", ".yml"]),
  },
} as const;

export type WriteScope = keyof typeof writeScopes;

export interface GuardedWriteInput {
  scope: WriteScope;
  relativePath: string;
  content: string;
  dryRun?: boolean;
  confirmWrite?: boolean;
  confirmOverwrite?: boolean;
  confirmStateChange?: boolean;
  expectedSha256?: string;
}

export interface GuardedWriteResult {
  ok: true;
  operation: "create" | "update" | "unchanged";
  dryRun: boolean;
  path: string;
  previousSha256: string | null;
  nextSha256: string;
  stateChangeDetected: boolean;
  diff: string;
  written: boolean;
}

const maximumBytes = 512 * 1024;
const maximumLines = 10_000;
const generatedSegments = new Set([
  ".astro",
  ".git",
  ".wrangler",
  "coverage",
  "dist",
  "node_modules",
]);
const sensitiveNamePattern =
  /(^|[._-])(credential|credentials|private[-_]?key|secret|secrets|token)([._-]|$)|\.(key|p12|pem)$/i;
const sensitiveContentPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:api[_-]?key|api[_-]?token|access[_-]?token|client[_-]?secret|private[_-]?key)\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{20,}/i,
  /\b(?:ghp|github_pat|sk|cfat)_[A-Za-z0-9_-]{20,}\b/,
];
const stateLinePattern =
  /^\s*(?:-\s*)?["']?(?:draft|lifecycle|published|publish(?:ed)?At|publicationDecision|scheduledAt|state|status)["']?\s*[:=]/im;

export class GuardedWriteError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "GuardedWriteError";
  }
}

function sha256(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

function normalizeNewlines(content: string) {
  return content.replace(/\r\n?/g, "\n");
}

function assertContentIsSafe(content: string) {
  const bytes = Buffer.byteLength(content, "utf8");
  if (bytes > maximumBytes) {
    throw new GuardedWriteError(
      "CONTENT_TOO_LARGE",
      `Write content exceeds the ${maximumBytes}-byte limit.`,
    );
  }

  const lines = content.split("\n").length;
  if (lines > maximumLines) {
    throw new GuardedWriteError(
      "CONTENT_TOO_LARGE",
      `Write content exceeds the ${maximumLines}-line limit.`,
    );
  }

  if (content.includes("\0")) {
    throw new GuardedWriteError("BINARY_CONTENT", "Binary content is not allowed.");
  }

  if (sensitiveContentPatterns.some((pattern) => pattern.test(content))) {
    throw new GuardedWriteError(
      "SECRET_DETECTED",
      "Content resembles a credential or private key and cannot be written through MCP.",
    );
  }
}

function resolveScopedPath(
  projectRoot: string,
  scope: WriteScope,
  requestedPath: string,
) {
  const scopeConfig = writeScopes[scope];
  const normalizedRequest = requestedPath.replaceAll("\\", "/").replace(/^\.\//, "");

  if (
    !normalizedRequest ||
    path.posix.isAbsolute(normalizedRequest) ||
    /^[A-Za-z]:\//.test(normalizedRequest)
  ) {
    throw new GuardedWriteError(
      "INVALID_PATH",
      "Path must be a non-empty project-relative path.",
    );
  }

  const normalized = path.posix.normalize(normalizedRequest);
  const segments = normalized.split("/");
  if (
    normalized === ".." ||
    normalized.startsWith("../") ||
    segments.includes("..") ||
    segments.some((segment) => generatedSegments.has(segment))
  ) {
    throw new GuardedWriteError(
      "UNSAFE_PATH",
      "Path traversal and generated directories are not allowed.",
    );
  }

  const scopedPrefix = `${scopeConfig.root}/`;
  const scopedPath = normalized.startsWith(scopedPrefix)
    ? normalized
    : `${scopedPrefix}${normalized}`;
  const extension = path.posix.extname(scopedPath).toLowerCase();

  if (!scopeConfig.extensions.has(extension)) {
    throw new GuardedWriteError(
      "UNSUPPORTED_EXTENSION",
      `Allowed extensions for ${scope} writes: ${[...scopeConfig.extensions].join(", ")}.`,
    );
  }

  if (
    path.posix.basename(scopedPath).startsWith(".") ||
    sensitiveNamePattern.test(scopedPath)
  ) {
    throw new GuardedWriteError(
      "SENSITIVE_PATH",
      "Hidden files and credential-like filenames are not writable through MCP.",
    );
  }

  const absolutePath = path.resolve(projectRoot, ...scopedPath.split("/"));
  const absoluteScope = path.resolve(projectRoot, scopeConfig.root);
  if (!absolutePath.startsWith(`${absoluteScope}${path.sep}`)) {
    throw new GuardedWriteError("UNSAFE_PATH", "Resolved path escapes its safe scope.");
  }

  return { absolutePath, scopedPath };
}

async function assertNoSymlinkBoundary(
  projectRoot: string,
  absolutePath: string,
) {
  const resolvedRoot = await realpath(projectRoot);
  const relative = path.relative(projectRoot, absolutePath);
  let cursor = projectRoot;

  for (const segment of relative.split(path.sep).slice(0, -1)) {
    cursor = path.join(cursor, segment);
    try {
      const entry = await lstat(cursor);
      if (entry.isSymbolicLink()) {
        throw new GuardedWriteError(
          "SYMLINK_PATH",
          "Writes through symbolic-link directories are not allowed.",
        );
      }
    } catch (error) {
      if (error instanceof GuardedWriteError) throw error;
      if ((error as NodeJS.ErrnoException).code === "ENOENT") break;
      throw error;
    }
  }

  try {
    const entry = await lstat(absolutePath);
    if (entry.isSymbolicLink()) {
      throw new GuardedWriteError(
        "SYMLINK_PATH",
        "Writes to symbolic links are not allowed.",
      );
    }
    const resolvedTarget = await realpath(absolutePath);
    if (!resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
      throw new GuardedWriteError("UNSAFE_PATH", "Resolved file escapes the project root.");
    }
  } catch (error) {
    if (error instanceof GuardedWriteError) throw error;
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function readExisting(absolutePath: string) {
  try {
    return await readFile(absolutePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function detectsStateChange(previous: string | null, next: string) {
  const controlledLines = (content: string | null) =>
    content
      ?.split("\n")
      .filter((line) => stateLinePattern.test(line))
      .map((line) => line.trim())
      .sort() ?? [];
  return JSON.stringify(controlledLines(previous)) !== JSON.stringify(controlledLines(next));
}

function createUnifiedDiff(
  relativePath: string,
  previous: string | null,
  next: string,
) {
  if (previous === next) return "";
  const previousLines = previous === null ? [] : previous.replace(/\n$/, "").split("\n");
  const nextLines = next.replace(/\n$/, "").split("\n");
  const oldName = previous === null ? "/dev/null" : `a/${relativePath}`;
  const oldStart = previousLines.length === 0 ? 0 : 1;
  const newStart = nextLines.length === 0 ? 0 : 1;

  return [
    `--- ${oldName}`,
    `+++ b/${relativePath}`,
    `@@ -${oldStart},${previousLines.length} +${newStart},${nextLines.length} @@`,
    ...previousLines.map((line) => `-${line}`),
    ...nextLines.map((line) => `+${line}`),
  ].join("\n");
}

async function atomicWrite(absolutePath: string, content: string) {
  await mkdir(path.dirname(absolutePath), { recursive: true });
  const temporaryPath = `${absolutePath}.mcp-${process.pid}-${Date.now()}.tmp`;
  try {
    await writeFile(temporaryPath, content, { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, absolutePath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

export async function guardedProjectWrite(
  projectRoot: string,
  input: GuardedWriteInput,
): Promise<GuardedWriteResult> {
  const dryRun = input.dryRun ?? true;
  const content = normalizeNewlines(input.content);
  assertContentIsSafe(content);

  const { absolutePath, scopedPath } = resolveScopedPath(
    projectRoot,
    input.scope,
    input.relativePath,
  );
  await assertNoSymlinkBoundary(projectRoot, absolutePath);

  const previous = await readExisting(absolutePath);
  if (previous !== null) assertContentIsSafe(previous);
  const previousSha256 = previous === null ? null : sha256(previous);
  const nextSha256 = sha256(content);
  const stateChangeDetected = detectsStateChange(previous, content);

  if (previous === content) {
    return {
      ok: true,
      operation: "unchanged",
      dryRun,
      path: scopedPath,
      previousSha256,
      nextSha256,
      stateChangeDetected: false,
      diff: "",
      written: false,
    };
  }

  const operation = previous === null ? "create" : "update";
  const diff = createUnifiedDiff(scopedPath, previous, content);

  if (!dryRun) {
    if (!input.confirmWrite) {
      throw new GuardedWriteError(
        "WRITE_CONFIRMATION_REQUIRED",
        "Set confirmWrite=true together with dryRun=false after reviewing the returned diff.",
      );
    }

    if (previous !== null) {
      if (!input.confirmOverwrite) {
        throw new GuardedWriteError(
          "OVERWRITE_CONFIRMATION_REQUIRED",
          "Existing files require confirmOverwrite=true.",
        );
      }
      if (!input.expectedSha256 || input.expectedSha256 !== previousSha256) {
        throw new GuardedWriteError(
          "STALE_OR_MISSING_HASH",
          "Existing files require the current previousSha256 from a fresh dry-run.",
        );
      }
    }

    if (stateChangeDetected && !input.confirmStateChange) {
      throw new GuardedWriteError(
        "STATE_CHANGE_CONFIRMATION_REQUIRED",
        "Publication or workflow state changes require confirmStateChange=true.",
      );
    }

    const latest = await readExisting(absolutePath);
    const latestSha256 = latest === null ? null : sha256(latest);
    if (latestSha256 !== previousSha256) {
      throw new GuardedWriteError(
        "CONCURRENT_MODIFICATION",
        "The target changed after preview validation; run a new dry-run before writing.",
      );
    }

    await atomicWrite(absolutePath, content);
  }

  return {
    ok: true,
    operation,
    dryRun,
    path: scopedPath,
    previousSha256,
    nextSha256,
    stateChangeDetected,
    diff,
    written: !dryRun,
  };
}

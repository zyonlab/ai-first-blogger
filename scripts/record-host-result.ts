import { promises as fs } from 'node:fs';
import path from 'node:path';
import { articleBriefSchema } from '../src/content-workflow/schemas';

const root = process.cwd();
const allArguments = process.argv.slice(2).filter((argument) => argument !== '--');
const [host, rawFile] = allArguments;
const argumentsList = allArguments.slice(2);

function option(name: string) {
  const index = argumentsList.indexOf(name);
  return index >= 0 ? argumentsList[index + 1] : undefined;
}

if (!host || !rawFile) {
  console.error('Usage: tsx scripts/record-host-result.ts <host> <raw-output-file> [--failure-stage <stage> --message <message>]');
  process.exit(1);
}

function parseJsonText(value: string): unknown {
  const trimmed = value.trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error('No JSON object found in host output');
  }
}

function findArtifact(value: unknown): unknown {
  if (typeof value === 'string') return findArtifact(parseJsonText(value));
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  if (record.kind === 'article-brief') return record;
  if (record.artifact) return findArtifact(record.artifact);
  if (record.result) return findArtifact(record.result);
  if (record.response) return findArtifact(record.response);
  if (Array.isArray(record.payloads)) {
    for (const payload of record.payloads) {
      try {
        const artifact = findArtifact(payload);
        if (artifact && typeof artifact === 'object' && (artifact as Record<string, unknown>).kind === 'article-brief') return artifact;
      } catch {
        continue;
      }
    }
  }
  if (record.text) return findArtifact(record.text);
  if (record.content) return findArtifact(record.content);
  return record;
}

const output = path.join(root, 'prompts', 'regression', 'host-results', `${host}.json`);
const failureStage = option('--failure-stage');
let result: Record<string, unknown>;

if (failureStage) {
  const message = option('--message');
  if (!message) {
    console.error('--message is required with --failure-stage');
    process.exit(1);
  }
  result = {
    host,
    status: 'failed',
    capturedAt: new Date().toISOString(),
    prompt: 'prompts/regression/cross-host-brief-prompt.md',
    failure: { stage: failureStage, message },
  };
} else {
  const raw = await fs.readFile(path.resolve(rawFile), 'utf8');
  const artifact = articleBriefSchema.parse(findArtifact(parseJsonText(raw)));
  result = {
    host,
    status: 'passed',
    capturedAt: new Date().toISOString(),
    prompt: 'prompts/regression/cross-host-brief-prompt.md',
    artifact,
  };
}

await fs.writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(`Recorded ${result.status} ${host} result at ${path.relative(root, output)}`);

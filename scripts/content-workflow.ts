import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import {
  artifactDirectories,
  artifactPath,
  createArtifact,
  readArtifact,
  validateContentWorkflow,
  validateWorkflowState,
  writeArtifact,
  type ArtifactKind,
} from '../src/content-workflow/workflow';
import { artifactSchema, contentWorkflowSchema, lifecycleStates } from '../src/content-workflow/schemas';

const root = process.env.AI_FIRST_BLOGGER_ROOT ?? process.cwd();
const [command, ...argumentsList] = process.argv.slice(2).filter((argument) => argument !== '--');

function option(name: string) {
  const index = argumentsList.indexOf(name);
  return index >= 0 ? argumentsList[index + 1] : undefined;
}

function positional() {
  const values: string[] = [];
  for (let index = 0; index < argumentsList.length; index += 1) {
    if (argumentsList[index].startsWith('--')) {
      index += 1;
      continue;
    }
    values.push(argumentsList[index]);
  }
  return values;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function runNew() {
  const [kindValue, id] = positional();
  const kind = kindValue as ArtifactKind;
  if (!kind || !(kind in artifactDirectories) || !id) {
    fail('Usage: content:new <kind> <id> --title <title> --owner <owner> [--dry-run true]');
  }
  const title = option('--title');
  const owner = option('--owner');
  if (!title || !owner) fail('--title and --owner are required');
  const artifact = createArtifact(kind, id, title, owner);
  const file = artifactPath(root, kind, id);
  try {
    await fs.access(file);
    fail(`Refusing to overwrite existing artifact: ${path.relative(root, file)}`);
  } catch (error) {
    if (error instanceof Error && !('code' in error && error.code === 'ENOENT')) throw error;
  }
  if (option('--dry-run') === 'true') {
    console.log(JSON.stringify({ file: path.relative(root, file), artifact }, null, 2));
    return;
  }
  await writeArtifact(file, artifact);
  console.log(`Created ${path.relative(root, file)}`);
}

async function runValidate() {
  const [file] = positional();
  if (file) {
    const artifact = artifactSchema.parse(parse(await fs.readFile(path.resolve(root, file), 'utf8')));
    console.log(`Valid ${artifact.kind}: ${artifact.id}`);
    return;
  }
  const result = await validateContentWorkflow(root);
  if (result.issues.length > 0) {
    for (const issue of result.issues) console.error(`${issue.file}:${issue.path || '-'} - ${issue.message}`);
    process.exit(1);
  }
  console.log(`Content workflow valid: ${result.artifacts.size} artifacts checked.`);
}

async function runAudit() {
  const result = await validateContentWorkflow(root);
  const byKind = Object.fromEntries(Object.keys(artifactDirectories).map((kind) => [
    kind,
    [...result.artifacts.values()].filter((artifact) => artifact.kind === kind).length,
  ]));
  const byState = Object.fromEntries(lifecycleStates.map((state) => [
    state,
    [...result.artifacts.values()].filter((artifact) => artifact.kind === 'content-workflow' && artifact.state === state).length,
  ]));
  console.log(JSON.stringify({ contractVersion: result.pipeline.pipeline.contract_version, valid: result.issues.length === 0, issueCount: result.issues.length, byKind, byState, issues: result.issues }, null, 2));
  if (result.issues.length > 0) process.exit(1);
}

async function runTransition() {
  const [id, targetState] = positional();
  const actor = option('--actor');
  if (!id || !targetState || !actor) fail('Usage: content:transition <workflow-id> <state> --actor <actor> [--dry-run true]');
  if (!lifecycleStates.includes(targetState as typeof lifecycleStates[number])) fail(`Unknown lifecycle state: ${targetState}`);

  const file = artifactPath(root, 'content-workflow', id);
  const workflow = contentWorkflowSchema.parse(await readArtifact(file));
  const result = await validateContentWorkflow(root);
  const transitions = result.pipeline.lifecycle.transitions as Record<string, string[]>;
  if (!transitions[workflow.state]?.includes(targetState)) fail(`Transition ${workflow.state} -> ${targetState} is not allowed`);

  const now = new Date().toISOString();
  const candidate = contentWorkflowSchema.parse({
    ...workflow,
    state: targetState,
    updatedAt: now,
    history: [...workflow.history, { from: workflow.state, to: targetState, at: now, actor }],
  });
  const artifacts = new Map(result.artifacts);
  artifacts.set(candidate.id, candidate);
  const issues = await validateWorkflowState(root, candidate, artifacts);
  if (issues.length > 0) fail(issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n'));

  if (option('--dry-run') === 'true') {
    console.log(JSON.stringify(candidate, null, 2));
    return;
  }
  await writeArtifact(file, candidate);
  console.log(`Transitioned ${id}: ${workflow.state} -> ${targetState}`);
}

if (command === 'new') await runNew();
else if (command === 'validate') await runValidate();
else if (command === 'audit') await runAudit();
else if (command === 'transition') await runTransition();
else fail('Commands: new, validate, audit, transition');

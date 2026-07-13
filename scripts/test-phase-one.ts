import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  articleBriefSchema,
  factLedgerSchema,
  topicResearchSchema,
  type Artifact,
} from '../src/content-workflow/schemas';
import {
  createArtifact,
  validateContentWorkflow,
  validateWorkflowState,
} from '../src/content-workflow/workflow';

const root = process.cwd();
const now = new Date().toISOString();

const draftResearch = createArtifact('topic-research', 'schema-smoke', 'Schema Smoke', 'Codex');
assert.equal(draftResearch.kind, 'topic-research');

const invalidApprovedResearch = topicResearchSchema.safeParse({
  ...draftResearch,
  status: 'approved',
});
assert.equal(invalidApprovedResearch.success, false);

const approvedResearch = topicResearchSchema.parse({
  ...draftResearch,
  status: 'approved',
  targetReader: 'Full-stack developers',
  contentPillar: 'ai-applications',
  readerProblem: 'Needs a reproducible content workflow',
  searchIntents: ['AI content workflow'],
  sources: [{ title: 'Primary documentation', url: 'https://example.org/source', sourceType: 'primary', accessedAt: now }],
  contentGap: 'Existing guides do not enforce lifecycle state',
  angle: 'Use executable artifacts and publication gates',
});

const brief = createArtifact('article-brief', 'schema-smoke-brief', 'Schema Smoke Brief', 'Codex');
const invalidApprovedBrief = articleBriefSchema.safeParse({ ...brief, status: 'approved' });
assert.equal(invalidApprovedBrief.success, false);

const ledger = createArtifact('fact-ledger', 'schema-smoke-facts', 'Schema Smoke Facts', 'Codex');
const invalidLedger = factLedgerSchema.safeParse({
  ...ledger,
  status: 'approved',
  claims: [{ id: 'changing-claim', claim: 'A changing fact', claimType: 'time-sensitive' }],
});
assert.equal(invalidLedger.success, false);

const workflow = createArtifact('content-workflow', 'schema-smoke-workflow', 'Schema Smoke Workflow', 'Codex');
assert.equal(workflow.kind, 'content-workflow');
if (workflow.kind !== 'content-workflow') throw new Error('Expected content workflow');

const blockedWorkflow = { ...workflow, state: 'researched' as const };
const blockedIssues = await validateWorkflowState(root, blockedWorkflow, new Map<string, Artifact>());
assert.ok(blockedIssues.some((issue) => issue.path === 'topicResearchId'));

const allowedWorkflow = { ...blockedWorkflow, topicResearchId: approvedResearch.id };
const allowedIssues = await validateWorkflowState(root, allowedWorkflow, new Map([[approvedResearch.id, approvedResearch]]));
assert.equal(allowedIssues.length, 0);

const projectValidation = await validateContentWorkflow(root);
assert.deepEqual(projectValidation.issues, []);

const dryRun = spawnSync('pnpm', [
  'content:new', '--', 'topic-research', 'phase-one-test',
  '--title', 'Phase One Test', '--owner', 'Codex', '--dry-run', 'true',
], { cwd: root, encoding: 'utf8' });
assert.equal(dryRun.status, 0, dryRun.stderr);
assert.match(dryRun.stdout, /content-work\/research\/phase-one-test\.yaml/);

console.log('Phase 1 schema, lifecycle, contract, and CLI tests passed.');

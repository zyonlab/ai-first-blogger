import { promises as fs } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { parse, stringify } from 'yaml';
import {
  artifactSchema,
  artifactSchemaVersion,
  authorStyleSchema,
  claimImpacts,
  claimTypes,
  contentTypes,
  lifecycleStates,
  machineCheckStatuses,
  publicationDecisions,
  reviewTypes,
  scorecardDimensions,
  sourceTypes,
  verificationStatuses,
  type Artifact,
  type ContentWorkflow,
} from './schemas';

export const artifactDirectories = {
  'topic-research': 'research',
  'series-plan': 'series',
  'article-brief': 'briefs',
  'fact-ledger': 'facts',
  'review-report': 'reviews',
  'editorial-scorecard': 'scorecards',
  'content-workflow': 'workflows',
} as const;

export type ArtifactKind = keyof typeof artifactDirectories;
export type ValidationIssue = { file: string; path: string; message: string };

async function walk(directory: string, pattern: RegExp): Promise<string[]> {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const files: string[][] = await Promise.all(entries.map(async (entry): Promise<string[]> => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return walk(target, pattern);
      return entry.isFile() && pattern.test(entry.name) ? [target] : [];
    }));
    return files.flat().sort();
  } catch {
    return [];
  }
}

export function artifactPath(root: string, kind: ArtifactKind, id: string) {
  return path.join(root, 'content-work', artifactDirectories[kind], `${id}.yaml`);
}

export async function readArtifact(file: string) {
  const raw = parse(await fs.readFile(file, 'utf8'));
  return artifactSchema.parse(raw);
}

export async function writeArtifact(file: string, artifact: Artifact) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, stringify(artifact, { lineWidth: 100 }));
}

function zodIssues(file: string, error: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
  return error.issues.map((issue) => ({
    file,
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

async function loadArtifacts(root: string) {
  const files = await walk(path.join(root, 'content-work'), /\.ya?ml$/);
  const artifacts = new Map<string, Artifact>();
  const issues: ValidationIssue[] = [];

  for (const file of files) {
    try {
      const artifact = await readArtifact(file);
      if (artifacts.has(artifact.id)) {
        issues.push({ file: path.relative(root, file), path: 'id', message: `Duplicate artifact id: ${artifact.id}` });
      } else {
        artifacts.set(artifact.id, artifact);
      }
    } catch (error) {
      if (error && typeof error === 'object' && 'issues' in error) {
        issues.push(...zodIssues(path.relative(root, file), error as { issues: Array<{ path: PropertyKey[]; message: string }> }));
      } else {
        issues.push({ file: path.relative(root, file), path: '', message: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  return { artifacts, issues };
}

function approved<T extends Artifact['kind']>(artifacts: Map<string, Artifact>, id: string | undefined, kind: T) {
  const artifact = id ? artifacts.get(id) : undefined;
  return artifact?.kind === kind && 'status' in artifact && artifact.status === 'approved';
}

function passingReviewTypes(artifacts: Map<string, Artifact>, ids: string[]) {
  return new Set(ids.flatMap((id) => {
    const artifact = artifacts.get(id);
    return artifact?.kind === 'review-report' && artifact.decision === 'pass' ? [artifact.reviewType] : [];
  }));
}

export async function validateWorkflowState(
  root: string,
  workflow: ContentWorkflow,
  artifacts: Map<string, Artifact>,
) {
  const issues: ValidationIssue[] = [];
  const stateIndex = lifecycleStates.indexOf(workflow.state);
  const atLeast = (state: typeof lifecycleStates[number]) => stateIndex >= lifecycleStates.indexOf(state);
  const file = path.relative(root, artifactPath(root, 'content-workflow', workflow.id));

  if (atLeast('researched') && !approved(artifacts, workflow.topicResearchId, 'topic-research')) {
    issues.push({ file, path: 'topicResearchId', message: 'This state requires approved topic research' });
  }
  if (atLeast('brief-approved') && !approved(artifacts, workflow.articleBriefId, 'article-brief')) {
    issues.push({ file, path: 'articleBriefId', message: 'This state requires an approved article brief' });
  }
  if (atLeast('drafted')) {
    if (!workflow.contentPath) {
      issues.push({ file, path: 'contentPath', message: 'This state requires contentPath' });
    } else {
      try {
        await fs.access(path.join(root, workflow.contentPath));
      } catch {
        issues.push({ file, path: 'contentPath', message: `Content file does not exist: ${workflow.contentPath}` });
      }
    }
  }

  const passingReviews = passingReviewTypes(artifacts, workflow.reviewIds);
  if (atLeast('reviewed')) {
    for (const reviewType of ['teaching', 'voice'] as const) {
      if (!passingReviews.has(reviewType)) issues.push({ file, path: 'reviewIds', message: `This state requires a passing ${reviewType} review` });
    }
  }
  if (atLeast('published')) {
    if (!approved(artifacts, workflow.factLedgerId, 'fact-ledger')) {
      issues.push({ file, path: 'factLedgerId', message: 'Publishing requires an approved fact ledger' });
    }
    for (const reviewType of reviewTypes) {
      if (!passingReviews.has(reviewType)) issues.push({ file, path: 'reviewIds', message: `Publishing requires a passing ${reviewType} review` });
    }
    const scorecard = workflow.editorialScorecardId ? artifacts.get(workflow.editorialScorecardId) : undefined;
    if (scorecard?.kind !== 'editorial-scorecard' || scorecard.status !== 'approved' || scorecard.publicationDecision !== 'approved') {
      issues.push({ file, path: 'editorialScorecardId', message: 'Publishing requires an approved editorial scorecard with publication approval' });
    }
  }

  return issues;
}

async function validateContracts(root: string) {
  const issues: ValidationIssue[] = [];
  const pipelineFile = path.join(root, 'content-plans/content-pipeline.yaml');
  const contentTypesFile = path.join(root, 'content-plans/content-types.yaml');
  const authorStyleFile = path.join(root, 'content-plans/author-style.yaml');
  const sourcePolicyFile = path.join(root, 'content-plans/source-policy.yaml');
  const scorecardPolicyFile = path.join(root, 'content-plans/editorial-scorecard.yaml');
  const pipeline = parse(await fs.readFile(pipelineFile, 'utf8'));
  const typeContract = parse(await fs.readFile(contentTypesFile, 'utf8'));
  const authorStyle = parse(await fs.readFile(authorStyleFile, 'utf8'));
  const sourcePolicy = parse(await fs.readFile(sourcePolicyFile, 'utf8'));
  const scorecardPolicy = parse(await fs.readFile(scorecardPolicyFile, 'utf8'));

  if (pipeline?.pipeline?.contract_version !== artifactSchemaVersion) {
    issues.push({ file: 'content-plans/content-pipeline.yaml', path: 'pipeline.contract_version', message: `Expected ${artifactSchemaVersion}` });
  }
  if (pipeline?.artifact_contracts?.schema_version !== artifactSchemaVersion) {
    issues.push({ file: 'content-plans/content-pipeline.yaml', path: 'artifact_contracts.schema_version', message: `Expected ${artifactSchemaVersion}` });
  }
  if (JSON.stringify(pipeline?.lifecycle?.states) !== JSON.stringify(lifecycleStates)) {
    issues.push({ file: 'content-plans/content-pipeline.yaml', path: 'lifecycle.states', message: 'Lifecycle states do not match the executable schema' });
  }
  const configuredTypes = Object.keys(typeContract?.content_types ?? {});
  if (JSON.stringify(configuredTypes) !== JSON.stringify(contentTypes)) {
    issues.push({ file: 'content-plans/content-types.yaml', path: 'content_types', message: 'Content types do not match the executable schema' });
  }
  const parsedStyle = authorStyleSchema.safeParse(authorStyle);
  if (!parsedStyle.success) {
    issues.push(...zodIssues('content-plans/author-style.yaml', parsedStyle.error));
  } else if (parsedStyle.data.enabled) {
    for (const example of parsedStyle.data.approvedExamples) {
      try {
        await fs.access(path.join(root, example.path));
      } catch {
        issues.push({ file: 'content-plans/author-style.yaml', path: 'approvedExamples', message: `Approved example does not exist: ${example.path}` });
      }
    }
  }
  for (const [field, expected] of [
    ['claimTypes', claimTypes],
    ['claimImpacts', claimImpacts],
    ['sourceTypes', sourceTypes],
    ['verificationStatuses', verificationStatuses],
  ] as const) {
    if (JSON.stringify(sourcePolicy?.[field]) !== JSON.stringify(expected)) {
      issues.push({ file: 'content-plans/source-policy.yaml', path: field, message: `${field} does not match the executable schema` });
    }
  }
  for (const [field, expected] of [
    ['dimensions', scorecardDimensions],
    ['machineCheckStatuses', machineCheckStatuses],
    ['publicationDecisions', publicationDecisions],
  ] as const) {
    if (JSON.stringify(scorecardPolicy?.[field]) !== JSON.stringify(expected)) {
      issues.push({ file: 'content-plans/editorial-scorecard.yaml', path: field, message: `${field} does not match the executable schema` });
    }
  }

  const stageIds = (pipeline?.stages ?? [])
    .map((stage: { id: string }) => stage.id)
    .filter((stageId: string) => stageId.includes('_'));
  for (const adapter of pipeline?.adapters?.files ?? []) {
    const adapterPath = path.join(root, adapter);
    let source = '';
    try {
      source = await fs.readFile(adapterPath, 'utf8');
    } catch {
      issues.push({ file: adapter, path: '', message: 'Configured workflow adapter does not exist' });
      continue;
    }
    if (!source.includes('content-plans/content-pipeline.yaml')) {
      issues.push({ file: adapter, path: '', message: 'Workflow adapter must reference the canonical pipeline contract' });
    }
    const duplicatedStages = stageIds.filter((stageId: string) => source.includes(stageId));
    if (duplicatedStages.length > 0) {
      issues.push({ file: adapter, path: '', message: `Workflow adapter duplicates canonical stage IDs: ${duplicatedStages.join(', ')}` });
    }
  }

  return { issues, pipeline };
}

async function validatePublishedContent(root: string, artifacts: Map<string, Artifact>) {
  const issues: ValidationIssue[] = [];
  const collections = ['posts', 'videos', 'case-studies'];

  for (const collection of collections) {
    const directory = path.join(root, 'src', 'content', collection);
    const files = await walk(directory, /\.mdx?$/);
    for (const file of files) {
      const parsed = matter(await fs.readFile(file, 'utf8'));
      const isFuture = parsed.data.pubDate && new Date(parsed.data.pubDate).valueOf() > Date.now();
      if (parsed.data.draft === true || isFuture) continue;
      const relativeFile = path.relative(root, file);
      const workflow = parsed.data.workflowId ? artifacts.get(parsed.data.workflowId) : undefined;
      if (!workflow || workflow.kind !== 'content-workflow') {
        issues.push({ file: relativeFile, path: 'workflowId', message: 'Published content requires a valid content-workflow' });
        continue;
      }
      if (workflow.state !== 'published') {
        issues.push({ file: relativeFile, path: 'workflowId', message: `Workflow ${workflow.id} is ${workflow.state}, not published` });
      }
      if (workflow.contentPath !== relativeFile) {
        issues.push({ file: relativeFile, path: 'workflowId', message: `Workflow contentPath must equal ${relativeFile}` });
      }
    }
  }

  return issues;
}

export async function validateContentWorkflow(root: string) {
  const { artifacts, issues } = await loadArtifacts(root);
  const contract = await validateContracts(root);
  issues.push(...contract.issues);

  for (const artifact of artifacts.values()) {
    if (artifact.kind === 'content-workflow') {
      issues.push(...await validateWorkflowState(root, artifact, artifacts));
    }
  }
  issues.push(...await validatePublishedContent(root, artifacts));

  return { artifacts, issues, pipeline: contract.pipeline };
}

export function createArtifact(kind: ArtifactKind, id: string, title: string, owner: string): Artifact {
  const now = new Date().toISOString();
  const base = { schemaVersion: artifactSchemaVersion, id, title, owner, createdAt: now, updatedAt: now };

  const templates: Record<ArtifactKind, Artifact> = {
    'topic-research': { ...base, kind: 'topic-research', status: 'draft', topic: title, targetReader: '', businessGoal: '', contentPillar: '', readerProblem: '', searchIntents: [], sources: [], competitorPatterns: [], contentGap: '', angle: '', unansweredQuestions: [] },
    'series-plan': { ...base, kind: 'series-plan', status: 'draft', domain: title, audienceLevel: '', readerOutcome: '', contentPillar: '', learningPath: [], articles: [], internalLinks: [], difficultyCurve: [] },
    'article-brief': { ...base, kind: 'article-brief', status: 'draft', topicResearchId: id, targetReader: '', searchIntent: '', conversionGoal: '', contentType: 'explanation', description: '', slug: id, category: '', tags: [], outline: [], definitions: [], examples: [], internalLinks: [], faq: [] },
    'fact-ledger': { ...base, kind: 'fact-ledger', status: 'draft', articleBriefId: id, claims: [] },
    'review-report': { ...base, kind: 'review-report', articleBriefId: id, reviewType: 'teaching', decision: 'changes-required', reviewer: owner, reviewedAt: now, findings: [] },
    'editorial-scorecard': { ...base, kind: 'editorial-scorecard', status: 'draft', articleBriefId: id, machineChecks: [], humanReviews: [], unresolvedRisks: [], publicationDecision: 'pending' },
    'content-workflow': { ...base, kind: 'content-workflow', state: 'idea', reviewIds: [], history: [{ to: 'idea', at: now, actor: owner }] },
  };

  return artifactSchema.parse(templates[kind]);
}

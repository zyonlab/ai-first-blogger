import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { articleBriefSchema, artifactSchemaVersion, contentTypes } from '../src/content-workflow/schemas';

const root = process.env.AI_FIRST_BLOGGER_ROOT ?? process.cwd();
const manifest = parse(await fs.readFile(path.join(root, 'prompts/manifest.yaml'), 'utf8'));
const pipeline = parse(await fs.readFile(path.join(root, 'content-plans/content-pipeline.yaml'), 'utf8'));
const fixtures = parse(await fs.readFile(path.join(root, manifest.regression.goldenBriefs), 'utf8'));
const errors: string[] = [];

if (manifest.pipelineContractVersion !== pipeline.pipeline.contract_version) {
  errors.push('Prompt manifest pipelineContractVersion does not match the canonical pipeline.');
}
if (manifest.version !== artifactSchemaVersion || fixtures.version !== artifactSchemaVersion) {
  errors.push(`Prompt and fixture versions must equal ${artifactSchemaVersion}.`);
}

for (const prompt of Object.values(manifest.prompts) as Array<{ path: string; version: string }>) {
  if (prompt.version !== manifest.version) errors.push(`${prompt.path} has a stale prompt version.`);
  try {
    await fs.access(path.join(root, prompt.path));
  } catch {
    errors.push(`Prompt file does not exist: ${prompt.path}`);
  }
}

const coveredTypes = new Set<string>();
for (const fixture of fixtures.cases) {
  coveredTypes.add(fixture.contentType);
  const timestamp = '2026-07-11T00:00:00.000Z';
  const result = articleBriefSchema.safeParse({
    schemaVersion: artifactSchemaVersion,
    id: fixture.id,
    title: fixture.title,
    owner: 'regression-fixture',
    createdAt: timestamp,
    updatedAt: timestamp,
    kind: 'article-brief',
    status: 'approved',
    topicResearchId: `${fixture.id}-research`,
    targetReader: 'Technical reader',
    searchIntent: fixture.searchIntent,
    conversionGoal: '',
    contentType: fixture.contentType,
    description: fixture.searchIntent,
    slug: fixture.id,
    category: 'notes',
    tags: ['regression'],
    outline: [{ level: 2, heading: fixture.h2, readerJob: fixture.searchIntent }],
    definitions: [],
    examples: [{ type: 'worked-example', purpose: fixture.example }],
    internalLinks: [],
    faq: [],
  });
  if (!result.success) errors.push(`${fixture.id} does not satisfy articleBriefSchema: ${result.error.message}`);
}

for (const contentType of contentTypes) {
  if (!coveredTypes.has(contentType)) errors.push(`Golden briefs do not cover content type: ${contentType}`);
}

const hostDirectory = path.join(root, manifest.regression.hostResults);
const hostFiles = (await fs.readdir(hostDirectory)).filter((file) => file.endsWith('.json'));
const verifiedHosts = new Set<string>();
const hostAttempts: Record<string, { status: string; stage?: string; message?: string }> = {};
for (const file of hostFiles) {
  const result = JSON.parse(await fs.readFile(path.join(hostDirectory, file), 'utf8'));
  if (!manifest.regression.requiredHosts.includes(result.host)) continue;
  if (result.status === 'failed') {
    hostAttempts[result.host] = {
      status: 'failed',
      stage: result.failure?.stage,
      message: result.failure?.message,
    };
    continue;
  }
  const parsed = articleBriefSchema.safeParse(result.artifact);
  if (!parsed.success) errors.push(`${file} contains an incompatible host artifact.`);
  else {
    verifiedHosts.add(result.host);
    hostAttempts[result.host] = { status: 'passed' };
  }
}

const pendingHosts = manifest.regression.requiredHosts.filter((host: string) => !verifiedHosts.has(host));
const report = {
  promptVersion: manifest.version,
  pipelineContractVersion: manifest.pipelineContractVersion,
  fixtureCount: fixtures.cases.length,
  coveredContentTypes: [...coveredTypes],
  verifiedHosts: [...verifiedHosts],
  pendingHosts,
  hostAttempts,
  localCompatibility: errors.length === 0,
  errors,
};

console.log(JSON.stringify(report, null, 2));
if (errors.length > 0) process.exit(1);

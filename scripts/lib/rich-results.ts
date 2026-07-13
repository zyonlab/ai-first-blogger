import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parse, stringify } from 'yaml';

export const richResultFeatures = ['Article', 'VideoObject', 'ProfilePage', 'BreadcrumbList'] as const;
export type RichResultFeature = typeof richResultFeatures[number];

type JsonObject = Record<string, unknown>;
type ValidationStatus = 'pass' | 'fail' | 'not-run' | 'not-applicable';

type ValidationBlock = {
  status: ValidationStatus;
  evidence?: string;
  evidenceUrl?: string;
  issues: string[];
};

export type RichResultRecord = {
  feature: RichResultFeature;
  pageTemplate: string;
  url: string;
  localValidation: ValidationBlock;
  richResultsTest: ValidationBlock & { mode: 'code' | 'url'; testedAt: string | null };
  urlInspection: ValidationBlock & { inspectedAt: string | null };
  eligibilityAssessment: 'not-assessed' | 'requires-google-validation' | 'eligible' | 'not-eligible' | 'not-applicable';
  notes: string[];
};

export type RichResultArtifact = {
  schemaVersion: number;
  release: {
    id: string;
    commit: string;
    environment: 'staging' | 'production';
    checkedAt: string | null;
    reviewer: string;
  };
  policy: {
    eligibilityOnly: boolean;
    rankingGuaranteed: boolean;
    statement: string;
  };
  records: RichResultRecord[];
  releaseDecision: {
    status: 'pending' | 'approved' | 'blocked';
    blockingIssues: string[];
    rationale: string;
  };
};

export type StructuredDataInspection = {
  records: RichResultRecord[];
  errors: string[];
  inspectedPages: number;
};

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function values(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value === undefined ? [] : [value];
}

function types(value: unknown): string[] {
  return values(value).filter((item): item is string => typeof item === 'string');
}

function absoluteHttpUrl(value: unknown) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function validDate(value: unknown) {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function nonEmpty(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0;
}

function flattenJsonLd(value: unknown): JsonObject[] {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (!isObject(value)) return [];
  const graph = Array.isArray(value['@graph']) ? value['@graph'].flatMap(flattenJsonLd) : [];
  return [value, ...graph];
}

export function extractJsonLd(html: string): JsonObject[] {
  const objects: JsonObject[] = [];
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      objects.push(...flattenJsonLd(JSON.parse(match[1])));
    } catch {
      objects.push({ '@type': '__INVALID_JSON_LD__' });
    }
  }
  return objects;
}

function articleIssues(schema: JsonObject): string[] {
  const issues: string[] = [];
  if (!nonEmpty(schema.headline)) issues.push('headline must be non-empty');
  if (!values(schema.image).some(absoluteHttpUrl)) issues.push('image must contain an absolute HTTP(S) URL');
  if (!validDate(schema.datePublished)) issues.push('datePublished must be a valid date');
  if (!validDate(schema.dateModified)) issues.push('dateModified must be a valid date');
  const authors = values(schema.author).filter(isObject);
  if (authors.length === 0 || authors.some((author) => !nonEmpty(author.name))) issues.push('every author must have a name');
  if (authors.length === 0 || authors.some((author) => !absoluteHttpUrl(author.url) && !absoluteHttpUrl(author.sameAs))) {
    issues.push('every author must have an identifying url or sameAs');
  }
  return issues;
}

function videoIssues(schema: JsonObject): string[] {
  const issues: string[] = [];
  if (!nonEmpty(schema.name)) issues.push('name is required');
  if (!values(schema.thumbnailUrl).some(absoluteHttpUrl)) issues.push('thumbnailUrl must contain an absolute HTTP(S) URL');
  if (!validDate(schema.uploadDate)) issues.push('uploadDate must be a valid date');
  if (!nonEmpty(schema.description)) issues.push('description should be non-empty');
  if (!absoluteHttpUrl(schema.contentUrl) && !absoluteHttpUrl(schema.embedUrl)) issues.push('contentUrl or embedUrl must be an absolute HTTP(S) URL');
  return issues;
}

function profileIssues(schema: JsonObject): string[] {
  const issues: string[] = [];
  if (!isObject(schema.mainEntity)) return ['mainEntity must be a Person or Organization'];
  if (!types(schema.mainEntity['@type']).some((type) => type === 'Person' || type === 'Organization')) {
    issues.push('mainEntity must be a Person or Organization');
  }
  if (!nonEmpty(schema.mainEntity.name) && !nonEmpty(schema.mainEntity.alternateName)) {
    issues.push('mainEntity must have name or alternateName');
  }
  return issues;
}

function breadcrumbIssues(schema: JsonObject): string[] {
  const items = values(schema.itemListElement).filter(isObject);
  const issues: string[] = [];
  if (items.length < 2) issues.push('itemListElement must contain at least two ListItems');
  items.forEach((item, index) => {
    if (!types(item['@type']).includes('ListItem')) issues.push(`item ${index + 1} must be a ListItem`);
    if (item.position !== index + 1) issues.push(`item ${index + 1} must have consecutive position ${index + 1}`);
    if (!nonEmpty(item.name)) issues.push(`item ${index + 1} must have a name`);
    if (index < items.length - 1 && !absoluteHttpUrl(item.item)) issues.push(`item ${index + 1} must have an absolute item URL`);
  });
  return issues;
}

export function validateStructuredData(feature: RichResultFeature, schema: JsonObject): string[] {
  if (types(schema['@type']).includes('__INVALID_JSON_LD__')) return ['JSON-LD is not valid JSON'];
  if (feature === 'Article') return articleIssues(schema);
  if (feature === 'VideoObject') return videoIssues(schema);
  if (feature === 'ProfilePage') return profileIssues(schema);
  return breadcrumbIssues(schema);
}

function matchesFeature(feature: RichResultFeature, schema: JsonObject) {
  const schemaTypes = types(schema['@type']);
  if (feature === 'Article') return schemaTypes.some((type) => ['Article', 'NewsArticle', 'BlogPosting'].includes(type));
  return schemaTypes.includes(feature);
}

async function walk(directory: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(entries.map((entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory() ? walk(target) : [target];
    }));
    return nested.flat();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

function pageUrl(distDirectory: string, file: string) {
  const relative = path.relative(distDirectory, file).split(path.sep).join('/');
  if (relative === 'index.html') return '/';
  return `/${relative.replace(/index\.html$/, '').replace(/\.html$/, '/')}`.replace(/\/+/g, '/');
}

function templateFor(feature: RichResultFeature) {
  if (feature === 'Article') return 'src/pages/writing/[slug].astro';
  if (feature === 'VideoObject') return 'src/pages/videos/[slug].astro';
  return 'src/pages/about.astro';
}

function localRecord(feature: RichResultFeature, url: string, issues: string[], applicable: boolean): RichResultRecord {
  const status = !applicable ? 'not-applicable' : issues.length === 0 ? 'pass' : 'fail';
  return {
    feature,
    pageTemplate: templateFor(feature),
    url,
    localValidation: { status, evidence: url, issues },
    richResultsTest: { status: applicable ? 'not-run' : 'not-applicable', mode: 'code', testedAt: null, evidenceUrl: '', issues: [] },
    urlInspection: { status: applicable ? 'not-run' : 'not-applicable', inspectedAt: null, evidenceUrl: '', issues: [] },
    eligibilityAssessment: !applicable ? 'not-applicable' : issues.length > 0 ? 'not-eligible' : 'requires-google-validation',
    notes: [],
  };
}

export async function inspectStructuredData(distDirectory: string): Promise<StructuredDataInspection> {
  const htmlFiles = (await walk(distDirectory)).filter((file) => file.endsWith('.html')).sort();
  const pages = await Promise.all(htmlFiles.map(async (file) => ({
    url: pageUrl(distDirectory, file),
    schemas: extractJsonLd(await fs.readFile(file, 'utf8')),
  })));
  const records: RichResultRecord[] = [];
  const errors: string[] = [];

  for (const page of pages) {
    if (page.schemas.some((schema) => types(schema['@type']).includes('__INVALID_JSON_LD__'))) {
      errors.push(`Invalid JSON-LD ${page.url}: script content is not valid JSON`);
    }
  }

  for (const feature of richResultFeatures) {
    const candidates = pages.flatMap((page) => page.schemas
      .filter((schema) => matchesFeature(feature, schema))
      .map((schema) => ({ ...page, schema })));
    if (candidates.length === 0) {
      records.push(localRecord(feature, '', [], false));
      continue;
    }
    const issues = candidates.flatMap((candidate) => validateStructuredData(feature, candidate.schema)
      .map((issue) => `${candidate.url}: ${issue}`));
    errors.push(...issues.map((issue) => `${feature} ${issue}`));
    const record = localRecord(feature, candidates[0].url, issues, true);
    record.notes.push(`Local validation covered ${candidates.length} matching page${candidates.length === 1 ? '' : 's'}.`);
    records.push(record);
  }
  return { records, errors, inspectedPages: htmlFiles.length };
}

const statuses = new Set<ValidationStatus>(['pass', 'fail', 'not-run', 'not-applicable']);
const assessments = new Set(['not-assessed', 'requires-google-validation', 'eligible', 'not-eligible', 'not-applicable']);

export function validateRichResultArtifact(value: unknown): string[] {
  const errors: string[] = [];
  if (!isObject(value)) return ['release artifact must be an object'];
  const artifact = value as unknown as Partial<RichResultArtifact>;
  if (artifact.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (!artifact.policy?.eligibilityOnly) errors.push('policy.eligibilityOnly must be true');
  if (artifact.policy?.rankingGuaranteed !== false) errors.push('policy.rankingGuaranteed must be false');
  if (!artifact.policy?.statement?.toLowerCase().includes('does not guarantee')) {
    errors.push('policy.statement must explicitly state that validation does not guarantee search appearance or ranking');
  }

  const records = artifact.records ?? [];
  const seen = new Set<string>();
  for (const record of records) {
    if (!richResultFeatures.includes(record.feature)) errors.push(`unsupported feature: ${record.feature}`);
    if (seen.has(record.feature)) errors.push(`duplicate feature record: ${record.feature}`);
    seen.add(record.feature);
    if (!record.pageTemplate) errors.push(`${record.feature}: pageTemplate is required`);
    for (const [label, block] of [
      ['localValidation', record.localValidation],
      ['richResultsTest', record.richResultsTest],
      ['urlInspection', record.urlInspection],
    ] as const) {
      if (!block || !statuses.has(block.status)) errors.push(`${record.feature}.${label}: invalid status`);
      if (!Array.isArray(block?.issues)) errors.push(`${record.feature}.${label}: issues must be an array`);
    }
    if (!assessments.has(record.eligibilityAssessment)) errors.push(`${record.feature}: invalid eligibilityAssessment`);
    if (!Array.isArray(record.notes)) errors.push(`${record.feature}: notes must be an array`);
  }
  for (const feature of richResultFeatures) {
    if (!seen.has(feature)) errors.push(`missing feature record: ${feature}`);
  }

  if (artifact.releaseDecision?.status === 'approved') {
    for (const record of records) {
      if (record.localValidation.status === 'not-applicable') continue;
      if (record.localValidation.status !== 'pass') errors.push(`${record.feature}: approved release requires passing local validation`);
      if (record.richResultsTest.status !== 'pass') errors.push(`${record.feature}: approved release requires Rich Results Test evidence`);
      if (record.urlInspection.status !== 'pass') errors.push(`${record.feature}: approved release requires URL Inspection evidence`);
      if (record.eligibilityAssessment !== 'eligible') errors.push(`${record.feature}: approved release requires an eligible assessment`);
    }
    if ((artifact.releaseDecision.blockingIssues ?? []).length > 0) errors.push('approved release cannot have blocking issues');
  }
  return errors;
}

export async function readRichResultArtifact(file: string): Promise<unknown> {
  return parse(await fs.readFile(file, 'utf8'));
}

export async function writeInspectionArtifact(file: string, inspection: StructuredDataInspection, releaseId: string, commit: string) {
  const artifact: RichResultArtifact = {
    schemaVersion: 1,
    release: { id: releaseId, commit, environment: 'staging', checkedAt: new Date().toISOString(), reviewer: '' },
    policy: {
      eligibilityOnly: true,
      rankingGuaranteed: false,
      statement: 'Valid structured data can make a page eligible for supported search features; it does not guarantee a rich result, search appearance, traffic, or ranking.',
    },
    records: inspection.records,
    releaseDecision: { status: 'pending', blockingIssues: inspection.errors, rationale: '' },
  };
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, stringify(artifact, { lineWidth: 120 }));
  return artifact;
}

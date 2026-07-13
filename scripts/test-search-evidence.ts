import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { stringify } from 'yaml';
import { buildPlanningInput, validateSanitizedReview } from '../src/search-operations/search-evidence';
import { searchPlanningInputSchema } from '../src/search-operations/schemas';

const execFile = promisify(execFileCallback);
const root = process.cwd();
const reviewedAt = '2026-07-10T08:00:00.000Z';
const reviewPeriod = { start: '2026-06-01', end: '2026-06-30' };
const operationalAreas = [
  'ownership',
  'sitemap',
  'indexing',
  'manual-actions',
  'security-issues',
  'core-web-vitals',
] as const;

function reviewFixture() {
  return {
    schema_version: '1.0.0',
    kind: 'search-console-performance-review',
    id: 'search-review-2026-06',
    status: 'approved',
    review_period: reviewPeriod,
    reviewed_at: reviewedAt,
    reviewer: 'Search editor',
    property: { environment: 'production', label: 'example.com' },
    operational_checks: operationalAreas.map((area) => ({
      area,
      status: 'verified',
      result: 'clear',
      observations: [],
      evidence_ref: `review-2026-06-${area}`,
    })),
    export: {
      source: 'search-console-ui',
      data_state: 'final',
      aggregation: 'page',
      sanitized: true,
      limitations: ['Anonymized queries and lower-volume rows can be omitted.'],
    },
    totals: { clicks: 42, impressions: 1200, ctr: 0.035, position: 8.4 },
    dimensions_reviewed: { queries: true, pages: true, countries: true, devices: true },
    observations: [{
      id: 'query-page-mobile-chn',
      query: 'astro 内容集合',
      page: '/writing/astro-content-collections/',
      country: 'CHN',
      device: 'MOBILE',
      metrics: { clicks: 8, impressions: 320, ctr: 0.025, position: 7.8 },
      finding: 'The page received 320 impressions and 8 clicks from this query-device-country segment.',
    }],
    recommendations: [{
      id: 'improve-astro-brief',
      status: 'approved',
      action: 'improve-existing',
      observation_ids: ['query-page-mobile-chn'],
      observed_period: reviewPeriod,
      reader_need: 'Readers need to know when Astro content collections are preferable to an external CMS.',
      content_gap: 'The current brief lists setup steps but does not explain the CMS tradeoff.',
      recommendation: 'Add a decision section with a worked comparison and constraints.',
      planning_targets: ['content-work/briefs/astro-content-collections.yaml'],
      evidence_basis: [
        { type: 'search-console-observation', reference: 'query-page-mobile-chn' },
        { type: 'reader-research', reference: 'support-question-2026-06-04' },
      ],
      approved_by: 'Content owner',
      approved_at: reviewedAt,
    }],
    approval: { approved_by: 'Content owner', approved_at: reviewedAt, notes: 'Sanitized and reviewed.' },
  };
}

const validReview = validateSanitizedReview(reviewFixture());
assert.equal(validReview.observations[0].country, 'CHN');
assert.equal(validReview.observations[0].device, 'MOBILE');

const planningInput = buildPlanningInput(validReview, new Date(reviewedAt));
assert.equal(planningInput.proposals.length, 1);
assert.deepEqual(planningInput.observed_period, reviewPeriod);
assert.equal(planningInput.proposals[0].cited_observations[0].query, 'astro 内容集合');
assert.match(planningInput.proposals[0].reader_need, /Readers need/);

const missingCountry = reviewFixture();
delete (missingCountry.observations[0] as { country?: string }).country;
assert.equal(searchPlanningInputSchema.safeParse(planningInput).success, true);
assert.throws(() => validateSanitizedReview(missingCountry), /country dimension/);

const mismatchedPeriod = reviewFixture();
mismatchedPeriod.recommendations[0].observed_period = { start: '2026-05-01', end: '2026-05-31' };
assert.throws(() => validateSanitizedReview(mismatchedPeriod), /exactly cite the review period/);

const unknownObservation = reviewFixture();
unknownObservation.recommendations[0].observation_ids = ['missing-observation'];
assert.throws(() => validateSanitizedReview(unknownObservation), /Unknown observation reference/);

const credentialLeak = { ...reviewFixture(), access_token: 'not-a-real-token' };
assert.throws(() => validateSanitizedReview(credentialLeak), /credential fields are not allowed/);

const authenticatedEvidenceUrl = reviewFixture();
authenticatedEvidenceUrl.operational_checks[0].evidence_ref = 'https://search.google.com/search-console?resource_id=example';
assert.throws(() => validateSanitizedReview(authenticatedEvidenceUrl), /authenticated Search Console value/);

const volumeOnlyExpansion = reviewFixture();
volumeOnlyExpansion.recommendations[0] = {
  ...volumeOnlyExpansion.recommendations[0],
  action: 'bulk-topic-expansion',
  evidence_basis: [{ type: 'keyword-volume', reference: 'external-volume-export' }],
};
assert.throws(() => validateSanitizedReview(volumeOnlyExpansion), /cannot be justified only by keyword volume/);

const supportedExpansion = reviewFixture();
supportedExpansion.recommendations[0] = {
  ...supportedExpansion.recommendations[0],
  action: 'bulk-topic-expansion',
  evidence_basis: [
    { type: 'search-console-observation', reference: 'query-page-mobile-chn' },
    { type: 'first-hand-expertise', reference: 'maintainer-project-notes' },
  ],
};
assert.doesNotThrow(() => validateSanitizedReview(supportedExpansion));

const draftReview = validateSanitizedReview({
  ...reviewFixture(),
  status: 'draft',
  approval: { approved_by: null, approved_at: null, notes: '' },
  recommendations: [],
});
assert.throws(() => buildPlanningInput(draftReview), /Only an approved/);

const approvedWithoutRecommendations = validateSanitizedReview({
  ...reviewFixture(),
  recommendations: [],
});
assert.throws(() => buildPlanningInput(approvedWithoutRecommendations), /No approved Search Console recommendations/);

const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'search-evidence-'));
const reviewFile = path.join(temporaryRoot, 'review.yaml');
const outputFile = path.join(temporaryRoot, 'planning.yaml');
await writeFile(reviewFile, stringify(reviewFixture()));

const tsx = path.join(root, 'node_modules/.bin/tsx');
const validationRun = await execFile(tsx, ['scripts/search-evidence.ts', 'validate', reviewFile], { cwd: root });
assert.match(validationRun.stdout, /"valid": true/);
await execFile(tsx, ['scripts/search-evidence.ts', 'plan', reviewFile, '--output', outputFile], { cwd: root });
const generated = searchPlanningInputSchema.parse((await import('yaml')).parse(await readFile(outputFile, 'utf8')));
assert.equal(generated.proposals[0].recommendation_id, 'improve-astro-brief');

console.log('Search Console evidence validation and planning feedback tests passed.');

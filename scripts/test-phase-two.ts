import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import {
  authorStyleSchema,
  editorialScorecardSchema,
  factLedgerSchema,
  scorecardDimensions,
} from '../src/content-workflow/schemas';
import { createArtifact, validateContentWorkflow } from '../src/content-workflow/workflow';
import { auditEditorialSource } from '../src/content-workflow/editorial';

const root = process.cwd();
const now = new Date().toISOString();
const reviewAfter = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

const configuredStyle = parse(await readFile('content-plans/author-style.yaml', 'utf8'));
const disabledStyle = authorStyleSchema.parse(configuredStyle);
assert.equal(disabledStyle.enabled, false);
assert.equal(disabledStyle.approvedExamples.length, 0);

const invalidEnabledStyle = authorStyleSchema.safeParse({
  ...configuredStyle,
  enabled: true,
  owner: 'Author',
  updatedAt: now,
  structurePreferences: ['Lead with the decision'],
});
assert.equal(invalidEnabledStyle.success, false);

const validEnabledStyle = authorStyleSchema.safeParse({
  ...configuredStyle,
  enabled: true,
  owner: 'Author',
  updatedAt: now,
  approvedExamples: [
    { path: 'src/content/posts/example-one.mdx', approvedAt: now },
    { path: 'src/content/posts/example-two.mdx', approvedAt: now },
  ],
  structurePreferences: ['Lead with the decision and its boundary'],
});
assert.equal(validEnabledStyle.success, true);

const editorialFindings = auditEditorialSource(`---
title: 完整性能实战
---

值得注意的是，这个方案显著提升了性能。
`, disabledStyle);
assert.ok(editorialFindings.some((finding) => finding.rule === 'generic-or-avoided-phrase'));
assert.ok(editorialFindings.some((finding) => finding.rule === 'unsupported-conclusion'));
assert.ok(editorialFindings.some((finding) => finding.rule === 'title-promise-evidence-gap'));

const draftLedger = createArtifact('fact-ledger', 'phase-two-facts', 'Phase Two Facts', 'Codex');
assert.equal(draftLedger.kind, 'fact-ledger');

const missingPrimary = factLedgerSchema.safeParse({
  ...draftLedger,
  status: 'approved',
  claims: [{
    id: 'changing-api-limit',
    claim: 'The API limit is currently 100 requests per minute',
    claimType: 'time-sensitive',
    impact: 'high',
    verificationStatus: 'verified',
    sources: [{ title: 'Secondary summary', url: 'https://example.org/summary', sourceType: 'secondary', accessedAt: now }],
    reviewAfter,
    verificationNote: 'Checked the summary',
    verifiedAt: now,
    verifiedBy: 'Reviewer',
  }],
});
assert.equal(missingPrimary.success, false);

const inventedExperience = factLedgerSchema.safeParse({
  ...draftLedger,
  status: 'approved',
  claims: [{
    id: 'personal-result',
    claim: 'This approach reduced deployment time by half',
    claimType: 'personal-experience',
    impact: 'high',
    verificationStatus: 'verified',
    sources: [],
    verificationNote: 'No author evidence supplied',
    verifiedAt: now,
    verifiedBy: 'Reviewer',
  }],
});
assert.equal(inventedExperience.success, false);

const verifiedLedger = factLedgerSchema.safeParse({
  ...draftLedger,
  status: 'approved',
  claims: [{
    id: 'current-api-limit',
    claim: 'The documented API limit is 100 requests per minute',
    claimType: 'time-sensitive',
    impact: 'high',
    verificationStatus: 'verified',
    sources: [{ title: 'Official API documentation', url: 'https://example.org/docs', sourceType: 'primary', accessedAt: now, publishedAt: now }],
    reviewAfter,
    verificationNote: 'Compared the claim with official documentation',
    verifiedAt: now,
    verifiedBy: 'Reviewer',
  }],
});
assert.equal(verifiedLedger.success, true);

const draftScorecard = createArtifact('editorial-scorecard', 'phase-two-scorecard', 'Phase Two Scorecard', 'Editor');
assert.equal(draftScorecard.kind, 'editorial-scorecard');

const humanReviews = scorecardDimensions.map((dimension) => ({
  dimension,
  decision: 'pass' as const,
  reviewer: 'Editor',
  rationale: `Reviewed ${dimension} evidence and accepted the remaining tradeoffs.`,
  reviewedAt: now,
}));
const machineFailureDoesNotDecide = editorialScorecardSchema.safeParse({
  ...draftScorecard,
  status: 'approved',
  machineChecks: [{ dimension: 'seo', check: 'metadata', status: 'fail', evidence: 'Description is too long' }],
  humanReviews,
  publicationDecision: 'approved',
});
assert.equal(machineFailureDoesNotDecide.success, true);

const missingHumanDimension = editorialScorecardSchema.safeParse({
  ...draftScorecard,
  status: 'approved',
  humanReviews: humanReviews.filter((review) => review.dimension !== 'display'),
  publicationDecision: 'approved',
});
assert.equal(missingHumanDimension.success, false);

const unresolvedBlockingRisk = editorialScorecardSchema.safeParse({
  ...draftScorecard,
  status: 'approved',
  humanReviews,
  unresolvedRisks: [{ severity: 'blocking', description: 'Primary source is unavailable', owner: 'Editor' }],
  publicationDecision: 'approved',
});
assert.equal(unresolvedBlockingRisk.success, false);

const projectValidation = await validateContentWorkflow(root);
assert.deepEqual(projectValidation.issues, []);

console.log('Phase 2 writing-style, source-policy, and editorial-scorecard tests passed.');

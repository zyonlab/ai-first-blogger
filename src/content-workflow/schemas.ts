import { z } from 'zod';

export const artifactSchemaVersion = '1.0.0' as const;
export const contentTypes = [
  'tutorial',
  'how-to',
  'explanation',
  'reference',
  'opinion',
  'case-study',
  'video-companion',
] as const;
export const lifecycleStates = [
  'idea',
  'researched',
  'brief-approved',
  'drafted',
  'reviewed',
  'published',
  'stale',
] as const;
export const reviewTypes = ['teaching', 'voice', 'seo', 'display', 'publishing'] as const;
export const claimTypes = ['stable', 'time-sensitive', 'personal-experience'] as const;
export const claimImpacts = ['low', 'medium', 'high'] as const;
export const sourceTypes = ['primary', 'secondary', 'author-evidence'] as const;
export const verificationStatuses = ['unverified', 'verified'] as const;
export const scorecardDimensions = ['factual', 'teaching', 'writing-style', 'seo', 'display'] as const;
export const machineCheckStatuses = ['pass', 'warn', 'fail'] as const;
export const publicationDecisions = ['pending', 'approved', 'blocked'] as const;

const artifactId = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const timestamp = z.iso.datetime();
const artifactStatus = z.enum(['draft', 'approved']);
export const sourceSchema = z.object({
  title: z.string().min(1),
  url: z.url(),
  sourceType: z.enum(sourceTypes),
  accessedAt: timestamp,
  publishedAt: timestamp.optional(),
});
const metadata = {
  schemaVersion: z.literal(artifactSchemaVersion),
  id: artifactId,
  title: z.string().min(1),
  owner: z.string().min(1),
  createdAt: timestamp,
  updatedAt: timestamp,
};

export const topicResearchSchema = z.object({
  ...metadata,
  kind: z.literal('topic-research'),
  status: artifactStatus,
  topic: z.string().min(1),
  targetReader: z.string(),
  businessGoal: z.string(),
  contentPillar: z.string(),
  readerProblem: z.string(),
  searchIntents: z.array(z.string().min(1)),
  sources: z.array(sourceSchema),
  competitorPatterns: z.array(z.string().min(1)),
  contentGap: z.string(),
  angle: z.string(),
  unansweredQuestions: z.array(z.string().min(1)),
}).superRefine((value, context) => {
  if (value.status !== 'approved') return;
  for (const [field, valid] of [
    ['readerProblem', value.readerProblem.length > 0],
    ['targetReader', value.targetReader.length > 0],
    ['contentPillar', value.contentPillar.length > 0],
    ['searchIntents', value.searchIntents.length > 0],
    ['sources', value.sources.length > 0],
    ['contentGap', value.contentGap.length > 0],
    ['angle', value.angle.length > 0],
  ] as const) {
    if (!valid) context.addIssue({ code: 'custom', path: [field], message: `${field} is required before approval` });
  }
});

export const seriesPlanSchema = z.object({
  ...metadata,
  kind: z.literal('series-plan'),
  status: artifactStatus,
  domain: z.string().min(1),
  audienceLevel: z.string(),
  readerOutcome: z.string(),
  contentPillar: z.string(),
  learningPath: z.array(z.string().min(1)),
  articles: z.array(z.object({
    slug: artifactId,
    title: z.string().min(1),
    intent: z.string().min(1),
    contentType: z.enum(contentTypes),
    readerJob: z.string().min(1),
    prerequisites: z.array(z.string().min(1)),
  })),
  internalLinks: z.array(artifactId),
  difficultyCurve: z.array(z.string().min(1)),
}).superRefine((value, context) => {
  if (value.status !== 'approved') return;
  if (!value.readerOutcome) context.addIssue({ code: 'custom', path: ['readerOutcome'], message: 'readerOutcome is required before approval' });
  if (!value.audienceLevel) context.addIssue({ code: 'custom', path: ['audienceLevel'], message: 'audienceLevel is required before approval' });
  if (!value.contentPillar) context.addIssue({ code: 'custom', path: ['contentPillar'], message: 'contentPillar is required before approval' });
  if (value.articles.length < 2) context.addIssue({ code: 'custom', path: ['articles'], message: 'An approved series needs at least two articles' });
  if (value.difficultyCurve.length === 0) context.addIssue({ code: 'custom', path: ['difficultyCurve'], message: 'difficultyCurve is required before approval' });
});

export const articleBriefSchema = z.object({
  ...metadata,
  kind: z.literal('article-brief'),
  status: artifactStatus,
  topicResearchId: artifactId,
  seriesPlanId: artifactId.optional(),
  targetReader: z.string(),
  searchIntent: z.string(),
  conversionGoal: z.string(),
  contentType: z.enum(contentTypes),
  description: z.string(),
  slug: artifactId,
  category: z.string(),
  tags: z.array(z.string().min(1)),
  directAnswer: z.string().optional(),
  outline: z.array(z.object({
    level: z.union([z.literal(2), z.literal(3)]),
    heading: z.string().min(1),
    readerJob: z.string().min(1),
  })),
  definitions: z.array(z.object({ term: z.string().min(1), definition: z.string().min(1) })),
  examples: z.array(z.object({ type: z.string().min(1), purpose: z.string().min(1) })),
  internalLinks: z.array(z.string().min(1)),
  faq: z.array(z.object({ question: z.string().min(1), answerGoal: z.string().min(1) })),
}).superRefine((value, context) => {
  if (value.status !== 'approved') return;
  if (!value.description) context.addIssue({ code: 'custom', path: ['description'], message: 'description is required before approval' });
  if (!value.targetReader) context.addIssue({ code: 'custom', path: ['targetReader'], message: 'targetReader is required before approval' });
  if (!value.searchIntent) context.addIssue({ code: 'custom', path: ['searchIntent'], message: 'searchIntent is required before approval' });
  if (!value.category) context.addIssue({ code: 'custom', path: ['category'], message: 'category is required before approval' });
  if (!value.outline.some((section) => section.level === 2)) context.addIssue({ code: 'custom', path: ['outline'], message: 'An approved brief needs at least one H2' });
  if (value.examples.length === 0) context.addIssue({ code: 'custom', path: ['examples'], message: 'An approved brief needs concrete evidence or an example' });
});

export const factLedgerSchema = z.object({
  ...metadata,
  kind: z.literal('fact-ledger'),
  status: artifactStatus,
  articleBriefId: artifactId,
  claims: z.array(z.object({
    id: artifactId,
    claim: z.string().min(1),
    claimType: z.enum(claimTypes),
    impact: z.enum(claimImpacts),
    verificationStatus: z.enum(verificationStatuses),
    sources: z.array(sourceSchema),
    reviewAfter: timestamp.optional(),
    authorEvidence: z.string().optional(),
    verificationNote: z.string(),
    verifiedAt: timestamp.optional(),
    verifiedBy: z.string().optional(),
  })),
}).superRefine((value, context) => {
  if (value.status === 'approved' && value.claims.length === 0) {
    context.addIssue({ code: 'custom', path: ['claims'], message: 'An approved fact ledger needs at least one claim' });
  }
  value.claims.forEach((claim, index) => {
    const hasPrimarySource = claim.sources.some((source) => source.sourceType === 'primary');
    if (claim.claimType === 'time-sensitive' && (!hasPrimarySource || !claim.reviewAfter)) {
      context.addIssue({ code: 'custom', path: ['claims', index], message: 'Time-sensitive claims need a primary source and reviewAfter' });
    }
    if (claim.claimType === 'personal-experience' && !claim.authorEvidence) {
      context.addIssue({ code: 'custom', path: ['claims', index, 'authorEvidence'], message: 'Personal experience must identify author-provided evidence' });
    }
    if (claim.impact === 'high' && claim.claimType !== 'personal-experience' && !hasPrimarySource) {
      context.addIssue({ code: 'custom', path: ['claims', index, 'sources'], message: 'High-impact claims need a primary source' });
    }
    if (value.status === 'approved' && (claim.verificationStatus !== 'verified' || !claim.verifiedAt || !claim.verifiedBy)) {
      context.addIssue({ code: 'custom', path: ['claims', index, 'verificationStatus'], message: 'Approved ledgers require every claim to be verified with verifiedAt and verifiedBy' });
    }
  });
});

export const authorStyleSchema = z.object({
  version: z.literal(artifactSchemaVersion),
  enabled: z.boolean(),
  owner: z.string(),
  updatedAt: timestamp.nullable(),
  approvedExamples: z.array(z.object({
    path: z.string().min(1),
    approvedAt: timestamp,
  })),
  structurePreferences: z.array(z.string().min(1)),
  sentencePreferences: z.array(z.string().min(1)),
  preferredTerms: z.array(z.string().min(1)),
  avoidPatterns: z.array(z.string().min(1)),
  evidenceStyle: z.array(z.string().min(1)),
  activationRule: z.string().min(1),
  fallbackRule: z.string().min(1),
}).superRefine((value, context) => {
  if (!value.enabled) return;
  if (!value.owner) context.addIssue({ code: 'custom', path: ['owner'], message: 'Enabled writing style requires an owner' });
  if (!value.updatedAt) context.addIssue({ code: 'custom', path: ['updatedAt'], message: 'Enabled writing style requires updatedAt' });
  if (value.approvedExamples.length < 2) context.addIssue({ code: 'custom', path: ['approvedExamples'], message: 'Enable writing style only after two approved examples' });
  const preferenceCount = value.structurePreferences.length
    + value.sentencePreferences.length
    + value.preferredTerms.length
    + value.avoidPatterns.length
    + value.evidenceStyle.length;
  if (preferenceCount === 0) context.addIssue({ code: 'custom', path: [], message: 'Enabled writing style needs at least one explicit preference' });
});

export const reviewReportSchema = z.object({
  ...metadata,
  kind: z.literal('review-report'),
  articleBriefId: artifactId,
  reviewType: z.enum(reviewTypes),
  decision: z.enum(['pass', 'changes-required']),
  reviewer: z.string().min(1),
  reviewedAt: timestamp,
  findings: z.array(z.object({
    severity: z.enum(['info', 'warning', 'blocking']),
    location: z.string().min(1),
    message: z.string().min(1),
    suggestion: z.string().min(1),
  })),
});

export const editorialScorecardSchema = z.object({
  ...metadata,
  kind: z.literal('editorial-scorecard'),
  status: artifactStatus,
  articleBriefId: artifactId,
  machineChecks: z.array(z.object({
    dimension: z.enum(scorecardDimensions),
    check: z.string().min(1),
    status: z.enum(machineCheckStatuses),
    evidence: z.string().min(1),
  })),
  humanReviews: z.array(z.object({
    dimension: z.enum(scorecardDimensions),
    decision: z.enum(['pass', 'changes-required']),
    reviewer: z.string().min(1),
    rationale: z.string().min(1),
    reviewedAt: timestamp,
  })),
  unresolvedRisks: z.array(z.object({
    severity: z.enum(['info', 'warning', 'blocking']),
    description: z.string().min(1),
    owner: z.string().min(1),
  })),
  publicationDecision: z.enum(publicationDecisions),
}).superRefine((value, context) => {
  const reviewedDimensions = new Set(value.humanReviews.map((review) => review.dimension));
  if (value.status === 'approved') {
    for (const dimension of scorecardDimensions) {
      if (!reviewedDimensions.has(dimension)) {
        context.addIssue({ code: 'custom', path: ['humanReviews'], message: `Approved scorecards require a human decision for ${dimension}` });
      }
    }
    if (value.publicationDecision === 'pending') {
      context.addIssue({ code: 'custom', path: ['publicationDecision'], message: 'Approved scorecards need a final publication decision' });
    }
  }
  if (value.publicationDecision === 'approved') {
    if (value.status !== 'approved') {
      context.addIssue({ code: 'custom', path: ['status'], message: 'Publication approval requires an approved scorecard' });
    }
    if (value.humanReviews.some((review) => review.decision !== 'pass')) {
      context.addIssue({ code: 'custom', path: ['humanReviews'], message: 'Publication approval requires every human dimension to pass' });
    }
    if (value.unresolvedRisks.some((risk) => risk.severity === 'blocking')) {
      context.addIssue({ code: 'custom', path: ['unresolvedRisks'], message: 'Publication approval cannot contain blocking risks' });
    }
  }
});

export const contentWorkflowSchema = z.object({
  ...metadata,
  kind: z.literal('content-workflow'),
  state: z.enum(lifecycleStates),
  topicResearchId: artifactId.optional(),
  seriesPlanId: artifactId.optional(),
  articleBriefId: artifactId.optional(),
  factLedgerId: artifactId.optional(),
  editorialScorecardId: artifactId.optional(),
  reviewIds: z.array(artifactId),
  contentPath: z.string().optional(),
  history: z.array(z.object({
    from: z.enum(lifecycleStates).optional(),
    to: z.enum(lifecycleStates),
    at: timestamp,
    actor: z.string().min(1),
  })),
});

export const artifactSchema = z.union([
  topicResearchSchema,
  seriesPlanSchema,
  articleBriefSchema,
  factLedgerSchema,
  reviewReportSchema,
  editorialScorecardSchema,
  contentWorkflowSchema,
]);

export type Artifact = z.infer<typeof artifactSchema>;
export type ContentWorkflow = z.infer<typeof contentWorkflowSchema>;

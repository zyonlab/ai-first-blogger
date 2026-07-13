import { z } from 'zod';

export const searchEvidenceSchemaVersion = '1.0.0' as const;
export const searchDevices = ['DESKTOP', 'MOBILE', 'TABLET'] as const;
export const recommendationActions = [
  'improve-existing',
  'create-brief',
  'extend-series',
  'consolidate-content',
  'investigate',
  'bulk-topic-expansion',
] as const;
export const evidenceBasisTypes = [
  'search-console-observation',
  'reader-research',
  'first-hand-expertise',
  'business-priority',
  'keyword-volume',
] as const;

const identifier = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const isoDate = z.iso.date();
const timestamp = z.iso.datetime();
const metricSetSchema = z.object({
  clicks: z.number().nonnegative(),
  impressions: z.number().nonnegative(),
  ctr: z.number().min(0).max(1),
  position: z.number().nonnegative(),
}).strict();
const observedPeriodSchema = z.object({
  start: isoDate,
  end: isoDate,
}).strict().refine((period) => period.start <= period.end, {
  message: 'Observed period start must be on or before its end',
  path: ['end'],
});

export const searchObservationSchema = z.object({
  id: identifier,
  query: z.string().min(1).optional(),
  page: z.string().min(1).optional(),
  country: z.string().regex(/^[A-Z]{3}$/).optional(),
  device: z.enum(searchDevices).optional(),
  metrics: metricSetSchema,
  finding: z.string().min(1),
}).strict().superRefine((observation, context) => {
  if (!observation.query && !observation.page && !observation.country && !observation.device) {
    context.addIssue({
      code: 'custom',
      path: [],
      message: 'An observation needs at least one query, page, country, or device dimension',
    });
  }
  if (observation.page) {
    try {
      const parsed = new URL(observation.page, 'https://example.invalid');
      if (parsed.username || parsed.password || parsed.search || parsed.hash) {
        context.addIssue({
          code: 'custom',
          path: ['page'],
          message: 'Page evidence must not contain credentials, query parameters, or fragments',
        });
      }
    } catch {
      context.addIssue({ code: 'custom', path: ['page'], message: 'Page must be a public URL or path' });
    }
  }
});

const evidenceBasisSchema = z.object({
  type: z.enum(evidenceBasisTypes),
  reference: z.string().min(1),
}).strict();

export const searchRecommendationSchema = z.object({
  id: identifier,
  status: z.enum(['proposed', 'approved', 'rejected']),
  action: z.enum(recommendationActions),
  observation_ids: z.array(identifier).min(1),
  observed_period: observedPeriodSchema,
  reader_need: z.string().min(1),
  content_gap: z.string().min(1),
  recommendation: z.string().min(1),
  planning_targets: z.array(z.string().min(1)).min(1),
  evidence_basis: z.array(evidenceBasisSchema).min(1),
  approved_by: z.string().min(1).optional(),
  approved_at: timestamp.optional(),
}).strict().superRefine((recommendation, context) => {
  if (recommendation.status === 'approved' && (!recommendation.approved_by || !recommendation.approved_at)) {
    context.addIssue({
      code: 'custom',
      path: ['approved_by'],
      message: 'Approved recommendations require approved_by and approved_at',
    });
  }
  if (recommendation.action === 'bulk-topic-expansion') {
    const basis = new Set(recommendation.evidence_basis.map((item) => item.type));
    const hasReaderOrEditorialEvidence = basis.has('reader-research')
      || basis.has('first-hand-expertise')
      || basis.has('business-priority');
    if (!hasReaderOrEditorialEvidence || [...basis].every((type) => type === 'keyword-volume')) {
      context.addIssue({
        code: 'custom',
        path: ['evidence_basis'],
        message: 'Bulk topic expansion cannot be justified only by keyword volume or search demand',
      });
    }
  }
});

export const searchConsoleReviewSchema = z.object({
  schema_version: z.literal(searchEvidenceSchemaVersion),
  kind: z.literal('search-console-performance-review'),
  id: identifier,
  status: z.enum(['draft', 'approved']),
  review_period: observedPeriodSchema,
  reviewed_at: timestamp,
  reviewer: z.string().min(1),
  property: z.object({
    environment: z.literal('production'),
    label: z.string().min(1),
  }).strict(),
  operational_checks: z.array(z.object({
    area: z.enum(['ownership', 'sitemap', 'indexing', 'manual-actions', 'security-issues', 'core-web-vitals']),
    status: z.enum(['verified', 'issue', 'not-available', 'not-checked']),
    result: z.string(),
    observations: z.array(z.string().min(1)),
    evidence_ref: z.string(),
  }).strict()).length(6),
  export: z.object({
    source: z.enum(['search-console-ui', 'search-console-api']),
    data_state: z.enum(['final', 'fresh']),
    aggregation: z.enum(['property', 'page']),
    sanitized: z.literal(true),
    limitations: z.array(z.string().min(1)).min(1),
  }).strict(),
  totals: metricSetSchema,
  dimensions_reviewed: z.object({
    queries: z.literal(true),
    pages: z.literal(true),
    countries: z.literal(true),
    devices: z.literal(true),
  }).strict(),
  observations: z.array(searchObservationSchema).min(1),
  recommendations: z.array(searchRecommendationSchema),
  approval: z.object({
    approved_by: z.string().min(1).nullish(),
    approved_at: timestamp.nullish(),
    notes: z.string(),
  }).strict(),
}).strict().superRefine((review, context) => {
  const operationalAreas = new Set(review.operational_checks.map((check) => check.area));
  if (operationalAreas.size !== review.operational_checks.length) {
    context.addIssue({ code: 'custom', path: ['operational_checks'], message: 'Operational check areas must be unique' });
  }
  const observationIds = new Set(review.observations.map((observation) => observation.id));
  if (observationIds.size !== review.observations.length) {
    context.addIssue({ code: 'custom', path: ['observations'], message: 'Observation IDs must be unique' });
  }
  for (const dimension of ['query', 'page', 'country', 'device'] as const) {
    if (!review.observations.some((observation) => observation[dimension])) {
      context.addIssue({
        code: 'custom',
        path: ['observations'],
        message: `Review observations must track the ${dimension} dimension`,
      });
    }
  }
  const recommendationIds = new Set<string>();
  review.recommendations.forEach((recommendation, index) => {
    if (recommendationIds.has(recommendation.id)) {
      context.addIssue({ code: 'custom', path: ['recommendations', index, 'id'], message: 'Recommendation IDs must be unique' });
    }
    recommendationIds.add(recommendation.id);
    if (recommendation.observed_period.start !== review.review_period.start
      || recommendation.observed_period.end !== review.review_period.end) {
      context.addIssue({
        code: 'custom',
        path: ['recommendations', index, 'observed_period'],
        message: 'Recommendation period must exactly cite the review period',
      });
    }
    recommendation.observation_ids.forEach((observationId) => {
      if (!observationIds.has(observationId)) {
        context.addIssue({
          code: 'custom',
          path: ['recommendations', index, 'observation_ids'],
          message: `Unknown observation reference: ${observationId}`,
        });
      }
    });
  });
  if (review.status === 'approved' && (!review.approval.approved_by || !review.approval.approved_at)) {
    context.addIssue({
      code: 'custom',
      path: ['approval'],
      message: 'Approved reviews require approved_by and approved_at',
    });
  }
});

export const searchPlanningInputSchema = z.object({
  schema_version: z.literal(searchEvidenceSchemaVersion),
  kind: z.literal('search-evidence-planning-input'),
  source_review_id: identifier,
  observed_period: observedPeriodSchema,
  generated_at: timestamp,
  proposals: z.array(z.object({
    recommendation_id: identifier,
    action: z.enum(recommendationActions),
    planning_targets: z.array(z.string().min(1)).min(1),
    reader_need: z.string().min(1),
    content_gap: z.string().min(1),
    recommendation: z.string().min(1),
    cited_observations: z.array(searchObservationSchema).min(1),
    evidence_basis: z.array(evidenceBasisSchema).min(1),
  }).strict()).min(1),
}).strict();

export type SearchConsoleReview = z.infer<typeof searchConsoleReviewSchema>;
export type SearchPlanningInput = z.infer<typeof searchPlanningInputSchema>;

import { promises as fs } from 'node:fs';
import { parse, stringify } from 'yaml';
import {
  searchConsoleReviewSchema,
  searchPlanningInputSchema,
  type SearchConsoleReview,
  type SearchPlanningInput,
} from './schemas';

const forbiddenKey = /(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|authorization|cookie|password|verification[_-]?token|credentials?)/i;
const forbiddenValue = /(?:bearer\s+[a-z0-9._~+/=-]+|[?&](?:key|token|code|secret)=|search\.google\.com\/search-console(?:\?|\/))/i;

function findSensitiveData(value: unknown, path: Array<string | number> = []): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findSensitiveData(item, [...path, index]));
  }
  if (!value || typeof value !== 'object') {
    return typeof value === 'string' && forbiddenValue.test(value)
      ? [`${path.join('.')}: contains a credential-like or authenticated Search Console value`]
      : [];
  }
  return Object.entries(value).flatMap(([key, nested]) => {
    const currentPath = [...path, key];
    const issues = forbiddenKey.test(key)
      ? [`${currentPath.join('.')}: credential fields are not allowed`]
      : [];
    return issues.concat(findSensitiveData(nested, currentPath));
  });
}

export function validateSanitizedReview(input: unknown): SearchConsoleReview {
  const sensitiveIssues = findSensitiveData(input);
  if (sensitiveIssues.length > 0) {
    throw new Error(`Search evidence is not sanitized:\n${sensitiveIssues.join('\n')}`);
  }
  return searchConsoleReviewSchema.parse(input);
}

export async function readSanitizedReview(file: string) {
  return validateSanitizedReview(parse(await fs.readFile(file, 'utf8')));
}

export function buildPlanningInput(
  review: SearchConsoleReview,
  generatedAt = new Date(),
): SearchPlanningInput {
  if (review.status !== 'approved') {
    throw new Error('Only an approved Search Console review can feed content planning');
  }
  const observations = new Map(review.observations.map((observation) => [observation.id, observation]));
  const proposals = review.recommendations
    .filter((recommendation) => recommendation.status === 'approved')
    .map((recommendation) => ({
      recommendation_id: recommendation.id,
      action: recommendation.action,
      planning_targets: recommendation.planning_targets,
      reader_need: recommendation.reader_need,
      content_gap: recommendation.content_gap,
      recommendation: recommendation.recommendation,
      cited_observations: recommendation.observation_ids.map((id) => {
        const observation = observations.get(id);
        if (!observation) throw new Error(`Missing observation ${id}`);
        return observation;
      }),
      evidence_basis: recommendation.evidence_basis,
    }));
  if (proposals.length === 0) {
    throw new Error('No approved Search Console recommendations are available for content planning');
  }

  return searchPlanningInputSchema.parse({
    schema_version: review.schema_version,
    kind: 'search-evidence-planning-input',
    source_review_id: review.id,
    observed_period: review.review_period,
    generated_at: generatedAt.toISOString(),
    proposals,
  });
}

export async function writePlanningInput(file: string, input: SearchPlanningInput) {
  await fs.writeFile(file, stringify(input, { lineWidth: 100 }));
}

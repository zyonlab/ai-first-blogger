import path from 'node:path';
import { buildPlanningInput, readSanitizedReview, writePlanningInput } from '../src/search-operations/search-evidence';

const root = process.env.AI_FIRST_BLOGGER_ROOT ?? process.cwd();
const argumentsList = process.argv.slice(2).filter((argument) => argument !== '--');
const [command, inputFile] = argumentsList;

function option(name: string) {
  const index = argumentsList.indexOf(name);
  return index >= 0 ? argumentsList[index + 1] : undefined;
}

function usage(): never {
  throw new Error('Usage: tsx scripts/search-evidence.ts <validate|plan> <review.yaml> [--output <planning-input.yaml>]');
}

if (!command || !inputFile) usage();
const review = await readSanitizedReview(path.resolve(root, inputFile));

if (command === 'validate') {
  console.log(JSON.stringify({
    valid: true,
    reviewId: review.id,
    status: review.status,
    observedPeriod: review.review_period,
    observations: review.observations.length,
    approvedRecommendations: review.recommendations.filter((item) => item.status === 'approved').length,
  }, null, 2));
} else if (command === 'plan') {
  const output = option('--output');
  if (!output) usage();
  const planningInput = buildPlanningInput(review);
  const outputFile = path.resolve(root, output);
  await writePlanningInput(outputFile, planningInput);
  console.log(JSON.stringify({
    generated: path.relative(root, outputFile),
    sourceReviewId: review.id,
    proposals: planningInput.proposals.length,
  }, null, 2));
} else {
  usage();
}

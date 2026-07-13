import path from 'node:path';
import { loadPageExperienceConfig, toLighthouseBudgets, validatePageExperience } from './lib/page-experience';

const root = process.cwd();
const command = process.argv[2] ?? 'validate';

if (command === 'lighthouse-budgets') {
  const config = await loadPageExperienceConfig(root);
  process.stdout.write(`${JSON.stringify(toLighthouseBudgets(config), null, 2)}\n`);
} else if (command === 'validate') {
  const distFlag = process.argv.indexOf('--dist');
  const dist = distFlag >= 0 ? path.resolve(root, process.argv[distFlag + 1] ?? 'dist') : undefined;
  const result = await validatePageExperience(root, dist);
  for (const warning of result.warnings) console.warn(`WARN ${warning}`);
  for (const error of result.errors) console.error(`ERROR ${error}`);
  console.log(`Checked ${result.checkedTemplates.length} representative templates and ${result.checkedRenderedPages} rendered pages.`);
  if (result.errors.length > 0) process.exitCode = 1;
} else {
  console.error('Usage: tsx scripts/page-experience.ts <validate [--dist dist]|lighthouse-budgets>');
  process.exitCode = 1;
}


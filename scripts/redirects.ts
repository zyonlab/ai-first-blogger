import { generateRedirects, validateRedirects } from './lib/redirects';

const command = process.argv[2] ?? 'validate';
const root = process.env.AI_FIRST_BLOGGER_ROOT ?? process.cwd();

if (command === 'generate') {
  const redirects = await generateRedirects(root);
  console.log(`Redirect generation passed: ${redirects.length} redirect${redirects.length === 1 ? '' : 's'} written.`);
} else if (command === 'validate') {
  const result = await validateRedirects(root);
  if (result.errors.length > 0) {
    console.error('Redirect validation failed:');
    for (const error of result.errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(`Redirect validation passed: ${result.redirects.length} redirect${result.redirects.length === 1 ? '' : 's'} checked.`);
} else {
  throw new Error(`Unknown redirect command: ${command}. Use validate or generate.`);
}


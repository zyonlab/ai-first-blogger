import { generateImages, validateImages } from './lib/images';

const command = process.argv[2] ?? 'validate';
const root = process.env.AI_FIRST_BLOGGER_ROOT ?? process.cwd();

if (command === 'generate') {
  const written = await generateImages(root);
  console.log(`Image generation passed: ${written.length} social card${written.length === 1 ? '' : 's'} written.`);
} else if (command === 'validate') {
  const result = await validateImages(root);
  if (result.errors.length > 0) {
    console.error('Image validation failed:');
    for (const error of result.errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(`Image validation passed: ${result.imageCount} registered images and ${result.contentFileCount} content files checked.`);
} else {
  throw new Error(`Unknown image command: ${command}. Use validate or generate.`);
}


import path from 'node:path';
import {
  inspectStructuredData,
  readRichResultArtifact,
  validateRichResultArtifact,
  writeInspectionArtifact,
} from './lib/rich-results';

const command = process.argv[2];
const option = (name: string, fallback?: string) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};

if (command === 'inspect') {
  const dist = path.resolve(option('--dist', 'dist')!);
  const output = option('--output');
  const inspection = await inspectStructuredData(dist);
  if (output) {
    await writeInspectionArtifact(
      path.resolve(output),
      inspection,
      option('--release-id', 'local-validation')!,
      option('--commit', 'unknown')!,
    );
  }
  for (const error of inspection.errors) console.error(`ERROR ${error}`);
  console.log(`Inspected ${inspection.inspectedPages} pages; recorded Article, VideoObject, ProfilePage, and BreadcrumbList.`);
  if (inspection.errors.length > 0) process.exitCode = 1;
} else if (command === 'validate-record') {
  const file = option('--file');
  if (!file) throw new Error('validate-record requires --file <artifact.yaml>');
  const errors = validateRichResultArtifact(await readRichResultArtifact(path.resolve(file)));
  for (const error of errors) console.error(`ERROR ${error}`);
  console.log(`Validated rich-result release record: ${file}`);
  if (errors.length > 0) process.exitCode = 1;
} else {
  console.error('Usage: tsx scripts/rich-results-release.ts <inspect [--dist dist] [--output record.yaml]|validate-record --file record.yaml>');
  process.exitCode = 1;
}


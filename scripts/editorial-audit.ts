import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';
import { auditEditorialSource } from '../src/content-workflow/editorial';
import { authorStyleSchema } from '../src/content-workflow/schemas';

const root = process.env.AI_FIRST_BLOGGER_ROOT ?? process.cwd();
const [file] = process.argv.slice(2).filter((argument) => argument !== '--');

if (!file) {
  console.error('Usage: content:editorial-audit <md-or-mdx-file>');
  process.exit(1);
}

const target = path.resolve(root, file);
const style = authorStyleSchema.parse(parse(await readFile(path.join(root, 'content-plans/author-style.yaml'), 'utf8')));
const findings = auditEditorialSource(await readFile(target, 'utf8'), style);

console.log(JSON.stringify({
  file: path.relative(root, target),
  authorStyleEnabled: style.enabled,
  findingCount: findings.length,
  findings,
  note: 'Editorial heuristics inform review and never publish or reject content by themselves.',
}, null, 2));

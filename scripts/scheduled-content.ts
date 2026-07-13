import { promises as fs } from 'node:fs';
import { findDueContent } from '../src/content-workflow/freshness';

const root = process.env.AI_FIRST_BLOGGER_ROOT ?? process.cwd();
const argumentsList = process.argv.slice(2).filter((argument) => argument !== '--');

function option(name: string) {
  const index = argumentsList.indexOf(name);
  return index >= 0 ? argumentsList[index + 1] : undefined;
}

const nowValue = option('--now');
const now = nowValue ? new Date(nowValue) : new Date();
const windowMinutes = Number(option('--window-minutes') ?? 70);
if (Number.isNaN(now.valueOf())) throw new Error(`Invalid --now value: ${nowValue}`);
if (!Number.isFinite(windowMinutes) || windowMinutes <= 0) throw new Error('--window-minutes must be a positive number');

const due = await findDueContent(root, now, windowMinutes);
const report = { generatedAt: now.toISOString(), windowMinutes, hasDue: due.length > 0, due };
console.log(JSON.stringify(report, null, 2));

const githubOutput = option('--github-output');
if (githubOutput) {
  await fs.appendFile(githubOutput, `has_due=${due.length > 0}\n`);
}

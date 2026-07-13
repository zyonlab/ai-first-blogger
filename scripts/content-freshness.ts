import { execFile as execFileCallback } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { collectFreshness, checkSubstantiveUpdatedDateChange } from '../src/content-workflow/freshness';

const execFile = promisify(execFileCallback);
const root = process.env.AI_FIRST_BLOGGER_ROOT ?? process.cwd();
const argumentsList = process.argv.slice(2).filter((argument) => argument !== '--');

function option(name: string) {
  const index = argumentsList.indexOf(name);
  return index >= 0 ? argumentsList[index + 1] : undefined;
}

async function checkGitUpdates(base: string) {
  const { stdout } = await execFile('git', ['diff', '--name-only', `${base}...HEAD`, '--', 'src/content'], { cwd: root });
  const files = stdout.split('\n').filter((file) => /\.mdx?$/.test(file));
  const issues = [];
  for (const file of files) {
    let beforeSource = '';
    try {
      ({ stdout: beforeSource } = await execFile('git', ['show', `${base}:${file}`], { cwd: root }));
    } catch {
      continue;
    }
    const afterSource = await fs.readFile(path.join(root, file), 'utf8');
    const issue = checkSubstantiveUpdatedDateChange(beforeSource, afterSource, file);
    if (issue) issues.push(issue);
  }
  return issues;
}

const nowValue = option('--now');
const now = nowValue ? new Date(nowValue) : new Date();
if (Number.isNaN(now.valueOf())) throw new Error(`Invalid --now value: ${nowValue}`);

const stale = await collectFreshness(root, now);
const base = option('--base');
const updateIssues = base ? await checkGitUpdates(base) : [];
const report = {
  generatedAt: now.toISOString(),
  staleCount: stale.length,
  stale,
  updateIssueCount: updateIssues.length,
  updateIssues,
};

console.log(JSON.stringify(report, null, 2));
if ((option('--fail-on-stale') === 'true' && stale.length > 0) || updateIssues.length > 0) process.exit(1);

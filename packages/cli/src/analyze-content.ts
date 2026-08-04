/**
 * Content style analyser.
 *
 *   pnpm analyze                      # every file under content/
 *   pnpm analyze <dir-or-file> …      # specific targets (for before/after runs)
 *
 * Turns "this reads like AI wrote it" into numbers that can be re-computed and
 * compared across a rewrite. It measures signals, not quality — a clean score
 * means the obvious tells are gone, not that the article is good.
 *
 * **Every signal it looks for comes from the voice file** named by
 * `style.voice` in site/policy.yaml (default `site/voice.md`). Nothing about
 * what counts as good writing is hardcoded here: this script knows how to
 * count, the voice file knows what to count. That split is what makes the
 * writing style something a site owns rather than something the framework
 * imposes — and it is why the analyser works for any language whose voice file
 * defines its own phrases.
 *
 * Writes content-report.json. Blocking is a separate decision: see
 * `style.minScore` in site/policy.yaml.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { policy } from 'aifb-engine/config/policy';
import { voice } from 'aifb-engine/config/voice';
import { analyseArticle, displayWidth, type Finding, type ScoredArticle } from './style/score';
import { collectSurfaces, type Surface } from './surfaces';

const { avoid, thresholds } = voice;

/** Every .md/.mdx under a target, which may be a file or a directory. */
async function walk(target: string): Promise<string[]> {
  const stat = await fs.stat(target);
  if (stat.isFile()) return /\.mdx?$/.test(target) ? [target] : [];
  const items = await fs.readdir(target, { withFileTypes: true });
  const nested = await Promise.all(items.map((item) => walk(path.join(target, item.name))));
  return nested.flat();
}


/* ------------------------------------------------------------------ *
 * Surfaces — the outward-facing strings that are not article bodies
 * ------------------------------------------------------------------ */

/**
 * A surface is one sentence, so only the signals that make sense for a sentence
 * apply: the avoid list and noun-list detection. The article checks — code
 * ratio, opening paragraph, "does it contain first-hand experience" — would be
 * nonsense against a 30-character meta description.
 *
 * Surfaces are reported, never blocking. `site/policy.yaml` decides whether an
 * *article* score blocks; a template sentence must not be able to stop a deploy.
 */
function analyseSurface(surface: Surface) {
  const findings: Finding[] = [];
  const text = surface.text;

  for (const rule of avoid) {
    for (const phrase of rule.phrases ?? []) {
      if (!text.includes(phrase)) continue;
      findings.push({
        kind: 'avoid',
        penalty: rule.weight,
        message: `「${phrase}」${rule.why ? ` — ${rule.why}` : ''}`,
        fix: '这句会出现在搜索结果和 llms.txt 里，换成只有这个站能说出口的具体内容。',
      });
    }
    if (rule.combo) {
      const present = rule.combo.filter((part) => text.includes(part));
      if (present.length >= (rule.min ?? rule.combo.length)) {
        findings.push({
          kind: 'combo',
          penalty: rule.weight,
          message: `模板结构：${present.join(' / ')}`,
          fix: '一句话的描述不需要骨架，直接说结论。',
        });
      }
    }
  }

  if ((text.match(/、/g) ?? []).length >= thresholds.nounListMarks) {
    findings.push({
      kind: 'nounList',
      penalty: thresholds.nounListWeight,
      message: `名词罗列：${text.slice(0, 40)}…`,
      fix: '罗列覆盖面等于没有观点。挑一件事说清楚它解决什么。',
    });
  }

  return { ...surface, findings };
}

/* ------------------------------------------------------------------ *
 * Run
 * ------------------------------------------------------------------ */

const targets = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
const roots = targets.length > 0 ? targets : ['content'];

const files = (
  await Promise.all(
    roots.map(async (target) => {
      try {
        return await walk(path.resolve(target));
      } catch {
        return [];
      }
    }),
  )
).flat().sort();

const results: ScoredArticle[] = (
  await Promise.all(
    files.map(async (file) => analyseArticle(path.relative(process.cwd(), file), await fs.readFile(file, 'utf8'))),
  )
)
  // A sweep over everything matches the gate and skips drafts. Naming a file
  // explicitly does not: the whole point of asking about one file is that you
  // are working on it, and refusing to score the draft you are writing is the
  // one moment the style analyser is most useful.
  .filter((result) => targets.length > 0 || !result.draft);

const DIM = '[2m';
const RESET = '[0m';
const RED = '[31m';

console.log('');
console.log(`voice: ${voice.name}${voice.locale ? ` (${voice.locale})` : ''} — site/${voice.file}`);
console.log('');

if (results.length === 0) {
  console.log('No published content to analyse.');
} else {
  for (const result of [...results].sort((a, b) => a.score - b.score)) {
    console.log(`${result.score < 60 ? RED : ''}${String(result.score).padStart(3)}${RESET}  ${result.file}`);
    for (const finding of result.findings.filter((item) => item.penalty > 0).slice(0, 6)) {
      const where = finding.line ? `:${finding.line}` : '';
      console.log(`     ${DIM}-${finding.penalty}${RESET} ${result.file}${where}  ${finding.message}`);
      console.log(`          ${DIM}fix: ${finding.fix}${RESET}`);
    }
  }
}

/* --- surfaces: only when analysing the whole site, not a single file --- */
const surfaces = targets.length > 0 ? [] : (await collectSurfaces()).map(analyseSurface);
const flaggedSurfaces = surfaces.filter((item) => item.findings.length > 0);

if (surfaces.length > 0) {
  console.log('');
  console.log(`SURFACES — ${surfaces.length} outward-facing string(s) outside article bodies`);
  if (flaggedSurfaces.length === 0) {
    console.log(`${DIM}  clean${RESET}`);
  }
  for (const surface of flaggedSurfaces) {
    console.log(`  ${surface.file}${surface.line ? `:${surface.line}` : ''}  ${surface.key}`);
    console.log(`${DIM}      shows up as: ${surface.shows}${RESET}`);
    for (const finding of surface.findings) {
      console.log(`      ${finding.message}`);
      console.log(`${DIM}      fix: ${finding.fix}${RESET}`);
    }
  }
}

const average = results.length
  ? Math.round(results.reduce((sum, item) => sum + item.score, 0) / results.length)
  : 0;

const floor = policy.style.minScore;
const below = floor === null ? [] : results.filter((result) => result.score < floor);

console.log('');
console.log(`${results.length} file(s), average ${average}${floor === null ? '' : `, floor ${floor}`}`);
if (surfaces.length > 0) {
  console.log(
    `${flaggedSurfaces.length}/${surfaces.length} surface(s) flagged — reported, never blocking.`,
  );
}
if (floor !== null && below.length > 0) {
  console.log(`${below.length} file(s) below the floor: ${below.map((item) => item.file).join(', ')}`);
}

await fs.writeFile(
  path.join(process.cwd(), 'content-report.json'),
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      voice: { name: voice.name, file: voice.file, locale: voice.locale },
      minScore: floor,
      average,
      files: results.length,
      belowFloor: below.map((item) => item.file),
      surfaces: {
        checked: surfaces.length,
        flagged: flaggedSurfaces.length,
        findings: flaggedSurfaces.map((item) => ({
          file: item.file,
          line: item.line,
          key: item.key,
          shows: item.shows,
          text: item.text,
          findings: item.findings,
        })),
      },
      results,
    },
    null,
    2,
  )}\n`,
);
console.log(`${DIM}content-report.json written${RESET}`);

// Reporting is the job; blocking is policy. Without a floor this never fails.
process.exit(floor !== null && below.length > 0 ? 1 : 0);

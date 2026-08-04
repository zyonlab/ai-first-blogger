/**
 * Task context printer.
 *
 *   pnpm context write | setup | type | status
 *
 * Prints exactly the slice of configuration a task needs, so an agent makes one
 * tool call instead of reading the whole intent layer. Reading all of `site/`
 * costs roughly 9k tokens; a single task needs one or two.
 *
 * `write` also prints something no config file contains: the list of pages that
 * exist and can be linked to. Rule C-02 requires two internal links per article,
 * and without this an agent either opens every file under content/ to find link
 * targets, or invents a URL and discovers it is dead two steps later (C-03).
 *
 * Output is plain text meant to be pasted into a prompt. `--json` returns the
 * same data structured, for anything that would rather parse it.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { siteContentTypes } from 'aifb-engine/config/content-types';
import { pages } from 'aifb-engine/config/pages';
import { policy, policyOverrides } from 'aifb-engine/config/policy';
import { site } from 'aifb-engine/config/site';
import { pillarList, seriesList, topicList, topics, series as allSeries } from 'aifb-engine/config/taxonomy';
import { voice } from 'aifb-engine/config/voice';
import { enginePath } from './paths';
import { acknowledgedAreas, blockingIssues, checkReadiness, type ReadinessIssue } from './readiness';
import { collectEntries } from './validate/collect';
import { displayWidth } from './validate/html';

const root = process.cwd();
const json = process.argv.includes('--json');
const task = process.argv.slice(2).find((arg) => !arg.startsWith('-')) ?? 'write';

/** Link targets are capped so the output stays small. Truncation is never silent. */
const MAX_LINK_TARGETS = 40;

const out: string[] = [];
const say = (line = '') => out.push(line);

async function readJson<T>(file: string): Promise<T | undefined> {
  try {
    return JSON.parse(await fs.readFile(path.join(root, file), 'utf8')) as T;
  } catch {
    return undefined;
  }
}

/* ------------------------------------------------------------------ *
 * write — everything needed to draft an article
 * ------------------------------------------------------------------ */

async function linkTargets() {
  const entries = await collectEntries();
  const articles = entries
    .map((entry) => {
      const type = entry.type;
      const route = siteContentTypes[type]?.route;
      const slug = entry.data.slug as string | undefined;
      if (!route || !slug) return undefined;
      return { url: `/${route}/${slug}/`, title: (entry.data.title as string) ?? slug };
    })
    .filter((item): item is { url: string; title: string } => item !== undefined);

  // A topic or series only gets a page once at least one published entry points
  // at it (packages/engine/lib/taxonomy.ts). Listing the whole declared vocabulary here
  // would hand the agent URLs that do not exist — the precise mistake this
  // command is meant to prevent, and one C-03 only catches two steps later.
  const used = (field: 'category' | 'series') =>
    new Set(entries.map((entry) => entry.data[field]).filter((value): value is string => typeof value === 'string'));
  const usedCategories = used('category');
  const usedSeries = used('series');

  const taxonomyPages = [
    ...topicList
      .filter((topic) => usedCategories.has(topic.slug))
      .map((topic) => ({ url: `/topics/${topic.slug}/`, title: topic.title })),
    ...seriesList
      .filter((item) => usedSeries.has(item.slug))
      .map((item) => ({ url: `/series/${item.slug}/`, title: item.title })),
  ];

  const emptyTaxonomy = [
    ...topicList.filter((topic) => !usedCategories.has(topic.slug)).map((topic) => `/topics/${topic.slug}/`),
    ...seriesList.filter((item) => !usedSeries.has(item.slug)).map((item) => `/series/${item.slug}/`),
  ];

  return { articles, taxonomyPages, emptyTaxonomy };
}

async function writeContext() {
  // Refusing here is the strongest enforcement there is: an agent that cannot
  // get the writing context cannot start writing. Discovering the site was
  // unplanned at validate time means the article already exists, written
  // against someone else's taxonomy and voice.
  const blocked = blockingIssues(await checkReadiness());
  if (blocked.length > 0) {
    say('NOT READY TO WRITE — this site is not planned yet.');
    say('');
    say(`${blocked.length} decision(s) are still the shipped defaults, across: ${[...new Set(blocked.map((i) => i.area))].join(', ')}`);
    say('Writing now means writing into someone else\'s taxonomy, voice and domain.');
    say('');
    say('Run `pnpm context setup` for the list, plan the site, then come back.');
    return { ready: false, blocked };
  }

  const { articles, taxonomyPages, emptyTaxonomy } = await linkTargets();

  say(`VOICE — ${voice.name}${voice.locale ? ` (${voice.locale})` : ''}`);
  if (voice.description) say(voice.description);
  say();
  say(voice.guidance);
  say();

  const avoided = voice.avoid.flatMap((rule) => rule.phrases ?? []);
  if (avoided.length > 0) {
    say(`AVOID (each costs points, see site/${voice.file}):`);
    say(`  ${avoided.join(' · ')}`);
    say();
  }

  say('CATEGORY — pick exactly one, anything else fails the build:');
  for (const [slug, topic] of Object.entries(topics)) {
    say(`  ${slug}${topic.listed === false ? ' (unlisted)' : ''} — ${topic.title}`);
  }
  say();

  if (Object.keys(allSeries).length > 0) {
    say('SERIES — optional, must be one of:');
    for (const [slug, item] of Object.entries(allSeries)) say(`  ${slug} — ${item.title}`);
    say();
  }

  say('CONSTRAINTS the gate enforces:');
  say(`  filename == slug (C-08)`);
  say(`  ≥ ${policy.content.minInternalLinks} distinct site-internal links in the body (C-02)`);
  say(`  no H1 in the body, no skipped heading levels (C-09)`);
  say(`  description ${policy.seo.descriptionMinWidth}-${policy.seo.descriptionMaxWidth} display columns (C-06)`);
  // Give the budget, not the formula: the suffix the layout appends is not
  // visible from the frontmatter, and its width is what actually constrains
  // the title an author is free to write.
  const suffix = site.titleTemplate.replace('{title}', '').replace('{name}', site.name);
  const budget = policy.seo.titleMaxWidth - displayWidth(suffix);
  say(
    suffix
      ? `  title ≤ ${budget} display columns — the layout appends "${suffix}" (${displayWidth(suffix)} of the ${policy.seo.titleMaxWidth}) (C-05)`
      : `  title ≤ ${policy.seo.titleMaxWidth} display columns; this site appends no suffix (C-05)`,
  );
  if (policy.style.minScore !== null) say(`  style score ≥ ${policy.style.minScore} (pnpm analyze)`);
  say(`  set draft: true while unfinished — drafts are neither built nor gated`);
  say();

  say(`LINK TARGETS — use ≥ ${policy.content.minInternalLinks} of these, do not invent URLs:`);
  const shown = articles.slice(0, MAX_LINK_TARGETS);
  for (const item of shown) say(`  ${item.url}  ${item.title}`);
  if (articles.length > shown.length) {
    say(`  … and ${articles.length - shown.length} more articles (run with --json for all)`);
  }
  for (const item of taxonomyPages) say(`  ${item.url}  ${item.title}`);
  if (articles.length === 0 && taxonomyPages.length === 0) {
    say('  (nothing to link to yet — the first article cannot satisfy C-02;');
    say(`   write two, or lower content.minInternalLinks in site/policy.yaml)`);
  }
  if (emptyTaxonomy.length > 0) {
    say();
    say('NOT LINKABLE YET — declared but with no published entry, so no page is built:');
    say(`  ${emptyTaxonomy.join(' ')}`);
  }
  say();
  say(`WRITE TO: content/<type>/<slug>.mdx — types: ${Object.keys(siteContentTypes).join(', ')}`);
  say('THEN: pnpm build && pnpm validate && pnpm analyze');

  return { voice, categories: Object.keys(topics), series: Object.keys(allSeries), policy, articles, taxonomyPages, emptyTaxonomy };
}

/* ------------------------------------------------------------------ *
 * setup — brand values, and what is still shipped placeholder
 * ------------------------------------------------------------------ */


async function setupContext() {
  const readiness = await checkReadiness();

  let workflow = '';
  try {
    workflow = await fs.readFile(path.join(root, '.github/workflows/cloudflare-pages.yml'), 'utf8');
  } catch {
    /* the workflow is optional */
  }

  say('CURRENT BRAND — site/site.yaml');
  say(`  name        ${site.name}`);
  say(`  title       ${site.title}`);
  say(`  url         ${site.url}`);
  say(`  locale      ${site.locale}`);
  say(`  author      ${site.author.name} <${site.author.email}> — ${site.author.title}`);
  say(`  theme       ${site.theme.name} (default ${site.theme.defaultMode})`);
  say();

  say('TAXONOMY — site/taxonomy.yaml');
  say(`  pillars  ${pillarList.map((p) => p.slug).join(', ') || '(none)'}`);
  say(`  topics   ${Object.keys(topics).join(', ')}`);
  say(`  series   ${Object.keys(allSeries).join(', ') || '(none)'}`);
  say();

  say('STATIC PAGE COPY — site/pages.yaml');
  say(`  about ${pages.about.sections.length} sections · uses ${pages.uses.items.length} items · work-with-me ${pages.workWithMe.services.length} services`);
  say();

  const acknowledged = acknowledgedAreas();
  const blocked = blockingIssues(readiness);
  const notes = readiness.filter((issue) => issue.severity === 'warn');

  if (blocked.length > 0) {
    say(`PLANNING — ${blocked.length} decision(s) block the pipeline:`);
    let area = '';
    for (const item of blocked) {
      if (item.area !== area) {
        area = item.area;
        say(`  [${area}]`);
      }
      say(`    ${item.key}`);
      say(`      ${item.message}`);
      say(`      fix: ${item.fix}`);
    }
    say();
  } else {
    say('PLANNING — complete. The content pipeline will run.');
    say();
  }

  if (notes.length > 0) {
    say(`NOTES — ${notes.length} non-blocking:`);
    for (const item of notes) say(`  ${item.key} — ${item.message}`);
    say();
  }
  if (acknowledged.size > 0) {
    say(`ACKNOWLEDGED — deliberately keeping defaults for: ${[...acknowledged].join(', ')}`);
    say('  (declared in site/policy.yaml → planning.acknowledged)');
    say();
  }

  say('Content is empty, so changing topic keys is free right now — after a few');
  say('dozen articles every `category` in their frontmatter has to change too.');

  return { site, readiness, taxonomy: { pillars: pillarList, topics, series: allSeries } };
}

/* ------------------------------------------------------------------ *
 * type — adding or changing a content type
 * ------------------------------------------------------------------ */

const RESERVED_ROUTES = ['topics', 'series', 'about', 'uses', 'newsletter', 'work-with-me', 'rss.xml', 'robots.txt', 'llms.txt'];

async function typeContext() {
  say('A content type is two halves. Both must exist or the build fails naming the missing side.');
  say('  site/content-types.yaml         route, label, list copy, surfaces   (yours)');
  say('  packages/engine/content-types/<name>.ts  schema, JSON-LD, card + detail      (engine)');
  say();

  say('EXISTING TYPES:');
  for (const [name, def] of Object.entries(siteContentTypes)) {
    const surfaces = Object.entries(def.surfaces ?? {})
      .map(([key, value]) => (typeof value === 'object' ? `${key}(${JSON.stringify(value)})` : `${key}=${value}`))
      .join(' ');
    say(`  ${name}  →  /${def.route}/  "${def.listTitle}"`);
    say(`    surfaces: ${surfaces || '(none — its pages would be orphans, C-04)'}`);
  }
  say();

  // Through the package, not through `packages/engine`: an installed site has
  // these under node_modules, where the joined path found nothing and the two
  // lists printed empty — telling an agent there is nothing to reuse.
  const cards = await fs.readdir(enginePath('components/cards')).catch(() => []);
  const details = await fs.readdir(enginePath('components/details')).catch(() => []);
  say(`REUSABLE CARDS:   ${cards.filter((f) => f.endsWith('.astro')).map((f) => f.replace('.astro', '')).join(', ')}`);
  say(`REUSABLE DETAILS: ${details.filter((f) => f.endsWith('.astro')).map((f) => f.replace('.astro', '')).join(', ')}`);
  say('  Reuse a pair when the shape fits. Writing a new one is design work, not boilerplate.');
  say();

  say(`RESERVED ROUTES (a type may not claim these): ${RESERVED_ROUTES.join(', ')}`);
  say('Walkthrough: docs/recipes/add-content-type.md');

  return { types: siteContentTypes, cards, details, reserved: RESERVED_ROUTES };
}

/* ------------------------------------------------------------------ *
 * status — one to-do list from every report
 * ------------------------------------------------------------------ */

type Violation = { rule: string; severity: string; file: string; line?: number; message: string; fix: string };
type ValidateReport = { generatedAt: string; errors: number; warnings: number; rulesRun: number; rulesTotal: number; rulesSkipped: string[]; contentFiles: number; draftsSkipped?: number; violations: Violation[] };
type Finding = { line?: number; penalty: number; message: string; fix: string };
type ContentReport = { generatedAt: string; average: number; files: number; minScore: number | null; belowFloor: string[]; results: { file: string; score: number; findings: Finding[] }[] };

/** Newest modification time under the inputs a report depends on. */
async function newestMtime(dirs: string[]) {
  let newest = 0;
  const walk = async (dir: string) => {
    let items: import('node:fs').Dirent[];
    try {
      items = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of items) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) await walk(full);
      else {
        const stat = await fs.stat(full).catch(() => undefined);
        if (stat && stat.mtimeMs > newest) newest = stat.mtimeMs;
      }
    }
  };
  for (const dir of dirs) await walk(path.join(root, dir));
  return newest;
}

async function statusContext() {
  const validate = await readJson<ValidateReport>('validate-report.json');
  const content = await readJson<ContentReport>('content-report.json');
  const inputs = await newestMtime(['content', 'site']);

  const freshness = (report?: { generatedAt: string }, name = '') => {
    if (!report) return `${name}: never run`;
    const age = new Date(report.generatedAt).getTime();
    return age < inputs ? `${name}: STALE — content or site/ changed since it ran` : `${name}: current`;
  };

  const readiness = await checkReadiness();
  const blocked = blockingIssues(readiness);
  say('PLANNING');
  say(
    blocked.length === 0
      ? '  complete — the content pipeline runs'
      : `  ${blocked.length} decision(s) unmade across ${[...new Set(blocked.map((i) => i.area))].join(', ')} — the pipeline will not run`,
  );
  say();

  say('FRESHNESS');
  say(`  ${freshness(validate, 'validate-report.json')}`);
  say(`  ${freshness(content, 'content-report.json')}`);
  say('  A stale report is not evidence. Re-run: pnpm build && pnpm validate && pnpm analyze');
  say();

  const overrides = policyOverrides();
  say('POLICY');
  say(
    Object.keys(overrides).length === 0
      ? '  all engine defaults'
      : `  overridden: ${Object.entries(overrides).map(([key, value]) => `${key}=${value}`).join(', ')}`,
  );
  say();

  if (validate) {
    say(`GATE — ${validate.errors} error(s), ${validate.warnings} warning(s), ${validate.rulesRun}/${validate.rulesTotal} rules run`);
    if (validate.rulesSkipped.length > 0) say(`  skipped (needs dist/): ${validate.rulesSkipped.join(', ')}`);
    if (validate.contentFiles === 0) say('  0 content files — every content rule passed vacuously, which proves nothing');
    if (validate.draftsSkipped) say(`  ${validate.draftsSkipped} draft(s) not checked`);
    const ordered = [...validate.violations].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1));
    for (const item of ordered.slice(0, 20)) {
      say(`  [${item.severity}] ${item.rule} ${item.file}${item.line ? `:${item.line}` : ''}`);
      say(`      ${item.message}`);
      say(`      fix: ${item.fix}`);
    }
    if (ordered.length > 20) say(`  … and ${ordered.length - 20} more in validate-report.json`);
    say();
  }

  if (content && content.files > 0) {
    say(`STYLE — ${content.files} file(s), average ${content.average}${content.minScore === null ? ' (no floor set, never blocks)' : `, floor ${content.minScore}`}`);
    for (const result of [...content.results].sort((a, b) => a.score - b.score).slice(0, 5)) {
      say(`  ${result.score}  ${result.file}`);
      for (const finding of result.findings.filter((f) => f.penalty > 0).slice(0, 3)) {
        say(`      -${finding.penalty} ${finding.message}`);
        say(`      fix: ${finding.fix}`);
      }
    }
    say();
  }

  const blocking = validate?.errors ?? 0;
  say(blocking > 0 ? `NEXT: clear ${blocking} error(s) above — they block the deploy.` : 'NEXT: nothing blocking.');

  return { validate, content, overrides, readiness, stale: { validate: validate && new Date(validate.generatedAt).getTime() < inputs } };
}

/* ------------------------------------------------------------------ *
 * Run
 * ------------------------------------------------------------------ */

const tasks: Record<string, () => Promise<unknown>> = {
  write: writeContext,
  setup: setupContext,
  type: typeContext,
  status: statusContext,
};

const run = tasks[task];
if (!run) {
  console.error(`Unknown task "${task}". Available: ${Object.keys(tasks).join(', ')}`);
  process.exit(1);
}

const data = await run();
if (json) console.log(JSON.stringify(data, null, 2));
else console.log(out.join('\n'));

/**
 * Framework health metrics.
 *
 *   pnpm metrics
 *
 * Writes metrics.json and appends a line to metrics-history.jsonl so the
 * numbers can be trended across commits. Every metric is defined in
 * docs/specs/metrics.md together with its target.
 *
 * These measure whether this repo is still a *framework* — reusable by someone
 * who is not its author — rather than whether the site looks nice.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { siteContentTypes } from 'aifb-engine/config/content-types';
import { policy } from 'aifb-engine/config/policy';
import { site } from 'aifb-engine/config/site';
import { collectEntries } from './validate/collect';

const root = process.cwd();

/**
 * Source trees that must stay brand-neutral and locale-neutral: the mechanism
 * plane. Everything a site owner is expected to edit lives in site/, which is
 * YAML and Markdown and therefore cannot appear here at all — the three-plane
 * split is what makes this metric cheap to define.
 */
const NEUTRAL_DIRS = ['packages/engine/components', 'packages/engine/pages', 'packages/engine/layouts', 'packages/engine/lib', 'packages/engine/config'];

async function walk(dir: string, match: (file: string) => boolean): Promise<string[]> {
  let out: string[] = [];
  let items: import('node:fs').Dirent[];
  try {
    items = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const item of items) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) out = out.concat(await walk(full, match));
    else if (match(full)) out.push(full);
  }
  return out;
}

const isSource = (file: string) => /\.(astro|ts|tsx)$/.test(file);

/* ------------------------------------------------------------------ *
 * T1 — how much of the codebase a new owner must edit
 * ------------------------------------------------------------------ */

const CJK = /[一-鿿]/;
const LOCALE_LITERAL = /['"](?:zh|en|ja|ko|fr|de|es|pt|ru)-[A-Z]{2}['"]|zh_CN/;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Brand strings to hunt for, taken from the site's own intent layer rather than
 * written here. Hardcoding them would mean this metric keeps checking for the
 * *template author's* brand: every fork would score a perfect 0 while its own
 * brand strings sat un-detected in engine code.
 */
async function brandPattern(): Promise<RegExp | undefined> {
  const literals = new Set<string>();
  const add = (value?: string) => {
    const trimmed = value?.trim();
    // Two characters or fewer matches half the codebase; skip it.
    if (trimmed && trimmed.length > 2) literals.add(trimmed);
  };

  add(site.name);
  add(site.author.email);
  try {
    add(new URL(site.url).host);
  } catch {
    /* an unusable url already failed the config loader */
  }
  // The package name doubles as the repo/template identifier.
  try {
    const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')) as { name?: string };
    add(pkg.name);
  } catch {
    /* package.json is optional for this check */
  }

  if (literals.size === 0) return undefined;
  return new RegExp([...literals].map(escapeRegExp).join('|'), 'i');
}

const BRAND_LITERAL = await brandPattern();

async function measureNeutrality() {
  const offenders: { file: string; reasons: string[] }[] = [];

  for (const dir of NEUTRAL_DIRS) {
    for (const file of await walk(path.join(root, dir), isSource)) {
      const rel = path.relative(root, file);
      const text = await fs.readFile(file, 'utf8');
      // Strip comments — documentation may legitimately mention these strings.
      const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      const reasons: string[] = [];
      if (CJK.test(code)) reasons.push('hardcoded CJK copy');
      if (LOCALE_LITERAL.test(code)) reasons.push('hardcoded locale');
      if (BRAND_LITERAL?.test(code)) reasons.push('hardcoded brand string');
      if (reasons.length > 0) offenders.push({ file: rel, reasons });
    }
  }
  return offenders;
}

/* ------------------------------------------------------------------ *
 * T2 — how coupled the codebase is to specific content types
 * ------------------------------------------------------------------ */

async function measureTypeCoupling(typeNames: string[]) {
  const offenders: { file: string; type: string }[] = [];

  for (const dir of NEUTRAL_DIRS) {
    for (const file of await walk(path.join(root, dir), isSource)) {
      const rel = path.relative(root, file);
      const text = (await fs.readFile(file, 'utf8'))
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');

      for (const name of typeNames) {
        // A literal collection name outside the registry means the surface is
        // hand-wired to that type and will not pick up a new one.
        const pattern = new RegExp(`getCollection\\(['"]${name}['"]|getEntries\\(['"]${name}['"]`);
        if (pattern.test(text)) offenders.push({ file: rel, type: name });
      }
    }
  }
  return offenders;
}

/* ------------------------------------------------------------------ *
 * Content metrics
 * ------------------------------------------------------------------ */

const internalLink = /\]\((\/[^)\s]*)\)/g;

async function readJson<T>(file: string): Promise<T | undefined> {
  try {
    return JSON.parse(await fs.readFile(path.join(root, file), 'utf8')) as T;
  } catch {
    return undefined;
  }
}

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

const entries = await collectEntries();
// Read the declared types from site/content-types.yaml rather than by grepping
// source. The registry itself cannot be imported here: packages/engine/content-types/*.ts
// pull in `astro:content`, which only resolves inside an Astro build. The two
// halves are checked against each other at build time, so the yaml keys are the
// authoritative list either way.
const typeNames = Object.keys(siteContentTypes);

const neutrality = await measureNeutrality();
const coupling = await measureTypeCoupling(typeNames);

const linkCounts = entries.map((entry) => new Set([...entry.body.matchAll(internalLink)].map((m) => m[1])).size);
const avgLinks = linkCounts.length > 0 ? linkCounts.reduce((a, b) => a + b, 0) / linkCounts.length : 0;

type ValidateReport = { errors: number; warnings: number; rulesRun: number; rulesTotal: number; violations: { rule: string }[] };
const validate = await readJson<ValidateReport>('validate-report.json');
const orphans = validate?.violations.filter((v) => v.rule === 'C-04').length;

const llmsCovered = Object.values(siteContentTypes).filter((type) => type.surfaces?.llms !== undefined).length;

const metrics = {
  generatedAt: new Date().toISOString(),

  t1_reuse: {
    label: 'Files outside config that a new owner must edit',
    value: neutrality.length,
    target: 0,
    pass: neutrality.length === 0,
    offenders: neutrality,
  },
  t2_extensibility: {
    label: 'Surfaces hand-wired to a specific content type',
    value: coupling.length,
    target: 0,
    pass: coupling.length === 0,
    offenders: coupling,
    contentTypes: typeNames.length,
    registryDriven: true,
  },
  t3_gate: {
    label: 'Validation rules enforced',
    rulesRun: validate?.rulesRun ?? 0,
    rulesTotal: validate?.rulesTotal ?? 0,
    errors: validate?.errors ?? null,
    warnings: validate?.warnings ?? null,
    pass: validate !== undefined && validate.errors === 0,
  },

  content: {
    files: entries.length,
    avgInternalLinks: Number(avgLinks.toFixed(2)),
    avgInternalLinksTarget: 3,
    minInternalLinks: linkCounts.length > 0 ? Math.min(...linkCounts) : 0,
    orphanPages: orphans ?? null,
  },

  geo: {
    label: 'Content types exposed in llms.txt',
    covered: llmsCovered,
    total: typeNames.length,
    coverage: typeNames.length > 0 ? Number((llmsCovered / typeNames.length).toFixed(2)) : 0,
  },
};

await fs.writeFile(path.join(root, 'metrics.json'), `${JSON.stringify(metrics, null, 2)}\n`);
await fs.appendFile(path.join(root, 'metrics-history.jsonl'), `${JSON.stringify(metrics)}\n`);

const mark = (ok: boolean) => (ok ? '✓' : '✗');
// A content metric over zero entries is neither a pass nor a failure. Marking
// it ✗ makes a fresh fork look broken on its first run, which is worse than
// saying there is nothing to measure yet.
const NA = '–';
const hasContent = metrics.content.files > 0;
console.log('');
console.log(`${mark(metrics.t1_reuse.pass)} T1 reuse            ${metrics.t1_reuse.value} file(s) block a rebrand (target 0)`);
for (const item of neutrality) console.log(`    ${item.file} — ${item.reasons.join(', ')}`);
console.log(`${mark(metrics.t2_extensibility.pass)} T2 extensibility   ${metrics.t2_extensibility.value} hand-wired surface(s) across ${typeNames.length} content types (target 0)`);
for (const item of coupling) console.log(`    ${item.file} — hardcoded "${item.type}"`);
console.log(`${mark(metrics.t3_gate.pass)} T3 gate            ${metrics.t3_gate.rulesRun}/${metrics.t3_gate.rulesTotal} rules run, ${metrics.t3_gate.errors ?? '?'} error(s)`);
console.log(
  hasContent
    ? `${mark(metrics.content.avgInternalLinks >= 3)} internal links     ${metrics.content.avgInternalLinks} avg per entry (target ≥3, min ${metrics.content.minInternalLinks})`
    : `${NA} internal links     no content yet (target ≥3 once you publish)`,
);
console.log(
  hasContent
    ? `${mark(metrics.content.orphanPages === 0)} orphan pages       ${metrics.content.orphanPages ?? '?'} (target 0)`
    : `${NA} orphan pages       no content yet (target 0)`,
);
console.log(`${mark(metrics.geo.coverage === 1)} GEO coverage       ${metrics.geo.covered}/${metrics.geo.total} content types in llms.txt`);
console.log('');
console.log('Written to metrics.json and appended to metrics-history.jsonl');

/**
 * Content and SEO gate.
 *
 *   pnpm validate            # run every rule, exit 1 on any error
 *   pnpm validate --warn-ok  # report warnings but do not fail on them (default)
 *   pnpm validate --strict   # treat warnings as errors
 *
 * Rules that inspect built HTML need `pnpm build` to have run first; they are
 * skipped with a notice when dist/ is missing.
 *
 * The contract each rule implements is documented in docs/specs/content-contract.md.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { site } from 'aifb-engine/config/site';
import { acknowledgedAreas, blockingIssues, checkReadiness } from '../readiness';
import { collectEntries, collectPages, hasBuild } from './collect';
import { contentRules } from './rules/content';
import { linkRules } from './rules/links';
import { sourceLinkRules } from './rules/links-source';
import { onPageRules } from './rules/onpage';
import { qualityRules } from './rules/quality';
import { seoRules } from './rules/seo';
import { typographyRules } from './rules/typography';
import { themeRules } from './rules/theme';
import type { Rule, RuleContext, Violation } from './types';

const RESET = '\u001b[0m';
const RED = '\u001b[31m';
const YELLOW = '\u001b[33m';
const DIM = '\u001b[2m';

const rules: Rule[] = [...contentRules, ...seoRules, ...linkRules, ...themeRules, ...onPageRules, ...typographyRules, ...sourceLinkRules, ...qualityRules].sort((a, b) => a.id.localeCompare(b.id));

const strict = process.argv.includes('--strict');
// The origin comes from the site's own config, which already honours
// PUBLIC_SITE_URL. Hardcoding a fallback here meant C-07 measured every page
// against the *template's* domain: a fork that set its own url — and did
// nothing wrong — saw every page reported as a cross-origin canonical.
const siteOrigin = new URL(site.url).origin;

/* ---------------------------------------------------------------- *
 * Planning preflight. The gate answers "is this article publishable";
 * it cannot answer "is there a site to publish it into". Running the
 * content rules against an unplanned site checks rules that mean
 * nothing, so this stops the pipeline instead of adding violations.
 * ---------------------------------------------------------------- */

const readiness = await checkReadiness();
const blocking = blockingIssues(readiness);
const acknowledged = acknowledgedAreas();

if (blocking.length > 0) {
  const byArea = new Map<string, typeof blocking>();
  for (const issue of blocking) byArea.set(issue.area, [...(byArea.get(issue.area) ?? []), issue]);

  console.log('');
  console.log(`${RED}This site is not planned yet — the content pipeline will not run.${RESET}`);
  console.log(`${DIM}Publishing into an unplanned site is not a content defect; it is doing the steps out of order.${RESET}`);
  console.log('');

  for (const [area, items] of byArea) {
    console.log(`${RED}${area}${RESET} — ${items.length} decision(s) still unmade`);
    for (const item of items) {
      console.log(`  ${item.key}`);
      console.log(`    ${item.message}`);
      console.log(`    ${DIM}fix: ${item.fix}${RESET}`);
    }
    console.log('');
  }

  const warnings = readiness.filter((issue) => issue.severity === 'warn');
  if (warnings.length > 0) {
    console.log(`${YELLOW}${warnings.length} non-blocking planning note(s):${RESET}`);
    for (const item of warnings) console.log(`  ${DIM}${item.key} — ${item.message}${RESET}`);
    console.log('');
  }

  console.log(`${DIM}Run \`pnpm context setup\` for the current values. Deliberately keeping a`);
  console.log(`default? List its area in planning.acknowledged in site/policy.yaml.${RESET}`);

  await fs.writeFile(
    path.join(process.cwd(), 'validate-report.json'),
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        siteOrigin,
        planned: false,
        readiness,
        acknowledged: [...acknowledged],
        rulesTotal: rules.length,
        rulesRun: 0,
        rulesSkipped: rules.map((rule) => rule.id),
        errors: blocking.length,
        warnings: 0,
        violations: [],
      },
      null,
      2,
    )}\n`,
  );
  console.log(`${DIM}Report written to validate-report.json${RESET}`);
  process.exit(1);
}

const built = await hasBuild();

// Drafts are collected only to be counted. They never produce a page, so the
// publishability rules do not apply to them — an unfinished file must not be
// able to block the deploy of everything else.
const allEntries = await collectEntries({ includeDrafts: true });
const entries = allEntries.filter((entry) => entry.data.draft !== true);
const drafts = allEntries.length - entries.length;

const ctx: RuleContext = {
  entries,
  pages: built ? await collectPages() : [],
  hasBuild: built,
  siteOrigin,
};

const violations: Violation[] = [];
const skipped: string[] = [];

for (const rule of rules) {
  if (rule.needsBuild && !ctx.hasBuild) {
    skipped.push(rule.id);
    continue;
  }
  violations.push(...(await rule.run(ctx)));
}

const errors = violations.filter((item) => item.severity === 'error');
const warnings = violations.filter((item) => item.severity === 'warn');

/* ---------------------------------------------------------------- *
 * Report
 * ---------------------------------------------------------------- */

const byRule = new Map<string, Violation[]>();
for (const item of violations) {
  byRule.set(item.rule, [...(byRule.get(item.rule) ?? []), item]);
}

console.log('');
for (const rule of rules) {
  const found = byRule.get(rule.id) ?? [];
  if (found.length === 0) continue;

  const colour = rule.severity === 'error' ? RED : YELLOW;
  console.log(`${colour}${rule.id} ${rule.title}${RESET} — ${found.length} issue(s)`);
  for (const item of found.slice(0, 10)) {
    const where = item.line ? `${item.file}:${item.line}` : item.file;
    console.log(`  ${where}`);
    console.log(`    ${item.message}`);
    console.log(`    ${DIM}fix: ${item.fix}${RESET}`);
  }
  if (found.length > 10) console.log(`  ${DIM}… and ${found.length - 10} more (see validate-report.json)${RESET}`);
  console.log('');
}

if (skipped.length > 0) {
  console.log(`${DIM}Skipped (needs dist/, run pnpm build first): ${skipped.join(', ')}${RESET}\n`);
}

if (drafts > 0) {
  console.log(`${DIM}Drafts not checked (draft: true never builds): ${drafts}${RESET}\n`);
}

// A run over zero content files is not a pass — every content rule was
// vacuously satisfied. Say so, for the same reason a skipped rule is not a
// passed rule.
if (ctx.entries.length === 0) {
  console.log(`${YELLOW}No publishable content found under content/.${RESET}`);
  console.log(`${DIM}Content rules had nothing to check — this run says nothing about content quality.${RESET}\n`);
}

const checkedRules = rules.length - skipped.length;
console.log(
  `Checked ${ctx.entries.length} content file(s) and ${ctx.pages.length} built page(s) against ${checkedRules}/${rules.length} rules.`,
);
console.log(`${errors.length} error(s), ${warnings.length} warning(s).`);

const report = {
  generatedAt: new Date().toISOString(),
  siteOrigin,
  planned: true,
  readiness: readiness.filter((issue) => issue.severity === 'warn' || acknowledged.has(issue.area)),
  acknowledged: [...acknowledged],
  rulesTotal: rules.length,
  rulesRun: checkedRules,
  rulesSkipped: skipped,
  contentFiles: ctx.entries.length,
  draftsSkipped: drafts,
  builtPages: ctx.pages.length,
  errors: errors.length,
  warnings: warnings.length,
  violations,
};

const reportPath = path.join(process.cwd(), 'validate-report.json');
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`${DIM}Report written to validate-report.json${RESET}`);

const failed = errors.length > 0 || (strict && warnings.length > 0);
process.exit(failed ? 1 : 0);

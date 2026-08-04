/**
 * Release preconditions.
 *
 *   node tools/check-release.mjs           # invariants only
 *   node tools/check-release.mjs v0.2.0    # also: the tag matches the packages
 *
 * This repository has a double identity: it is the workspace that builds the
 * three packages, *and* a site that consumes them. The site resolves them
 * through workspace links, so it exercises whatever is on disk — never what is
 * on npm. Nothing in `pnpm build` or `pnpm test:scenarios` can notice that the
 * published `aifb-engine` is three commits behind.
 *
 * These checks are the part a person would otherwise have to remember.
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = process.cwd();
const PACKAGES = ['engine', 'cli', 'create'];

const problems = [];
const notes = [];

const manifests = Object.fromEntries(
  await Promise.all(
    PACKAGES.map(async (dir) => [
      dir,
      JSON.parse(await fs.readFile(path.join(root, 'packages', dir, 'package.json'), 'utf8')),
    ]),
  ),
);

/* ---------------------------------------------------------------- *
 * 1. One version across the set
 * ---------------------------------------------------------------- */

const versions = new Set(Object.values(manifests).map((m) => m.version));
if (versions.size !== 1) {
  problems.push(
    `The packages are on different versions: ${Object.values(manifests)
      .map((m) => `${m.name}@${m.version}`)
      .join(', ')}.\n` +
      '  They release as a set — create-aifb pins the other two at its own version, so a\n' +
      '  scaffolded site would ask for a version that was never published.',
  );
}
const version = manifests.engine.version;

/* ---------------------------------------------------------------- *
 * 2. Nothing publishable is marked private, and metadata is real
 * ---------------------------------------------------------------- */

for (const manifest of Object.values(manifests)) {
  if (manifest.private) problems.push(`${manifest.name} is marked private and cannot be published.`);
  for (const field of ['author', 'license', 'repository', 'files']) {
    if (!manifest[field]) problems.push(`${manifest.name} is missing "${field}".`);
  }
  // The product refuses to publish a site full of placeholders. It should hold
  // itself to that: `author: "Your Name"` has shipped to npm before.
  const text = JSON.stringify(manifest);
  for (const placeholder of ['Your Name', 'TODO', 'REPLACE_ME', 'example.com']) {
    if (text.includes(placeholder)) problems.push(`${manifest.name} still contains the placeholder "${placeholder}".`);
  }
}

/* ---------------------------------------------------------------- *
 * 3. What is on npm, and whether this working tree is ahead of it
 * ---------------------------------------------------------------- */

for (const manifest of Object.values(manifests)) {
  let published;
  try {
    const { stdout } = await run('npm', ['view', `${manifest.name}@${manifest.version}`, 'version'], {
      timeout: 30_000,
    });
    published = stdout.trim();
  } catch {
    published = undefined; // 404: this version is not on npm yet
  }

  if (published) {
    notes.push(`${manifest.name}@${manifest.version} is already published.`);
  } else {
    notes.push(`${manifest.name}@${manifest.version} is NOT yet on npm — \`pnpm publish -r\` would publish it.`);
  }
}

/* ---------------------------------------------------------------- *
 * 4. Changes since the last release tag
 * ---------------------------------------------------------------- */

try {
  const { stdout: tag } = await run('git', ['describe', '--tags', '--abbrev=0', '--match', 'v*']);
  const last = tag.trim();
  const { stdout: changed } = await run('git', ['diff', '--name-only', `${last}..HEAD`, '--', 'packages']);
  const files = changed.split('\n').filter(Boolean);

  if (files.length > 0 && `v${version}` === last) {
    problems.push(
      `${files.length} file(s) under packages/ changed since ${last}, but the version is still ${version}.\n` +
        '  The workspace site would not notice — it links to the source. Anyone installing from\n' +
        '  npm gets the old code. Bump the version in all three packages.',
    );
  }
} catch {
  notes.push('No release tag yet — skipping the "changed since last release" check.');
}

/* ---------------------------------------------------------------- *
 * 5. What a scaffolded site actually receives
 * ---------------------------------------------------------------- *
 *
 * `create-aifb`'s template is generated from this repository at build time, so
 * it cannot drift from what is here — but it can still be missing something
 * nobody remembered to add. It was: `.ai/skills/`, `prompts/` and `AGENTS.md`
 * shipped nowhere for three versions. A scaffolded site had `pnpm context` in
 * its package.json and nothing that mentioned the command existed.
 *
 * That is the difference between this product and an Astro theme, so it gets a
 * release precondition rather than a line in a checklist.
 */

const REQUIRED_IN_TEMPLATE = [
  ['AGENTS.md', 'the plane boundary and what to run before claiming done'],
  ['.ai/skills/ai-first-blogger/SKILL.md', 'the skill an agent loads for this framework'],
  ['prompts', 'one prompt per task — intake, plan, brief, audit, deploy'],
  ['skeleton', 'the intent layer, TODOs and all'],
  ['examples', 'the reference sites `--example` offers'],
];

const template = path.join(root, 'packages/create/template');
for (const [entry, why] of REQUIRED_IN_TEMPLATE) {
  const exists = await fs.access(path.join(template, entry)).then(() => true).catch(() => false);
  if (!exists) {
    problems.push(
      `create-aifb's template has no "${entry}" — ${why}.\n` +
        '  Run `pnpm --filter create-aifb build` first; if it is still missing, packages/create/build.mjs\n' +
        '  does not copy it and every scaffolded site ships without it.',
    );
  }
}

// The two-audience files are stripped of repo-only sections on the way out. A
// leftover fence means the strip did not run and the site is being told to run
// `pnpm test:scenarios` against packages it does not have.
for (const file of ['AGENTS.md', '.ai/skills/ai-first-blogger/SKILL.md']) {
  const text = await fs.readFile(path.join(template, file), 'utf8').catch(() => '');
  if (text.includes('repo-only')) {
    problems.push(`create-aifb's ${file} still contains a repo-only fence — the strip in build.mjs did not run.`);
  }
}

// The framework's own `.github` must not travel. `release.yml` publishes npm
// packages a site does not have, and the issue forms would point the site's
// visitors at this repository's bug tracker from theirs. Neither errors at
// scaffold time; both are wrong the first time they run, somewhere nobody here
// can see.
const FORBIDDEN_IN_TEMPLATE = ['.github/workflows/release.yml', '.github/workflows/ci.yml', '.github/ISSUE_TEMPLATE'];
for (const entry of FORBIDDEN_IN_TEMPLATE) {
  const leaked = await fs.access(path.join(template, entry)).then(() => true).catch(() => false);
  if (leaked) {
    problems.push(
      `create-aifb's template carries "${entry}", which belongs to this repository, not to a site.\n` +
        '  packages/create/build.mjs copies an allowlist from .github — add nothing to it that\n' +
        '  a scaffolded site would not run itself.',
    );
  }
}

/* ---------------------------------------------------------------- *
 * 6. A tag, if one was given, must match
 * ---------------------------------------------------------------- */

const expected = process.argv[2];
if (expected) {
  const wanted = expected.replace(/^v/, '');
  if (wanted !== version) {
    problems.push(`Tag ${expected} does not match the package version ${version}.`);
  }
}

/* ---------------------------------------------------------------- *
 * Report
 * ---------------------------------------------------------------- */

console.log('');
for (const note of notes) console.log(`  ${note}`);
console.log('');

if (problems.length > 0) {
  for (const problem of problems) console.log(`✗ ${problem}`);
  console.log(`\n${problems.length} problem(s) block a release.`);
  process.exit(1);
}

console.log(`✓ Release checks pass for ${version}.`);

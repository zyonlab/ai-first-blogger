/**
 * Bundle the scaffold, and **generate** its template from the repository.
 *
 * `template/` used to be a hand-made copy of `site/`, `examples/`, `public/`
 * and the config files. It drifted the first time it could: a new example was
 * added to `examples/` and `create-aifb --example <it>` answered "no such
 * example", because nothing connected the two.
 *
 * Copying at build time means the published package always carries what the
 * repository has, and "remember to sync the template" stops being a rule anyone
 * has to follow.
 */
import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';

const repo = path.resolve('../..');
const template = 'template';

const copy = async (from, to) => {
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.cp(from, to, { recursive: true });
};

await fs.rm(template, { recursive: true, force: true });
await fs.rm('dist', { recursive: true, force: true });

/* The skeleton: the intent layer as it ships, TODOs and all. */
for (const file of ['site.yaml', 'taxonomy.yaml', 'content-types.yaml', 'policy.yaml', 'pages.yaml', 'redirects.yaml', 'voice.md']) {
  await copy(path.join(repo, 'site', file), path.join(template, 'skeleton', file));
}

/* Baseline themes. An example that needs another one carries it itself. */
await copy(path.join(repo, 'site/themes'), path.join(template, 'themes'));

/* Every example, whatever they are today. */
const examples = (await fs.readdir(path.join(repo, 'examples'), { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

for (const name of examples) {
  for (const part of ['site', 'content', 'public']) {
    const from = path.join(repo, 'examples', name, part);
    if (await fs.access(from).then(() => true).catch(() => false)) {
      await copy(from, path.join(template, 'examples', name, part));
    }
  }
}

/* The rest of what a site owns. */
for (const file of ['astro.config.mjs', '.env.example', 'src/content.config.ts']) {
  await copy(path.join(repo, file), path.join(template, file));
}
await copy(path.join(repo, 'public'), path.join(template, 'public'));

/**
 * From `.github`, only what a *site* needs.
 *
 * This used to copy the directory whole, which handed every scaffolded site two
 * things that belong to the framework:
 *
 *   release.yml            runs `pnpm test:scenarios` and `pnpm publish -r`
 *                          against packages the site does not have — red on the
 *                          first `v*` tag anyone pushes
 *   ISSUE_TEMPLATE/        asks the site's own visitors to report bugs in this
 *                          framework, on the wrong repository
 *
 * Neither errors at scaffold time. Both are wrong the first time they run, in
 * someone else's repository, where nobody here would ever see it.
 */
const SITE_GITHUB_FILES = ['workflows/cloudflare-pages.yml'];
for (const file of SITE_GITHUB_FILES) {
  await copy(path.join(repo, '.github', file), path.join(template, '.github', file));
}

/**
 * The agent operating contract.
 *
 * This is the half of the product that makes it AI-first rather than "another
 * Astro theme": the boundary between the planes, `pnpm context` instead of
 * reading 9k tokens of YAML, one prompt per task, and the guardrail that says
 * never silence a rule to make a build pass. It shipped nowhere. A scaffolded
 * site had the `context` command in its package.json and nothing that mentioned
 * it existed.
 *
 * `AGENTS.md` and `SKILL.md` serve two audiences from one file — this repo, and
 * a site that installed the packages. The parts that are only true here are
 * fenced, and stripped on the way out, so there is still one source to edit.
 */
const REPO_ONLY = /[^\n]*<!-- repo-only:start -->[\s\S]*?<!-- repo-only:end -->[^\n]*\n?/g;

async function copyForSite(from, to) {
  const text = await fs.readFile(path.join(repo, from), 'utf8');
  const stripped = text.replace(REPO_ONLY, '');
  if (stripped.includes('repo-only')) throw new Error(`${from}: unbalanced repo-only fence`);
  await fs.mkdir(path.dirname(path.join(template, to)), { recursive: true });
  await fs.writeFile(path.join(template, to), stripped);
}

await copyForSite('AGENTS.md', 'AGENTS.md');
await copyForSite('.ai/skills/ai-first-blogger/SKILL.md', '.ai/skills/ai-first-blogger/SKILL.md');
await copy(path.join(repo, 'prompts'), path.join(template, 'prompts'));

await build({
  entryPoints: ['src/index.ts'],
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outExtension: { '.js': '.mjs' },
  banner: { js: '#!/usr/bin/env node' },
  logLevel: 'warning',
});

console.log(`built dist/index.mjs · template carries ${examples.length} example(s): ${examples.join(', ')}`);

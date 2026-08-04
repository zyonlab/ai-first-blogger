/**
 * Scaffold a site.
 *
 *   pnpm create aifb <directory> [--example <name>]
 *
 * The default is the skeleton: every decision a person must make is marked
 * `TODO`, and the pipeline refuses to run until they are gone. A blank form is
 * a poor way to learn what a good answer looks like, so `--example` copies a
 * complete planned site instead — adopting someone else's plan is a decision,
 * leaving a form blank is not.
 *
 * What lands in the new directory is only ever the site: `site/`, `content/`,
 * and the few files Astro needs. The framework is a dependency.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Everything this scaffold writes ships inside the package.
 *
 * It used to read from the repository three levels up — which worked while it
 * lived in the monorepo and would have been broken the moment it was installed
 * from npm, where that path points at `node_modules/`. A scaffold that only
 * works from a checkout of its own repo is not a scaffold.
 */
const template = path.resolve(here, '../template');  // dist/ → package root → template/

/** Scaffolded sites depend on the same version of the framework that made them. */
const { version } = JSON.parse(
  await fs.readFile(path.resolve(here, '../package.json'), 'utf8'),
) as { version: string };

const args = process.argv.slice(2);
const target = args.find((arg) => !arg.startsWith('--'));
const exampleFlag = args.indexOf('--example');
const example = exampleFlag !== -1 ? args[exampleFlag + 1] : undefined;

const exists = (file: string) =>
  fs
    .access(file)
    .then(() => true)
    .catch(() => false);

if (!target) {
  console.error('Usage: pnpm create aifb <directory> [--example agent-native-engineer]');
  process.exit(1);
}

const dest = path.resolve(process.cwd(), target);
if (await exists(dest)) {
  const entries = await fs.readdir(dest);
  if (entries.length > 0) {
    console.error(`${target} exists and is not empty. Refusing to write into it.`);
    process.exit(1);
  }
}

async function copy(from: string, to: string) {
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.cp(from, to, { recursive: true });
}

/* The intent layer: skeleton, or a worked example. */
const source = example
  ? path.join(template, 'examples', example, 'site')
  : path.join(template, 'skeleton');

if (!(await exists(source))) {
  const available = await fs.readdir(path.join(template, 'examples')).catch(() => []);
  console.error(`No example "${example}". Available: ${available.join(', ') || '(none)'}`);
  process.exit(1);
}

await copy(source, path.join(dest, 'site'));

/**
 * Themes are copied, not depended on. A theme is the site's to edit — shipping
 * it as a package would make the one thing people always want to change the one
 * thing they cannot.
 *
 * The baseline set goes in first; an example that selects a theme of its own
 * carries it under `site/themes/` and is layered on top. That keeps an example
 * a complete site: copying its `site/` directory anywhere brings everything it
 * names, including the theme its `site.yaml` points at.
 */
await copy(path.join(template, 'themes'), path.join(dest, 'site/themes'));

/* Content: the example's articles, or empty directories to write into. */
if (example) {
  await copy(path.join(template, 'examples', example, 'content'), path.join(dest, 'content'));
}
for (const type of ['posts', 'videos', 'projects', 'case-studies']) {
  const dir = path.join(dest, 'content', type);
  await fs.mkdir(dir, { recursive: true });
  if (!(await exists(path.join(dir, '.gitkeep')))) await fs.writeFile(path.join(dir, '.gitkeep'), '');
}

/* The rest of what a site owns. */
for (const file of ['astro.config.mjs', '.env.example', 'src/content.config.ts']) {
  await copy(path.join(template, file), path.join(dest, file));
}
await copy(path.join(template, 'public'), path.join(dest, 'public'));
/**
 * An example brings its own favicon and share card, drawn from its own theme
 * and initial. Without this a site scaffolded from an example wore the
 * framework's mark in the browser tab and shared a card in colours it never
 * rendered — and the planning preflight reported a decision the example had in
 * fact already made.
 */
if (example) {
  const examplePublic = path.join(template, 'examples', example, 'public');
  if (await exists(examplePublic)) await copy(examplePublic, path.join(dest, 'public'));
}
await copy(path.join(template, '.github'), path.join(dest, '.github'));

/**
 * The agent operating contract, which is the point of the product.
 *
 * Without it a scaffolded site has `pnpm context` in its package.json and
 * nothing that says the command exists — so an agent reads all ~9k tokens of
 * `site/`, has no prompt to follow, and no guardrail telling it never to
 * silence a rule to make a build pass.
 */
for (const file of ['AGENTS.md', '.ai', 'prompts']) {
  await copy(path.join(template, file), path.join(dest, file));
}
/**
 * A minimal tsconfig, not a copy of the workspace one. The workspace maps
 * `@components/*` and friends to `packages/engine/*`, which is meaningless in a
 * site that has the engine as a dependency — and the integration supplies those
 * aliases to the bundler anyway.
 */
await fs.writeFile(
  path.join(dest, 'tsconfig.json'),
  `${JSON.stringify({ extends: 'astro/tsconfigs/strict', include: ['src', 'site', 'content'] }, null, 2)}\n`,
);

await fs.writeFile(
  path.join(dest, '.gitignore'),
  'node_modules\ndist\n.astro\n.env\n.DS_Store\n\n# Generated reports\nvalidate-report.json\nmetrics.json\nmetrics-history.jsonl\ncontent-report.json\n',
);

await fs.writeFile(
  path.join(dest, 'package.json'),
  `${JSON.stringify(
    {
      name: path.basename(dest),
      private: true,
      type: 'module',
      scripts: {
        dev: 'astro dev',
        build: 'astro build',
        check: 'astro check',
        context: 'aifb context',
        validate: 'aifb validate',
        analyze: 'aifb analyze',
        metrics: 'aifb metrics',
        brand: 'aifb brand',
        env: 'aifb env',
        'migrate:ghost': 'aifb migrate:ghost',
      },
      dependencies: {
        'aifb-cli': `^${version}`,
        'aifb-engine': `^${version}`,
        '@astrojs/mdx': '^7.0.2',
        '@astrojs/rss': '^4.0.19',
        '@astrojs/sitemap': '^3.7.3',
        astro: '^7.0.6',
        mermaid: '^11.16.0',
      },
      devDependencies: { '@astrojs/check': '^0.9.9', typescript: '^6.0.3' },
    },
    null,
    2,
  )}\n`,
);

console.log(`\nCreated ${target}${example ? ` from the "${example}" example` : ' (skeleton)'}.\n`);
console.log(`  cd ${target}`);
console.log('  pnpm install');
if (!example) console.log('  pnpm validate      # lists every decision still marked TODO');
console.log('  pnpm dev\n');

/**
 * Cross-layer regression tests.
 *
 *   pnpm test:scenarios
 *
 * `validate:self-test` proves each rule fires against a synthetic context. That
 * is not the same as proving the *system* behaves: three real defects in this
 * repo passed the self-test and were only found by hand — a theme-colour check
 * whose block indices were off by one so it never ran, C-12 counting tokens
 * file-wide so a missing alternate-mode token was invisible, and C-22 counting
 * every `<article>` so a correct topic page reported a mismatch.
 *
 * Every scenario here drives the real pipeline over real files: swap a theme,
 * swap a voice, break the taxonomy, run a preview build. Each asserts both
 * directions — the broken state is caught, and the fixed state passes — because
 * a check that fires on everything is as useless as one that never fires.
 *
 * `site/`, `content/` and the workflow are snapshotted and restored, so a failed
 * run never leaves the repository half-mutated.
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import matter from 'gray-matter';

const run = promisify(execFile);
const root = process.cwd();
const SNAPSHOT = path.join(root, '.scenario-snapshot');
// astro.config.mjs is in here because the mount scenarios change the one line a
// site owner would change — `engine({ mount })`. Driving the option through the
// real config is the difference between testing the feature and testing a
// private helper that happens to agree with it.
// `migration/` is in here because the Ghost scenarios put an export in it and
// `migrate:ghost` writes a report back next to it.
const MUTABLE = ['site', 'content', 'public', 'migration', 'astro.config.mjs', '.github/workflows/cloudflare-pages.yml'];

/** The path data in the mark this framework ships; mirrors src/brand.ts. */
const FRAMEWORK_MARK = 'M17 19h31L27 45h21';

type Result = { name: string; ok: boolean; detail?: string };
const results: Result[] = [];

/**
 * `pnpm test:scenarios --only <text>` runs the scenarios whose name contains
 * <text>. Every scenario drives a real build, so the whole suite is minutes;
 * iterating on one of them should not be. CI passes no filter and therefore
 * runs everything — the count in the summary says which of the two happened,
 * so a filtered run can never be mistaken for a green suite.
 */
const onlyFlag = process.argv.indexOf('--only');
const only = onlyFlag === -1 ? undefined : process.argv[onlyFlag + 1]?.toLowerCase();
let skipped = 0;

/* ------------------------------------------------------------------ *
 * Harness
 * ------------------------------------------------------------------ */

async function sh(command: string, args: string[], env: Record<string, string> = {}) {
  try {
    const { stdout, stderr } = await run(command, args, {
      cwd: root,
      env: { ...process.env, ...env },
      maxBuffer: 32 * 1024 * 1024,
    });
    return { code: 0, out: `${stdout}${stderr}` };
  } catch (error) {
    const err = error as { code?: number; stdout?: string; stderr?: string };
    return { code: err.code ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

/** Did the build emit this path? */
const exists = (relative: string) => fs.access(path.join(root, relative)).then(() => true).catch(() => false);
/** One file out of the last build. */
const dist = (file: string) => fs.readFile(path.join(root, 'dist', file), 'utf8');

const build = (env: Record<string, string> = {}) => sh('pnpm', ['build'], env);
const validate = () => sh('pnpm', ['validate']);
const analyze = (target?: string) => sh('pnpm', ['analyze', ...(target ? [target] : [])]);
const migrateGhost = () => sh('pnpm', ['migrate:ghost'], { LEGACY_CONTENT_DOMAIN: 'https://legacy.example.com' });

/**
 * Copy, tolerating a source that is not there.
 *
 * `content/` is four directories that are empty in a fresh clone, and git does
 * not track an empty directory — so the harness crashed with an ENOENT stack
 * trace on CI while passing on every developer machine, where the directories
 * happen to exist. The repository now carries `.gitkeep` files, and this no
 * longer depends on that: a missing source means "nothing to restore", which is
 * a state the harness has to survive anyway.
 */
async function cp(from: string, to: string) {
  await fs.rm(to, { recursive: true, force: true });
  if (!(await fs.access(from).then(() => true).catch(() => false))) return;
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.cp(from, to, { recursive: true });
}

async function snapshot() {
  await fs.rm(SNAPSHOT, { recursive: true, force: true });
  for (const item of MUTABLE) await cp(path.join(root, item), path.join(SNAPSHOT, item));
}

async function restore() {
  for (const item of MUTABLE) await cp(path.join(SNAPSHOT, item), path.join(root, item));
  await fs.rm(SNAPSHOT, { recursive: true, force: true });
  // The content layer caches entries; a stale one makes the next run render a
  // file that no longer exists.
  await fs.rm(path.join(root, 'node_modules/.astro'), { recursive: true, force: true });
  await fs.rm(path.join(root, '.astro'), { recursive: true, force: true });
  await fs.rm(path.join(root, 'dist'), { recursive: true, force: true });
  // What the last build was. Left behind, it would tell the next scenario's
  // gate that the engine is mounted somewhere this build never put it.
  await fs.rm(path.join(root, '.aifb'), { recursive: true, force: true });
}

/**
 * Every example in the repository, discovered rather than listed.
 *
 * The suite used to name one. Adding a second example therefore tested nothing,
 * and renaming the first would have broken twelve scenarios at run time with a
 * copy error rather than a useful message. Examples are shipped artefacts —
 * `create-aifb --example <name>` hands them to strangers — so each one should
 * be proven to build and pass the gate.
 */
const EXAMPLES = (await fs.readdir(path.join(root, 'examples'), { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

if (EXAMPLES.length === 0) throw new Error('No examples found — the suite has nothing to run against.');

/** Load one example as the site under test. Defaults to the first. */
async function loadExample(name = EXAMPLES[0]!) {
  const from = path.join(root, 'examples', name);
  await fs.cp(path.join(from, 'site'), path.join(root, 'site'), { recursive: true });
  for (const part of ['content', 'public']) {
    const dir = path.join(from, part);
    if (await fs.access(dir).then(() => true).catch(() => false)) {
      await fs.cp(dir, path.join(root, part), { recursive: true });
    }
  }
  const workflow = path.join(root, '.github/workflows/cloudflare-pages.yml');
  const text = await fs.readFile(workflow, 'utf8');
  await fs.writeFile(
    workflow,
    text
      .replace('CLOUDFLARE_PAGES_PROJECT_NAME: REPLACE_ME', 'CLOUDFLARE_PAGES_PROJECT_NAME: scenario')
      .replace('PUBLIC_SITE_URL: https://REPLACE_ME.pages.dev', 'PUBLIC_SITE_URL: https://agent-notes.example.dev'),
  );
  await fs.rm(path.join(root, 'node_modules/.astro'), { recursive: true, force: true });
}

/**
 * Trim the loaded example to the one content type, the way a site that
 * publishes only articles is configured. `routeAtRoot` is only legal there, so
 * every scenario about it starts here.
 */
async function onlyPosts() {
  const file = path.join(root, 'site/content-types.yaml');
  let text = await fs.readFile(file, 'utf8');
  for (const type of ['videos', 'projects', 'case-studies']) {
    const without = text.replace(new RegExp(`^${type}:\\n(?:[ \\t].*\\n|\\n(?=[ \\t]))*`, 'm'), '');
    if (without === text) throw new Error(`scenario setup: no "${type}:" block in site/content-types.yaml`);
    text = without;
    await fs.rm(path.join(root, 'content', type), { recursive: true, force: true });
  }
  await fs.writeFile(file, text);

  // A hero action or nav entry pointing at a section this site no longer
  // publishes is a dead link, and the gate is right to say so — the same
  // tidying `mountExample` does for the pages it declines.
  const siteYaml = path.join(root, 'site/site.yaml');
  const withoutDeclined = (await fs.readFile(siteYaml, 'utf8'))
    .split('\n')
    .filter((line) => !/href: \/(videos|projects|case-studies)\//.test(line))
    .join('\n');
  await fs.writeFile(siteYaml, withoutDeclined);
}

async function edit(file: string, replacements: [string, string][]) {
  const target = path.join(root, file);
  let text = await fs.readFile(target, 'utf8');
  for (const [from, to] of replacements) {
    if (!text.includes(from)) throw new Error(`scenario setup: "${from.slice(0, 40)}…" not found in ${file}`);
    text = text.replace(from, to);
  }
  await fs.writeFile(target, text);
}

/**
 * Put the Ghost fixture where `migrate:ghost` looks for it.
 *
 * The fixture is the **admin export** shape (Settings → Migration → Export):
 * posts, tags and posts_tags as three sibling tables. That distinction is the
 * whole point of it — the Content API hands you `post.tags` already joined, and
 * a migrator written against that shape reads `undefined` from every post in a
 * real export without failing.
 */
async function loadGhostExport() {
  await fs.mkdir(path.join(root, 'migration'), { recursive: true });
  await fs.cp(
    path.join(root, 'packages/cli/src/__fixtures__/ghost-admin-export.json'),
    path.join(root, 'migration/ghost-export.json'),
  );
}

/** Frontmatter of a migrated file, or undefined if it was never written. */
async function migrated(slug: string) {
  const file = path.join(root, 'content/posts', `${slug}.mdx`);
  const text = await fs.readFile(file, 'utf8').catch(() => undefined);
  return text === undefined ? undefined : (matter(text).data as Record<string, any>);
}

/**
 * Each scenario mutates real files, so each one restores the snapshot on its
 * way out — pass or fail. Without that a failing scenario leaves the site in a
 * broken state and every scenario after it fails for the wrong reason, which is
 * exactly how a harness starts lying about where the defect is.
 */
async function scenario(name: string, body: () => Promise<void>) {
  if (only !== undefined && !name.toLowerCase().includes(only)) {
    skipped += 1;
    return;
  }
  process.stdout.write(`  ${name} … `);
  try {
    await body();
    results.push({ name, ok: true });
    console.log('✓');
  } catch (error) {
    results.push({ name, ok: false, detail: (error as Error).message });
    console.log('✗');
  } finally {
    await restore();
    await snapshot();
  }
}

function expect(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

/* ------------------------------------------------------------------ *
 * Scenarios
 * ------------------------------------------------------------------ */

/**
 * A snapshot left on disk means a previous run died before its `finally` — an
 * interrupt, a crash, a killed terminal. The repository is then sitting in
 * whatever state that scenario had put it in, and the next run would snapshot
 * *that* as the baseline and restore to it forever after.
 */
if (await fs.access(SNAPSHOT).then(() => true).catch(() => false)) {
  console.log('Recovering site/ and content/ from an interrupted run.');
  await restore();
}

await snapshot();

try {
  console.log('\nplanning preflight');

  await scenario('skeleton refuses to run the content pipeline', async () => {
    const result = await validate();
    expect(result.code !== 0, 'skeleton should exit non-zero');
    expect(result.out.includes('not planned yet'), 'should say the site is not planned');
    const report = JSON.parse(await fs.readFile(path.join(root, 'validate-report.json'), 'utf8'));
    expect(report.planned === false, 'report should mark the site unplanned');
    expect(report.rulesRun === 0, `no content rule should run, ran ${report.rulesRun}`);
    const areas = new Set(report.readiness.map((issue: { area: string }) => issue.area));
    expect(areas.size >= 5, `expected several unplanned areas, got ${[...areas]}`);
  });

  for (const name of EXAMPLES) {
    await scenario(`example "${name}" passes every rule`, async () => {
      await loadExample(name);
      expect((await build()).code === 0, `${name} should build`);
      const result = await validate();
      expect(result.code === 0, `${name} should validate cleanly:\n${result.out.slice(-600)}`);
      const report = JSON.parse(await fs.readFile(path.join(root, 'validate-report.json'), 'utf8'));
      expect(report.planned === true, 'report should mark the site planned');
      expect(report.rulesRun === report.rulesTotal, `all rules should run, ran ${report.rulesRun}/${report.rulesTotal}`);
      expect(report.errors === 0 && report.warnings === 0, `${name} should have no findings`);
    });
  }

  console.log('\ncustom template');

  /**
   * The theme name is read out of the example rather than hardcoded. It was
   * `default` once; an example switched to the theme it had been shipping
   * unused, and two scenarios failed on a string that no longer existed —
   * failing in the setup, which says nothing about the product.
   */
  const currentTheme = async () =>
    /^\s*name:\s*(\S+)/m.exec(
      (await fs.readFile(path.join(root, 'site/site.yaml'), 'utf8')).split('theme:')[1] ?? '',
    )?.[1] ?? 'default';

  await scenario('switching theme without the mode catches the mismatch', async () => {
    await loadExample();
    await edit('site/site.yaml', [[`  name: ${await currentTheme()}`, '  name: paper']]);
    const result = await validate();
    expect(result.code !== 0, 'a theme-colour mismatch should block');
    expect(result.out.includes('--bg'), 'the message should name the theme background');
  });

  await scenario('switching theme correctly builds and passes', async () => {
    await loadExample();
    const from = await currentTheme();
    // paper's own values, so the theme and the browser-chrome colours agree.
    await edit('site/site.yaml', [[`  name: ${from}`, '  name: paper']]);
    let yaml = await fs.readFile(path.join(root, 'site/site.yaml'), 'utf8');
    yaml = yaml
      .replace(/( {2}defaultMode: )\w+/, '$1light')
      .replace(/( {2}colorDark: )'[^']*'/, "$1'#16140f'")
      .replace(/( {2}colorLight: )'[^']*'/, "$1'#fbfaf7'");
    await fs.writeFile(path.join(root, 'site/site.yaml'), yaml);
    expect((await build()).code === 0, 'paper theme should build');
    const html = await fs.readFile(path.join(root, 'dist/index.html'), 'utf8');
    expect(html.includes('data-theme="light"'), 'the light mode should be the default');
    expect((await validate()).code === 0, `paper theme should validate:\n${(await validate()).out.slice(-500)}`);
  });

  await scenario('a token missing from the alternate block is caught', async () => {
    await loadExample();
    const themeFile = path.join(root, 'site/themes/paper.css');
    const css = await fs.readFile(themeFile, 'utf8');
    const cut = css.indexOf(":root[data-theme");
    expect(cut > 0, 'paper.css should have an alternate block');
    await fs.writeFile(themeFile, css.slice(0, cut) + css.slice(cut).replace(/^\s*--quote-text:[^\n]*\n/m, ''));
    const result = await validate();
    expect(result.code !== 0, 'a missing alternate-mode token should block');
    expect(result.out.includes('--quote-text'), 'the message should name the token');
  });

  /**
   * The list arrangement reaches the page from `site/content-types.yaml`.
   *
   * It always did — the registry is `{ ...engineType, ...siteType }` and the
   * YAML is spread in whole — but nothing said so, nothing validated the value,
   * and there was no third option. The first site that wanted one entry per row
   * replaced the whole list page to get it. This asserts the cheap path works,
   * so nobody pays 68 lines for it again.
   */
  /**
   * The landing page's shape, from the intent layer.
   *
   * Both halves were markup before: Topics and Series were written above the
   * content types, and `.hero-panel` rendered whether or not it had anything in
   * it. A product blog wanting its articles first had to fork `index.astro`,
   * which takes the SEO contract with it — the one thing templates.md warns
   * against.
   */
  await scenario('the home page renders its sections in the order the site asked for', async () => {
    await loadExample();
    expect((await build()).code === 0, 'the default home page should build');

    /** The section headings, in document order. */
    const headings = async () =>
      [...(await dist('index.html')).matchAll(/<h2[^>]*>([^<]+)<\/h2>/g)].map((match) => match[1]!.trim());

    const before = await headings();
    const topicsAt = before.findIndex((heading) => heading.includes('精选主题'));
    const writingAt = before.findIndex((heading) => heading === 'Writing');
    expect(topicsAt !== -1 && writingAt !== -1, `expected both sections by default, got ${JSON.stringify(before)}`);
    expect(topicsAt < writingAt, 'by default the taxonomy sections come first, as they always have');

    await edit('site/site.yaml', [['hero:', 'home:\n  sections: [content, topics]\n\nhero:']]);
    expect((await build()).code === 0, 'a reordered home page should build');

    const after = await headings();
    expect(after.indexOf('Writing') < after.findIndex((h) => h.includes('精选主题')), `articles should now come first: ${JSON.stringify(after)}`);
    expect(!after.some((h) => h.includes('精选系列')), `an omitted section should not render: ${JSON.stringify(after)}`);
  });

  await scenario('a section named twice, or not at all, is reported by name', async () => {
    await loadExample();
    await edit('site/site.yaml', [['hero:', 'home:\n  sections: [content, content]\n\nhero:']]);
    const twice = await build();
    expect(twice.code !== 0, 'a duplicate section should fail the build');
    expect(twice.out.includes('twice'), `the failure should say what is wrong:\n${twice.out.slice(-400)}`);

    await loadExample();
    await edit('site/site.yaml', [['hero:', 'home:\n  sections: [content, prjects]\n\nhero:']]);
    const typo = await build();
    expect(typo.code !== 0, 'a misspelled section should fail the build');
    expect(typo.out.includes('prjects'), `the failure should quote the value:\n${typo.out.slice(-400)}`);
  });

  await scenario('the hero panel goes away when it has nothing in it', async () => {
    await loadExample();
    expect((await build()).code === 0, 'the example has signals and should build');
    expect((await dist('index.html')).includes('hero-panel'), 'a site with signals keeps the panel it had');

    // Declining it outright, with the signals still there.
    await edit('site/site.yaml', [['hero:', 'home:\n  panel: false\n\nhero:']]);
    expect((await build()).code === 0, 'declining the panel should build');
    expect(!(await dist('index.html')).includes('hero-panel'), 'home.panel: false should remove it');

    // …and emptying the signals is enough on its own: the panel was an empty
    // box under a heading before, with no way to say so.
    await loadExample();
    await dropYamlKey('site/site.yaml', '  signals');
    expect((await build()).code === 0, 'a site with no signals should build');
    expect(!(await dist('index.html')).includes('hero-panel'), 'an empty panel should not render at all');
  });

  /**
   * `getActiveSeries()` returns `topic` as the taxonomy key, so a card that
   * prints it prints a slug. `TopicCard` and the article header both resolve to
   * a title; `SeriesCard` did not, which put the one English word on an
   * otherwise Chinese card.
   */
  await scenario('a series card shows the topic title, not its slug', async () => {
    await loadExample();
    expect((await build()).code === 0, 'the example should build');

    for (const page of ['index.html', 'series/index.html']) {
      const cards = [...(await dist(page)).matchAll(/<article class="card series-card">([\s\S]*?)<\/article>/g)]
        .map((match) => match[1]!);
      expect(cards.length > 0, `${page} should render series cards`);
      for (const card of cards) {
        const eyebrow = /<div class="eyebrow">([^<]*)<\/div>/.exec(card)?.[1]?.trim() ?? '';
        expect(!/^[a-z0-9-]+$/.test(eyebrow), `${page} renders the raw topic slug "${eyebrow}"`);
      }
    }
    expect((await dist('series/index.html')).includes('>后端转型<'), 'the eyebrow should be the topic title from taxonomy.yaml');
  });

  await scenario('a site chooses its list layout without touching markup', async () => {
    await loadExample();
    await edit('site/content-types.yaml', [['posts:\n', 'posts:\n  listLayout: stack\n']]);
    expect((await build()).code === 0, 'a declared layout should build');
    const html = await fs.readFile(path.join(root, 'dist/writing/index.html'), 'utf8');
    expect(html.includes('class="section stack"'), 'the list should render stacked');
    expect((await validate()).code === 0, 'a declared layout should still pass the gate');
  });

  await scenario('an unknown list layout fails by name', async () => {
    await loadExample();
    await edit('site/content-types.yaml', [['posts:\n', 'posts:\n  listLayout: masonry\n']]);
    const result = await build();
    expect(result.code !== 0, 'an invalid layout should fail the build');
    expect(result.out.includes('masonry'), `the error should name the value:\n${result.out.slice(-400)}`);
    expect(result.out.includes('stack'), 'the error should list what is valid');
  });

  /**
   * The brand assets belong to the site, not to the framework.
   *
   * A scaffolded site used to wear this framework's mark in the browser tab and
   * share a card in the *default theme's* colours — so a white monospace site
   * posted a dark cyan card it never rendered. Neither errors. Both are only
   * ever wrong in someone else's repository, which is why they need a check
   * here rather than a note in the docs.
   */
  await scenario("the framework's own favicon is reported, not shipped silently", async () => {
    await loadExample();
    const icon = path.join(root, 'public/favicon.svg');
    const before = await fs.readFile(icon, 'utf8');
    expect(!before.includes(FRAMEWORK_MARK), 'an example should carry its own icon');
    expect((await validate()).code === 0, 'an example should pass with its own icon');

    await fs.writeFile(icon, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="${FRAMEWORK_MARK}"/></svg>\n`);
    const result = await validate();
    expect(result.code !== 0, "the framework's mark should be reported as an unmade decision");
    expect(result.out.includes('favicon'), `the report should name the file:\n${result.out.slice(-400)}`);
  });

  await scenario('brand assets are drawn from the theme and the initial', async () => {
    await loadExample('indie-ai-builder');
    await sh('pnpm', ['exec', 'aifb', 'brand']);
    const icon = await fs.readFile(path.join(root, 'public/favicon.svg'), 'utf8');
    // indie-ai-builder: brand.initial "k", mono theme, white background.
    expect(icon.includes('>k<'), `the glyph should come from brand.initial:\n${icon}`);
    expect(icon.includes('#ffffff'), `the plate should be the theme's background:\n${icon}`);
    expect(!icon.includes(FRAMEWORK_MARK), "the framework's mark should be gone");

    // A favicon that is no longer the framework's is never overwritten.
    const mine = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30"/></svg>\n';
    await fs.writeFile(path.join(root, 'public/favicon.svg'), mine);
    await sh('pnpm', ['exec', 'aifb', 'brand']);
    expect((await fs.readFile(path.join(root, 'public/favicon.svg'), 'utf8')) === mine, 'a custom favicon must survive');
  });

  console.log('\ntemplate overrides');

  /**
   * The two ids that reach an engine component take different routes through
   * Vite — `@components/Header.astro` is substituted by `resolve.alias`, and
   * `./ThemeToggle.astro` by a plugin. The first shipped broken: aliases are
   * applied ahead of every user plugin, `enforce: 'pre'` included, so the
   * override plugin never saw the id and the engine's markup rendered while the
   * build log still said the site had overrides. Nothing failed — that is the
   * shape of this defect, and the reason it needs a scenario rather than a
   * comment.
   */
  await scenario('a component override replaces the engine markup', async () => {
    await loadExample();
    await fs.mkdir(path.join(root, 'site/templates/components'), { recursive: true });
    await fs.writeFile(
      path.join(root, 'site/templates/components/Footer.astro'),
      '---\nimport { site } from \'@config/site\';\n---\n<footer data-site-footer>{site.author.name}</footer>\n',
    );
    expect((await build()).code === 0, 'an overridden footer should build');
    const html = await fs.readFile(path.join(root, 'dist/index.html'), 'utf8');
    expect(html.includes('data-site-footer'), "the site's footer should be the one rendered");
    expect(!html.includes('class="site-footer"'), "the engine's footer should be gone");
  });

  /**
   * A stylesheet override has a second half a component override does not: the
   * engine's sheet must stop being *emitted*, not merely stop being authored.
   * A redirect that half-works still builds and still renders — the site's
   * rules arrive, and 1379 lines of the engine's reset arrive underneath them,
   * which is the state a site installing into its own design system was trying
   * to leave. So this asserts the absence as well as the presence, over every
   * stylesheet the build produced, inlined ones included.
   */
  await scenario('a stylesheet override is the only sheet that ships', async () => {
    await loadExample();
    await fs.mkdir(path.join(root, 'site/templates/styles'), { recursive: true });
    await fs.writeFile(path.join(root, 'site/templates/styles/global.css'), ':root { --site-own-sheet: 1; }\n');
    expect((await build()).code === 0, 'an overridden stylesheet should build');

    const dist = path.join(root, 'dist');
    const files = (await fs.readdir(dist, { recursive: true })).filter((file) => /\.(css|html)$/.test(file));
    const shipped = (await Promise.all(files.map((file) => fs.readFile(path.join(dist, file), 'utf8')))).join('\n');

    expect(shipped.includes('--site-own-sheet'), "the site's stylesheet should reach the build");
    expect(!shipped.includes('--header-height'), "the engine's global.css should not be emitted as well");
  });

  await scenario('a page override replaces the route at the same URL', async () => {
    await loadExample();
    await fs.mkdir(path.join(root, 'site/templates/pages'), { recursive: true });
    await fs.writeFile(
      path.join(root, 'site/templates/pages/about.astro'),
      "---\nimport PageLayout from '@layouts/PageLayout.astro';\n---\n" +
        '<PageLayout title="About" description="Who runs this site and why." canonical="/about/">\n' +
        '  <p data-site-about>Replaced.</p>\n</PageLayout>\n',
    );
    const result = await build();
    expect(result.code === 0, 'an overridden page should build');
    expect(result.out.includes('1 overridden'), `the build should report the override:\n${result.out.slice(-400)}`);
    const html = await fs.readFile(path.join(root, 'dist/about/index.html'), 'utf8');
    expect(html.includes('data-site-about'), "the site's page should be the one served at /about/");
  });

  /**
   * The claim that makes an override layer safe to hand to people: the gate
   * does not care who wrote the markup. If this stops holding, the product is
   * WordPress — replace a template, lose your SEO, find out from traffic.
   */
  await scenario('an override that drops the head is blocked by the gate', async () => {
    await loadExample();
    await fs.mkdir(path.join(root, 'site/templates/pages'), { recursive: true });
    await fs.writeFile(
      path.join(root, 'site/templates/pages/about.astro'),
      '<html><body><p>No layout, no head, no h1.</p></body></html>\n',
    );
    expect((await build()).code === 0, 'a bad override still builds — only the gate stops it');
    const result = await validate();
    expect(result.code !== 0, 'an override without a head should block publishing');
    expect(/canonical/i.test(result.out), `the report should name the missing canonical:\n${result.out.slice(-600)}`);
  });

  console.log('\nmounting the engine');

  /* ---------------------------------------------------------------- *
   * The engine can be installed into a site that already exists, under
   * a prefix. Everything below is about the two ways that goes wrong
   * without anyone noticing: a URL that keeps the old root (a canonical
   * or a sitemap entry pointing at a page nobody built), and a page the
   * site declined that is still linked from the chrome.
   *
   * Both build green. That is why they are scenarios.
   * ---------------------------------------------------------------- */

  const MOUNT = '/zh/blog';

  /** Remove one top-level block from a YAML file — the key and everything under it. */
  async function dropYamlKey(file: string, key: string) {
    const target = path.join(root, file);
    const text = await fs.readFile(target, 'utf8');
    const without = text.replace(new RegExp(`^${key}:\\n(?:[ \\t].*\\n|\\n(?=[ \\t]))*`, 'm'), '');
    if (without === text) throw new Error(`scenario setup: no "${key}:" block in ${file}`);
    await fs.writeFile(target, without);
  }

  /**
   * Load the example and mount it, including the three places a *site* — not
   * the engine — states a URL of its own: the nav, redirect targets, and links
   * inside articles. None of those are rewritten for it, and each one is a
   * documented consequence of mounting rather than an oversight.
   */
  async function mountExample(options = `{ mount: '${MOUNT}', pages: ['topics', 'series'] }`) {
    await loadExample();
    await edit('astro.config.mjs', [['    engine(),', `    engine(${options}),`]]);

    const siteYaml = path.join(root, 'site/site.yaml');
    const withoutDeclined = (await fs.readFile(siteYaml, 'utf8'))
      .split('\n')
      .filter((line) => !/href: \/(about|work-with-me|uses|newsletter|tags)\//.test(line))
      .join('\n');
    await fs.writeFile(siteYaml, withoutDeclined);

    const redirects = path.join(root, 'site/redirects.yaml');
    await fs.writeFile(
      redirects,
      (await fs.readFile(redirects, 'utf8')).replace(/(\n\s+to: )\/(writing|topics|series)\//g, `$1${MOUNT}/$2/`),
    );

    const posts = path.join(root, 'content/posts');
    for (const file of await fs.readdir(posts)) {
      if (!file.endsWith('.mdx') && !file.endsWith('.md')) continue;
      const article = path.join(posts, file);
      await fs.writeFile(
        article,
        (await fs.readFile(article, 'utf8')).replace(/\]\(\/(writing|topics|series)\//g, `](${MOUNT}/$1/`),
      );
    }
  }

  await scenario('the default mount is still the site root', async () => {
    await loadExample();
    expect((await build()).code === 0, 'the default build should succeed');
    for (const file of ['index.html', '404.html', 'robots.txt', 'about/index.html', 'topics/index.html']) {
      expect(await exists(`dist/${file}`), `an unmounted engine should still build dist/${file}`);
    }
    expect(!(await exists('dist/zh')), 'nothing should be mounted anywhere');
    const info = JSON.parse(await fs.readFile(path.join(root, '.aifb/build.json'), 'utf8'));
    expect(info.mount === '', `the build should record no mount, recorded "${info.mount}"`);
  });

  await scenario('a mounted engine injects every route under the prefix and none at the root', async () => {
    await mountExample();
    const result = await build();
    expect(result.code === 0, `a mounted build should succeed:\n${result.out.slice(-600)}`);
    expect(result.out.includes(`under ${MOUNT}/`), `the build should report the mount:\n${result.out.slice(-400)}`);

    for (const file of ['index.html', 'writing/index.html', 'writing/why-retries-made-it-worse/index.html', 'topics/index.html', 'series/index.html', 'rss.xml', 'llms.txt']) {
      expect(await exists(`dist${MOUNT}/${file}`), `dist${MOUNT}/${file} should be built`);
    }

    // The three the host owns, and the four this site declined.
    for (const file of ['index.html', '404.html', 'robots.txt']) {
      expect(!(await exists(`dist/${file}`)), `a mounted engine must not take over /${file}`);
    }
    expect(!(await exists(`dist${MOUNT}/robots.txt`)), 'robots.txt under a prefix is read by nobody and must not be emitted');
    expect(!(await exists(`dist${MOUNT}/404.html`)), 'a 404 route under a prefix cannot be what the host serves');
    for (const page of ['about', 'uses', 'newsletter', 'work-with-me']) {
      expect(!(await exists(`dist${MOUNT}/${page}/index.html`)), `${page} was declined and must not be built`);
      expect(!(await exists(`dist/${page}/index.html`)), `${page} must not appear at the root either`);
    }
  });

  await scenario('every URL a mounted build emits carries the prefix', async () => {
    await mountExample();
    expect((await build()).code === 0, 'a mounted build should succeed');

    const article = await dist(`${MOUNT}/writing/why-retries-made-it-worse/index.html`);
    const canonical = /<link rel="canonical" href="([^"]+)"/.exec(article)?.[1] ?? '';
    expect(canonical.includes(`${MOUNT}/writing/why-retries-made-it-worse/`), `canonical should carry the mount: ${canonical}`);

    const breadcrumb = [...article.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .flatMap((match) => {
        const parsed = JSON.parse(match[1]!);
        return Array.isArray(parsed) ? parsed : [parsed];
      })
      .find((block: { '@type'?: string }) => block['@type'] === 'BreadcrumbList') as
      | { itemListElement: { item: string }[] }
      | undefined;
    expect(breadcrumb !== undefined, 'the detail page should carry a breadcrumb trail');
    for (const item of breadcrumb!.itemListElement) {
      expect(item.item.includes(MOUNT), `a breadcrumb points outside the mount: ${item.item}`);
    }

    const listing = await dist(`${MOUNT}/writing/index.html`);
    const itemList = [...listing.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .flatMap((match) => {
        const parsed = JSON.parse(match[1]!);
        return Array.isArray(parsed) ? parsed : [parsed];
      })
      .find((block: { '@type'?: string }) => block['@type'] === 'ItemList') as
      | { itemListElement: { url: string }[] }
      | undefined;
    expect(itemList !== undefined, 'the listing page should carry an ItemList');
    for (const item of itemList!.itemListElement) {
      expect(item.url.includes(`${MOUNT}/writing/`), `an ItemList url points outside the mount: ${item.url}`);
    }

    const sitemap = await dist('sitemap-0.xml');
    const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1]!).pathname);
    expect(locations.length > 0, 'the sitemap should list the mounted pages');
    for (const location of locations) {
      expect(location.startsWith(`${MOUNT}/`), `the sitemap lists ${location}, which is outside the mount`);
    }

    const feed = await dist(`${MOUNT}/rss.xml`);
    for (const link of [...feed.matchAll(/<link>([^<]+)<\/link>/g)].map((match) => match[1]!).slice(1)) {
      expect(link.includes(`${MOUNT}/`), `an RSS item links outside the mount: ${link}`);
    }
    expect((await dist(`${MOUNT}/llms.txt`)).includes(`](${MOUNT}/writing/`), 'llms.txt should link into the mount');

    // The site wrote `/topics/` in site.yaml; it must not have to know the mount.
    expect((await dist(`${MOUNT}/index.html`)).includes(`href="${MOUNT}/topics/"`), 'a nav entry should be moved with the engine');
  });

  /**
   * The three URL-shaped outputs that are invisible from the rendered page.
   * Canonical and og:url were mount-aware from the start; these were missed,
   * and nothing catches a wrong URL inside a JSON-LD block by looking at it.
   */
  await scenario('what the engine says it is carries the mount too', async () => {
    await mountExample();
    expect((await build()).code === 0, 'a mounted build should succeed');

    const home = await dist(`${MOUNT}/index.html`);
    const blocks = [...home.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((match) => {
      const parsed = JSON.parse(match[1]!);
      return Array.isArray(parsed) ? parsed : [parsed];
    });

    const website = blocks.find((block: { '@type'?: string }) => block['@type'] === 'WebSite') as
      | { url: string; publisher?: { url?: string } }
      | undefined;
    expect(website !== undefined, 'the home page should carry a WebSite block');
    expect(
      new URL(website!.url).pathname.startsWith(`${MOUNT}/`),
      `WebSite.url claims the origin root, which the host already owns: ${website!.url}`,
    );
    expect(
      website!.publisher?.url !== undefined && new URL(website!.publisher!.url!).pathname.startsWith(`${MOUNT}/`),
      `Person.url points outside the mount: ${website!.publisher?.url}`,
    );

    const llms = await dist(`${MOUNT}/llms.txt`);
    const declared = /^URL: (.+)$/m.exec(llms)?.[1] ?? '';
    expect(
      new URL(declared).pathname.startsWith(`${MOUNT}/`),
      `llms.txt announces itself as the description of the whole origin: ${declared}`,
    );
  });

  /**
   * A favicon is one per host. Mounting presupposes a host that already exists,
   * and one that already exists already declared its own — often as `.ico`, so
   * the engine's `/favicon.svg` is a link to a file the origin does not serve.
   */
  await scenario('a mounted engine does not claim the origin favicon', async () => {
    await mountExample();
    expect((await build()).code === 0, 'a mounted build should succeed');
    const mounted = await dist(`${MOUNT}/index.html`);
    expect(!mounted.includes('rel="icon"'), 'a mounted page should leave the favicon to the host');
  });

  await scenario('at the root the engine still ships its own favicon', async () => {
    await loadExample();
    expect((await build()).code === 0, 'an unmounted build should succeed');
    const rooted = await dist('index.html');
    expect(rooted.includes('href="/favicon.svg"'), 'an unmounted site owns the origin, and its icon');
  });

  await scenario('the gate measures a mounted build from the mount', async () => {
    await mountExample();
    expect((await build()).code === 0, 'a mounted build should succeed');

    const clean = await validate();
    expect(clean.code === 0, `a mounted site should pass every rule:\n${clean.out.slice(-800)}`);
    const report = JSON.parse(await fs.readFile(path.join(root, 'validate-report.json'), 'utf8'));
    expect(report.mount === MOUNT, `the report should record the mount, recorded "${report.mount}"`);
    expect(report.rulesRun === report.rulesTotal, `all rules should run, ran ${report.rulesRun}/${report.rulesTotal}`);
    expect(report.errors === 0 && report.warnings === 0, 'a mounted example should have no findings');

    // …and still catches the mistake a mounted site actually makes: a link
    // written the way it was before the engine moved.
    const article = path.join(root, 'content/posts/why-retries-made-it-worse.mdx');
    await fs.writeFile(
      article,
      (await fs.readFile(article, 'utf8')).replace(`](${MOUNT}/topics/`, '](/topics/'),
    );
    await build();
    const broken = await validate();
    expect(broken.code !== 0, 'a link that forgot the prefix should block publishing');
    expect(broken.out.includes(`${MOUNT}/topics/`), `the report should offer the prefixed URL:\n${broken.out.slice(-600)}`);
  });

  await scenario('a declined page needs no copy, and cannot be brought back by an override', async () => {
    await mountExample();

    // Nothing in pages.yaml for the four pages this site does not publish.
    for (const key of ['about', 'newsletter', 'uses', 'workWithMe']) await dropYamlKey('site/pages.yaml', key);
    const trimmed = await fs.readFile(path.join(root, 'site/pages.yaml'), 'utf8');
    expect(!trimmed.includes('workWithMe:'), 'the copy for the declined pages should be gone');

    const result = await build();
    expect(result.code === 0, `a declined page should not require its copy:\n${result.out.slice(-600)}`);
    expect((await validate()).code === 0, 'and the site should still pass the gate');

    // An override for a declined page is reported rather than silently ignored,
    // and does not put the URL back.
    await fs.mkdir(path.join(root, 'site/templates/pages'), { recursive: true });
    await fs.writeFile(
      path.join(root, 'site/templates/pages/uses.astro'),
      "---\nimport PageLayout from '@layouts/PageLayout.astro';\n---\n" +
        '<PageLayout title="Uses" description="What I use." canonical="/uses/"><p data-site-uses>Mine.</p></PageLayout>\n',
    );
    const withOverride = await build();
    expect(withOverride.code === 0, 'a stranded override should not break the build');
    expect(withOverride.out.includes('does not publish'), `the build should report it:\n${withOverride.out.slice(-500)}`);
    expect(!(await exists(`dist${MOUNT}/uses/index.html`)), 'the whitelist decides whether a URL exists at all');
    expect(!(await exists('dist/uses/index.html')), 'and the override must not appear at the root either');
  });

  await scenario('a page kept in the whitelist still needs its copy, by name', async () => {
    await mountExample(`{ mount: '${MOUNT}', pages: ['topics', 'series', 'uses'] }`);
    await dropYamlKey('site/pages.yaml', 'uses');

    const result = await build();
    expect(result.code !== 0, 'a published page with no copy should fail the build');
    expect(result.out.includes('site/pages.yaml'), `the error should name the file:\n${result.out.slice(-500)}`);
    expect(result.out.includes('uses'), 'the error should name the key');
    expect(result.out.includes('engine({ pages'), 'the error should offer the other way out');
  });

  console.log('\npublishing in two languages');

  /* ---------------------------------------------------------------- *
   * A site declares a second language in site/site.yaml. The default
   * language stays at the engine's root and the other one goes behind a
   * prefix — the shape every static-site i18n uses, and the one Astro's
   * own routing uses.
   *
   * The defect this set exists for is not a build failure. It is the
   * English page that builds *anyway*: empty, for an article nobody
   * translated, carrying a hreflang tag telling Google it is the English
   * version of a real page. That ships green, gets indexed, and is only
   * visible from outside the build.
   * ---------------------------------------------------------------- */

  const EN_NAV_ALL = [
    '      - { href: /series/, label: Series, order: 20 }',
    '      - { href: /topics/, label: Topics, order: 30 }',
    '      - { href: /about/, label: About, order: 80 }',
    '      - { href: /work-with-me/, label: Work With Me, order: 90 }',
  ];

  /**
   * Turn the loaded example into a bilingual one: the `locales` block, plus an
   * `i18n:` block in each of the four files that carry copy. Nothing here
   * touches the engine — this is the whole of what a site owner writes.
   */
  async function applyLocales(options: { nav?: string[] } = {}) {
    const { nav = EN_NAV_ALL } = options;

    await edit('site/site.yaml', [['locale: zh-CN\n', 'locale: zh-CN\nlocales:\n  zh-CN: zh\n  en-US: en\n']]);
    await fs.appendFile(
      path.join(root, 'site/site.yaml'),
      [
        '',
        'i18n:',
        '  en-US:',
        '    title: Agent Notes · engineering an agent that survives production',
        "    description: Field notes from moving a backend engineer's instincts into agent work — what broke, what it cost, what I would do differently.",
        '    hero:',
        '      eyebrow: from backend to agents',
        '      title: Notes on agents that stay up',
        '      description: What broke, what it cost, and the judgement I would keep.',
        '      actions:',
        '        - { label: Read the notes, href: /writing/, variant: primary }',
        '        - { label: Reading paths, href: /series/ }',
        '    services:',
        '      title: Work with me',
        '      description: Moving a blog onto this framework, deciding what its topics are, and the SEO work that can be written down as rules.',
        '      contactText: Mail me with what you are trying to publish and what is in the way of publishing it.',
        '    nav:',
        ...nav,
        '',
      ].join('\n'),
    );

    // A topic's title and description are copy, so they localise like all copy
    // in site/. Its slug, its pillar and which entries belong to it do not.
    await edit('site/taxonomy.yaml', [
      [
        '  llm-reliability:\n    title: 可靠性与降级\n',
        '  llm-reliability:\n    i18n:\n      en-US:\n        title: Reliability and fallbacks\n' +
          '        description: The model times out, changes its mind, and makes things up. On a backend those are exceptions; here they are the normal case.\n' +
          '    title: 可靠性与降级\n',
      ],
      [
        '  agent-in-production:\n    title: Agent 上生产\n',
        '  agent-in-production:\n    i18n:\n      en-US:\n        title: Agents in production\n' +
          '        description: Reliability, evaluation and cost, one approach each, and how to choose when the three of them disagree.\n' +
          '    title: Agent 上生产\n',
      ],
    ]);

    // A content type's labels are copy too. `route` is not: /writing/ and
    // /en/writing/ stay parallel on purpose.
    await edit('site/content-types.yaml', [
      [
        'posts:\n  route: writing\n',
        'posts:\n  route: writing\n  i18n:\n    en-US:\n      listTitle: Notes\n' +
          '      listDescription: Most of these start from something that broke in production — what the alert said, which wrong turns the investigation took, and which default I changed.\n',
      ],
    ]);

    await fs.appendFile(
      path.join(root, 'site/pages.yaml'),
      [
        '',
        'i18n:',
        '  en-US:',
        '    topics:',
        '      title: By topic',
        '      description: Filed by the problem rather than by the date, so the articles about one problem can be read together.',
        '    tags:',
        '      title: By tag',
        '      description: Finer than a topic, and never planned — these come from the articles themselves, so the count beside each one is what it is worth.',
        '    series:',
        '      title: Reading paths',
        '      description: The ones meant to be read in order. Each says where it starts and what you should already know.',
        '    about:',
        '      title: About this site',
        '      sections:',
        '        - { heading: What this site is for, body: siteDescription }',
        '        - { heading: Who writes it, body: authorBio }',
        '        - { heading: What it covers, body: keywords }',
        '        - { heading: Working together, body: services }',
        '    newsletter:',
        '      title: The mailing list',
        '      description: One email when there is a new post-mortem or a new set of notes. Twice a month at the very most.',
        '      body: There is no subscription service yet. Mail me and I will add you by hand.',
        '      action: Mail me to subscribe',
        '    uses:',
        '      title: What I use',
        '      description: The tools actually in use right now, and why each one. This page changes when they do, and not otherwise.',
        '      items:',
        '        - { name: Editor, body: VS Code for code and Cursor for the large repetitive edits. }',
        '        - { name: Deploy, body: Cloudflare Pages. The free tier covers a personal site and there is no cold start. }',
        '    workWithMe:',
        '      action: Send an email',
        '      services:',
        '        - { name: Move an existing blog here, body: Ghost or WordPress export to MDX with the old URLs kept as redirects. }',
        '        - { name: Structure the content, body: Deciding what the topics are before the articles make that expensive to change. }',
        '',
      ].join('\n'),
    );
  }

  const localiseExample = async (options: { nav?: string[] } = {}) => {
    await loadExample();
    await applyLocales(options);
  };

  /**
   * One English article, paired with a Chinese one by `translationKey` and
   * carrying a slug of its own.
   *
   * The localised slug is the case worth proving: an English article deserves an
   * English URL, which means the pairing cannot come from the path and cannot
   * come from the slug either. Everything hreflang says about this pair comes
   * from that one field.
   */
  async function writeTranslation(prefix = '') {
    const dir = path.join(root, 'content/posts/en');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'retries-made-it-worse.mdx'),
      [
        '---',
        'title: Three retries to five cost 4.7 seconds',
        'description: A change that looked obviously right took P99 from 2.1s to 6.8s and added $40 a month. Here is the arithmetic I did at the time.',
        'slug: retries-made-it-worse',
        'translationKey: why-retries-made-it-worse',
        'pubDate: 2026-08-03',
        'category: llm-reliability',
        'tags: [retries, latency, cost]',
        'series: agent-in-production',
        'seriesOrder: 1',
        '---',
        '',
        '## The conclusion first',
        '',
        'Going from 3 retries to 5 moved tool-call success from 91% to 94%, moved P99',
        'from 2.1s to 6.8s, and added about $40 a month. For a user sitting there waiting',
        'for an answer that was not worth it, so we went back to 3 and changed the failure',
        'path to retry with a shorter prompt instead.',
        '',
        '## The number I got wrong',
        '',
        'I budgeted the retry against the average call, which was 400ms. The calls that',
        'fail are not average calls: they are the long ones, already near the timeout, and',
        'retrying them twice more meant paying the worst case three times over. Measuring',
        'against the p99 of failing calls rather than the mean of all calls would have',
        'shown the 4.7 seconds before any of it shipped. The rest of',
        `[this topic](${prefix}/en/topics/llm-reliability/) and the`,
        `[series](${prefix}/en/series/agent-in-production/) it belongs to have more of the same.`,
        '',
        '## What I would do differently',
        '',
        'Decide the latency budget first and let it decide the retry count, rather than',
        'picking a retry count and discovering the latency afterwards. A retry is a product',
        'decision with a stopwatch attached, and on an agent it is being made against the',
        'slowest requests you have. It took an incident and a bill to learn something a',
        'spreadsheet would have told me in ten minutes.',
      ].join('\n'),
    );
  }

  await scenario('one language is still the whole site at the root', async () => {
    await loadExample();
    expect((await build()).code === 0, 'a single-language build should succeed');
    expect(!(await exists('dist/en')), 'nothing should be published under a locale prefix');
    const home = await dist('index.html');
    expect(home.includes('lang="zh-CN"'), 'the html lang should be the site locale');
    expect(!home.includes('rel="alternate"'), 'a single-language site must not emit hreflang at all');
    const info = JSON.parse(await fs.readFile(path.join(root, '.aifb/build.json'), 'utf8'));
    expect(info.locales.length === 1, `one locale should be recorded, got ${JSON.stringify(info.locales)}`);
  });

  /**
   * A single-language site is the case where untranslated chrome is loudest:
   * there is no second language to explain the English away. The three sources
   * were separate — a literal in a component, an English value sitting in the
   * zh-CN table, and a literal in the page routes that `templatesDir` cannot
   * reach — so all three are asserted here.
   */
  await scenario('a zh-CN site renders no English chrome', async () => {
    await loadExample();
    expect((await build()).code === 0, 'a single-language build should succeed');

    const article = await dist('writing/why-retries-made-it-worse/index.html');
    const brief = /<aside class="article-brief"[\s\S]*?<\/aside>/.exec(article)?.[0] ?? '';
    expect(brief !== '', 'the article should carry its brief rail');
    for (const label of ['>Topic<', '>Read<', '>Series<']) {
      expect(!brief.includes(label), `the brief still has a hardcoded English label: ${label}`);
    }
    expect(/<dt>主题<\/dt>/.test(brief), `the topic label should be translated:\n${brief.slice(0, 400)}`);

    const crumbs = /<nav class="breadcrumbs"[\s\S]*?<\/nav>/.exec(article)?.[0] ?? '';
    expect(!crumbs.includes('>Home<'), 'the visible breadcrumb root should not be English');
    expect(crumbs.includes('>首页<'), `the breadcrumb root should be translated:\n${crumbs}`);

    // …and the same word in the structured data, from the same key.
    const trail = [...article.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .flatMap((match) => {
        const parsed = JSON.parse(match[1]!);
        return Array.isArray(parsed) ? parsed : [parsed];
      })
      .find((block: { '@type'?: string }) => block['@type'] === 'BreadcrumbList') as
      | { itemListElement: { name: string }[] }
      | undefined;
    expect(trail !== undefined, 'the article should carry a breadcrumb trail');
    expect(
      trail!.itemListElement[0]!.name === '首页',
      `BreadcrumbList tells crawlers the root is called "${trail!.itemListElement[0]!.name}"`,
    );

    const home = await dist('index.html');
    for (const english of ['Featured Topics', 'Learning Paths', 'Focus Map', 'Built with Astro.']) {
      expect(!home.includes(english), `the home page still shows "${english}" on a Chinese site`);
    }
  });

  await scenario('a second language is served under its prefix, the default at the root', async () => {
    await localiseExample();
    await writeTranslation();
    const result = await build();
    expect(result.code === 0, `a two-language build should succeed:\n${result.out.slice(-600)}`);
    expect(result.out.includes('zh-CN, en-US'), `the build should report both locales:\n${result.out.slice(-400)}`);

    for (const file of ['index.html', 'about/index.html', 'writing/index.html', 'writing/retries-made-it-worse/index.html', 'rss.xml', 'llms.txt']) {
      expect(await exists(`dist/en/${file}`), `dist/en/${file} should be built`);
    }
    // The default language keeps every URL it had.
    for (const file of ['index.html', 'about/index.html', 'writing/why-retries-made-it-worse/index.html', 'robots.txt', '404.html']) {
      expect(await exists(`dist/${file}`), `the default locale should still have dist/${file}`);
    }
    expect(!(await exists('dist/en/404.html')), 'a 404 belongs to the origin, not to a language');
    expect(!(await exists('dist/en/robots.txt')), 'one robots.txt per host, and it is not under a prefix');

    const en = await dist('en/index.html');
    expect(en.includes('lang="en-US"'), 'the English page should declare its language');
    expect(en.includes('Notes on agents that stay up'), 'the English hero copy should come from the i18n block');
    expect(en.includes('og:locale" content="en_US"'), 'og:locale should follow the page');
    expect(en.includes('og:locale:alternate" content="zh_CN"'), 'the other language should be advertised to Open Graph');
    expect(en.includes('href="/en/writing/"'), 'the English nav should link into the English section');
    expect(en.includes('>Notes<'), "a content type's label should come from its own i18n block");
    expect((await dist('index.html')).includes('>Writing<'), 'and the default language keeps its own');

    // The taxonomy is one vocabulary read through two languages.
    expect((await dist('en/topics/llm-reliability/index.html')).includes('Reliability and fallbacks'), 'the topic title should be the English one');
    expect((await dist('topics/llm-reliability/index.html')).includes('可靠性与降级'), 'and the default one unchanged');
  });

  await scenario('hreflang pairs both ways, with x-default on the root language', async () => {
    await localiseExample();
    await writeTranslation();
    expect((await build()).code === 0, 'a two-language build should succeed');

    const links = (html: string) =>
      new Map(
        [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)].map(
          (match) => [match[1]!, match[2]!] as const,
        ),
      );

    for (const [where, html] of [
      ['the Chinese article', await dist('writing/why-retries-made-it-worse/index.html')],
      ['the English article', await dist('en/writing/retries-made-it-worse/index.html')],
    ] as const) {
      const tags = links(html);
      expect(tags.get('zh-CN')?.endsWith('/writing/why-retries-made-it-worse/') === true, `${where} should point at the Chinese URL`);
      expect(tags.get('en-US')?.endsWith('/en/writing/retries-made-it-worse/') === true, `${where} should point at the English URL`);
      expect(tags.get('x-default') === tags.get('zh-CN'), `${where}: x-default should be the default language`);
    }

    /**
     * …and the sitemap says the same thing, via @astrojs/sitemap's i18n option.
     *
     * It pairs by path-after-the-prefix, so it covers every URL that is the
     * same in both languages — the roots, the listings, the fixed pages — and
     * cannot pair an article whose English slug differs from its Chinese one.
     * That article is paired by the `<link rel="alternate">` tags asserted
     * above, which Google documents as an equivalent signal; a sitemap
     * annotation is an alternative to them, not an addition. Asserted here so
     * the limit is a stated fact rather than something a reader discovers.
     */
    const sitemap = await dist('sitemap-0.xml');
    expect(sitemap.includes('xhtml:link'), 'the sitemap should carry alternates');
    expect(
      sitemap.includes('hreflang="en-US" href="https://agent-notes.example.dev/en/about/"'),
      `the sitemap should pair the pages whose path is the same in both:\n${sitemap.slice(0, 400)}`,
    );
    expect(
      !sitemap.includes('/en/writing/retries-made-it-worse/"/><xhtml'),
      'and the localised-slug article is paired in the page head instead',
    );
  });

  await scenario('an article in one language does not produce a page in the other', async () => {
    await localiseExample();
    await writeTranslation();
    expect((await build()).code === 0, 'a two-language build should succeed');

    // backend-instincts-that-broke exists in Chinese only.
    expect(await exists('dist/writing/backend-instincts-that-broke/index.html'), 'the Chinese article should be built');
    expect(
      !(await exists('dist/en/writing/backend-instincts-that-broke/index.html')),
      'an untranslated article must not get an English URL',
    );
    expect(
      !(await dist('writing/backend-instincts-that-broke/index.html')).includes('rel="alternate"'),
      'and must not advertise a translation it does not have',
    );

    // The same rule one level up: a topic with no English entry has no English
    // page, and neither does a series.
    expect(await exists('dist/topics/from-backend/index.html'), 'the topic exists in Chinese');
    expect(!(await exists('dist/en/topics/from-backend/index.html')), 'and not in English, where it would be empty');
    expect(
      !(await exists('dist/en/series/first-year-with-agents/index.html')),
      'a series with no English entry has no English page either',
    );

    // The feeds are per language and carry only that language.
    const feed = await dist('en/rss.xml');
    expect(feed.includes('/en/writing/retries-made-it-worse/'), 'the English feed should carry the English article');
    expect(!feed.includes('backend-instincts-that-broke'), 'and must not carry an article nobody translated');
    expect((await dist('en/llms.txt')).includes('/en/writing/retries-made-it-worse/'), 'llms.txt should be per language too');

    const result = await validate();
    expect(result.code === 0, `and the whole thing should pass the gate:\n${result.out.slice(-800)}`);
    const report = JSON.parse(await fs.readFile(path.join(root, 'validate-report.json'), 'utf8'));
    expect(report.localePrefixes.join() === 'en', `the report should record the prefixes, got ${report.localePrefixes}`);
    expect(report.errors === 0 && report.warnings === 0, 'a translated example should have no findings');
  });

  await scenario('the gate catches an hreflang pointing at a page nobody built', async () => {
    await localiseExample();
    await writeTranslation();
    expect((await build()).code === 0, 'a two-language build should succeed');
    expect((await validate()).code === 0, 'and pass, before anything is broken');

    // The translation goes away and the tags that advertised it stay: a
    // half-reverted translation, or an override computing its own alternates.
    // Both build green, and both tell a crawler an empty URL is the English
    // version of a real page.
    await fs.rm(path.join(root, 'dist/en/writing/retries-made-it-worse'), { recursive: true, force: true });

    const result = await validate();
    expect(result.code !== 0, 'an hreflang pointing at a missing page must block publishing');
    expect(result.out.includes('C-30'), `the report should name the rule:\n${result.out.slice(-800)}`);
    expect(
      result.out.includes('/en/writing/retries-made-it-worse/'),
      'and name the URL that does not exist',
    );
  });

  await scenario('untranslated copy is reported rather than shipped quietly', async () => {
    // Everything above translates the copy. This is the site that declared a
    // second language and translated nothing: it is not an error — a section
    // can go live before every string in it does — but it must not be silent.
    await loadExample();
    await edit('site/site.yaml', [['locale: zh-CN\n', 'locale: zh-CN\nlocales:\n  zh-CN: zh\n  en-US: en\n']]);
    await writeTranslation();
    expect((await build()).code === 0, 'an untranslated second language should still build');

    const result = await validate();
    expect(result.out.includes('C-31'), `the gate should report the untranslated pages:\n${result.out.slice(-800)}`);
    const report = JSON.parse(await fs.readFile(path.join(root, 'validate-report.json'), 'utf8'));
    const untranslated = report.violations.filter((item: { rule: string }) => item.rule === 'C-31');
    expect(untranslated.length > 0, 'C-31 should have found the pages whose copy never changed');
    expect(
      untranslated.every((item: { severity: string }) => item.severity === 'warn'),
      'and should warn rather than block — translating copy lands after the routing does',
    );
    // …and the pair it reports is not also reported as duplicate content.
    const duplicates = report.violations.filter((item: { rule: string }) => item.rule === 'C-14' || item.rule === 'C-15');
    expect(
      duplicates.length === 0,
      `translations are not duplicate content: ${duplicates.map((item: { file: string }) => item.file).join(', ')}`,
    );
  });

  await scenario('a mounted engine and a second language compose in that order', async () => {
    await mountExample(`{ mount: '${MOUNT}', pages: ['topics', 'series'] }`);
    await applyLocales({
      nav: [
        '      - { href: /series/, label: Series, order: 20 }',
        '      - { href: /topics/, label: Topics, order: 30 }',
      ],
    });
    await writeTranslation(MOUNT);

    const result = await build();
    expect(result.code === 0, `a mounted, translated build should succeed:\n${result.out.slice(-800)}`);

    // Mount outside, locale inside — and nothing at the origin root.
    expect(await exists(`dist${MOUNT}/index.html`), 'the default language sits at the mount root');
    expect(await exists(`dist${MOUNT}/en/index.html`), 'the other language sits one level inside it');
    expect(await exists(`dist${MOUNT}/en/writing/retries-made-it-worse/index.html`), 'and so do its articles');
    expect(!(await exists('dist/en')), 'the locale prefix must not escape the mount');
    expect(!(await exists('dist/index.html')), 'and the origin root still belongs to the host');

    const en = await dist(`${MOUNT}/en/index.html`);
    expect(en.includes('lang="en-US"'), 'the English page should declare its language');
    expect(en.includes(`href="${MOUNT}/en/writing/"`), `nav links should carry both prefixes: ${MOUNT}/en/writing/`);

    const article = await dist(`${MOUNT}/en/writing/retries-made-it-worse/index.html`);
    const canonical = /<link rel="canonical" href="([^"]+)"/.exec(article)?.[1] ?? '';
    expect(canonical.endsWith(`${MOUNT}/en/writing/retries-made-it-worse/`), `canonical should carry both: ${canonical}`);
    expect(
      article.includes(`hreflang="zh-CN" href="https://agent-notes.example.dev${MOUNT}/writing/why-retries-made-it-worse/"`),
      'and so should the hreflang pointing back at the other language',
    );

    const gate = await validate();
    expect(gate.code === 0, `a mounted, translated site should pass the gate:\n${gate.out.slice(-900)}`);
  });
  console.log('\ncustom writing voice');

  await scenario('site-specific signals fire, and are not hardcoded', async () => {
    await loadExample();
    const probe = 'content/posts/scenario-probe.mdx';
    await fs.writeFile(
      path.join(root, probe),
      `---\ntitle: 布道腔探针\ndescription: 一篇故意写成布道腔的稿子，用来验证站点自定义的风格信号会不会真的触发扣分。\nslug: scenario-probe\npubDate: 2026-08-03\ncategory: agent-architecture\ndraft: true\n---\n\n## 概述\n\nAgent 正在颠覆传统开发，带来革命性的范式转移，为团队赋能，未来已来。\n`,
    );

    const report = async () => {
      const result = await analyze(probe);
      const parsed = JSON.parse(await fs.readFile(path.join(root, 'content-report.json'), 'utf8'));
      expect(parsed.results.length === 1, `analyze should score the named draft:\n${result.out.slice(-300)}`);
      return parsed.results[0].score as number;
    };

    const withSignals = await report();

    // The control differs by exactly one thing: the site's own boosterism list
    // is emptied. Surgically deleting the rule instead would leave a half rule
    // behind and fail the voice loader — proving nothing about the signals.
    const voiceFile = path.join(root, 'site/voice.md');
    const original = await fs.readFile(voiceFile, 'utf8');
    const boosterism = /      phrases: \['颠覆'[^\n]*\n/;
    expect(boosterism.test(original), 'the example voice should declare a boosterism list');
    await fs.writeFile(voiceFile, original.replace(boosterism, "      phrases: ['zzz-absent-from-any-article']\n"));

    const withoutSignals = await report();
    expect(
      withSignals < withoutSignals,
      `the site's own signals should cost points: ${withSignals} with, ${withoutSignals} without`,
    );
  });

  await scenario('a draft is scored but never gated', async () => {
    await loadExample();
    const draft = 'content/posts/scenario-draft.mdx';
    await fs.writeFile(
      path.join(root, draft),
      `---\ntitle: 半成品\ndescription: 一篇违反多条规则的草稿，用来验证草稿不会阻断整站发布。\nslug: wrong-name-on-purpose\npubDate: 2026-08-03\ncategory: notes\ndraft: true\n---\n\n# 正文里的 H1\n\n没有任何内链。\n`,
    );
    await build();
    const result = await validate();
    expect(result.code === 0, `a draft must not block the deploy:\n${result.out.slice(-400)}`);
    expect(result.out.includes('Drafts not checked'), 'the run should report the skipped draft');
    await fs.rm(path.join(root, draft));
  });

  /**
   * A voice can state its own shape, and the shape is scored.
   *
   * The example's voice.md says "一千五到两千字" in its prose. Five articles
   * shipped at 60–80% of that with a score of 100, because the prose half is
   * read by the writing agent and only the frontmatter reaches the scorer.
   * Length, section count and list density are decidable, so they belong in the
   * half that can be checked.
   */
  await scenario('a voice can state its own shape, and it is scored', async () => {
    await loadExample();
    const voiceFile = path.join(root, 'site/voice.md');
    const read = async () => JSON.parse(await fs.readFile(path.join(root, 'content-report.json'), 'utf8'));
    const bodyWidthFindings = (report: { results: { findings: { kind: string; message: string }[] }[] }) =>
      report.results.flatMap((result) => result.findings).filter((finding) => finding.kind === 'bodyWidth');

    await edit('site/voice.md', [['  thresholds:\n', '  thresholds:\n    minBodyWidth: 99999\n']]);
    expect((await analyze()).code === 0, 'analyze never blocks');
    const report = await read();
    const flagged = bodyWidthFindings(report);
    expect(
      flagged.length === report.results.length,
      `every article should be under an impossible floor, ${flagged.length}/${report.results.length}`,
    );
    expect(flagged[0]!.message.includes('99999'), 'the finding should quote the threshold the voice declared');

    // …and stays inert when the voice states nothing, so adding this dimension
    // did not silently restate every existing site's score.
    await fs.writeFile(voiceFile, (await fs.readFile(voiceFile, 'utf8')).replace('    minBodyWidth: 99999\n', ''));
    await analyze();
    expect(bodyWidthFindings(await read()).length === 0, 'an unstated floor must not fire');
  });

  console.log('\nsite planning');

  await scenario('removing a topic in use fails the build by name', async () => {
    await loadExample();
    await edit('site/taxonomy.yaml', [
      ['  from-backend:\n    title: 后端转型\n', '  from-backend-renamed:\n    title: 后端转型\n'],
    ]);
    const result = await build();
    expect(result.code !== 0, 'a dangling taxonomy reference should fail the build');
    expect(result.out.includes('from-backend'), 'the error should name the missing topic');
  });

  await scenario('a policy threshold actually changes the gate', async () => {
    await loadExample();
    await edit('site/policy.yaml', [['  minInternalLinks: 2', '  minInternalLinks: 9']]);
    await build();
    const result = await validate();
    expect(result.code !== 0, 'raising the internal-link floor should block');
    expect(result.out.includes('at least 9'), 'the message should quote the configured floor');
  });

  /* ---------------------------------------------------------------- *
   * The content model a reader can perceive
   *
   * ADR 0007 draws the parity line at exactly that: what a reader can see, and
   * what a search engine is told about it. Every scenario here is a field an
   * author fills in, asserted against the page it is supposed to change —
   * because the defect this group exists for is the one where filling it in
   * changes nothing and the build still says green (#22, #23 §4, §5).
   * ---------------------------------------------------------------- */
  console.log('\ncontent model');

  /** The example's newest post, which is the one every listing puts first. */
  const NEWEST = 'why-retries-made-it-worse';

  /** Add frontmatter keys to an example post, above the closing `---`. */
  async function addFrontmatter(slug: string, lines: string[]) {
    const file = path.join(root, 'content/posts', `${slug}.mdx`);
    const text = await fs.readFile(file, 'utf8');
    const end = text.indexOf('\n---', 4);
    expect(end > 0, `scenario setup: no frontmatter in ${slug}.mdx`);
    await fs.writeFile(file, `${text.slice(0, end)}\n${lines.join('\n')}${text.slice(end)}`);
  }

  const head = (html: string) => html.slice(0, html.indexOf('</head>') === -1 ? html.length : html.indexOf('</head>'));
  const meta = (html: string, attribute: string, name: string) =>
    new RegExp(`<meta ${attribute}="${name}" content="([^"]*)"`).exec(html)?.[1];

  await scenario('a hero image reaches the page, with its alt text and caption', async () => {
    await loadExample();
    await addFrontmatter(NEWEST, [
      'heroImage: /content/images/hero.png',
      'heroImageAlt: 限流计数在事故当天跳满的那一分钟',
      'heroImageCaption: 限流计数比吞吐曲线早了大概九十秒。',
    ]);
    expect((await build()).code === 0, 'a hero image should build');

    const article = await dist(`writing/${NEWEST}/index.html`);
    const body = article.slice(article.indexOf('<body'));
    expect(body.includes('/content/images/hero.png'), 'the hero image should be on the page, not only in og:image');
    expect(body.includes('限流计数在事故当天跳满的那一分钟'), 'the alt text should reach the img');
    expect(body.includes('限流计数比吞吐曲线早了大概九十秒。'), 'the caption should be rendered');

    // …and C-32 agrees, which is what stops the next field from going missing.
    const result = await validate();
    const report = JSON.parse(await fs.readFile(path.join(root, 'validate-report.json'), 'utf8'));
    expect(report.errors === 0, `a rendered hero should leave the gate clean:\n${result.out.slice(-700)}`);
  });

  await scenario('a hero image with no alt text is reported', async () => {
    await loadExample();
    await addFrontmatter(NEWEST, ['heroImage: /content/images/hero.png']);
    await build();
    const result = await validate();
    // An image with no alt is an accessibility defect first and an SEO one
    // second. Ghost has feature_image_alt; a migration that drops it ships 61
    // images no screen reader can describe.
    expect(/heroImageAlt/.test(result.out), `the report should name the missing field:\n${result.out.slice(-700)}`);
  });

  await scenario('an author is shown to the reader, not only to the crawler', async () => {
    await loadExample();
    await addFrontmatter(NEWEST, ['author: 一位客座作者']);
    expect((await build()).code === 0, 'an explicit author should build');
    const article = await dist(`writing/${NEWEST}/index.html`);
    const body = article.slice(article.indexOf('<body'));
    expect(body.includes('一位客座作者'), 'the author should appear on the article, not only in JSON-LD');
  });

  await scenario('per-entry SEO overrides are what the head says', async () => {
    await loadExample();
    await addFrontmatter(NEWEST, [
      'metaTitle: 重试从 3 提到 5 的真实代价',
      'metaDescription: P99 从 2.1s 涨到 6.8s，月账单多 40 美元。完整的取舍过程。',
      'ogTitle: 一次看起来该做的调参',
      'ogDescription: 成功率涨了 3 个点，延迟涨了 4.7 秒。',
      'ogImage: /content/images/card.png',
    ]);
    expect((await build()).code === 0, 'per-entry SEO should build');

    const article = await dist(`writing/${NEWEST}/index.html`);
    const inHead = head(article);
    const title = /<title>([^<]*)<\/title>/.exec(inHead)?.[1] ?? '';
    expect(title.includes('重试从 3 提到 5 的真实代价'), `the <title> should be metaTitle, got "${title}"`);
    expect(
      meta(inHead, 'name', 'description') === 'P99 从 2.1s 涨到 6.8s，月账单多 40 美元。完整的取舍过程。',
      `the meta description should be metaDescription, got "${meta(inHead, 'name', 'description')}"`,
    );
    expect(meta(inHead, 'property', 'og:title') === '一次看起来该做的调参', 'og:title should be written for social');
    expect(
      meta(inHead, 'property', 'og:description') === '成功率涨了 3 个点，延迟涨了 4.7 秒。',
      'og:description should be written for social',
    );
    expect(
      (meta(inHead, 'property', 'og:image') ?? '').includes('/content/images/card.png'),
      'og:image should be the card, not the hero',
    );

    // The overrides are for the head. The page still says what it says.
    const body = article.slice(article.indexOf('<body'));
    expect(body.includes('把重试从 3 次提到 5 次'), 'the on-page headline must not be replaced by metaTitle');
  });

  await scenario('an entry with no overrides keeps the behaviour it had', async () => {
    await loadExample();
    expect((await build()).code === 0, 'the untouched example should build');
    const before = head(await dist(`writing/${NEWEST}/index.html`));

    // Overriding one entry must not move the head of another. This is the half
    // of an optional field that nobody writes a test for and everybody relies
    // on: absent means today's behaviour, byte for byte.
    await addFrontmatter('backend-instincts-that-broke', ['metaTitle: 转型时最先扔掉的三个直觉']);
    expect((await build()).code === 0, 'a neighbour override should build');
    const after = head(await dist(`writing/${NEWEST}/index.html`));
    expect(before === after, 'an entry with no overrides should produce the same head as before');
  });

  await scenario('featured pins an entry to the front of its list', async () => {
    await loadExample();
    expect((await build()).code === 0, 'the untouched example should build');
    const order = (html: string) =>
      [...html.matchAll(/href="\/writing\/([^"/]+)\//g)].map((match) => match[1]!);
    const before = order(await dist('writing/index.html'));
    expect(before.length >= 2, `the list needs at least two entries to have an order, got ${before.join(', ')}`);

    // Pin whichever one is *not* already leading, so the assertion measures the
    // pin rather than the sort the list happened to have. The two example posts
    // share a pubDate, so "the newest leads" is not a fact to build on.
    const pinned = before[before.length - 1]!;
    await addFrontmatter(pinned, ['featured: true']);
    expect((await build()).code === 0, 'a featured entry should build');
    const after = order(await dist('writing/index.html'));
    expect(after[0] === pinned, `featured should lead the list, got ${after[0]} (${after.join(', ')})`);
    expect(after.length === before.length, 'pinning must not add or drop entries');
  });

  /* ---------------------------------------------------------------- *
   * Tags as a taxonomy
   *
   * `tags` was four dead ends: two rows of <span>, an article:tag meta and a
   * JSON-LD keyword. A reader who saw them tried to click them. A Ghost site
   * whose posts carried two or three of them kept whichever one a migration
   * rule matched first and lost the rest. ADR 0007 puts taxonomy inside the
   * parity line, so a tag is a place now, not a decoration.
   * ---------------------------------------------------------------- */
  console.log('\ntags');

  /**
   * A tag's URL slug, declared in site/taxonomy.yaml.
   *
   * A tag is written in frontmatter as a *name* — `tags: [重试, 延迟]` — and a
   * name is not a URL. C-19 requires every URL segment to be lowercase
   * kebab-case, so a Chinese tag has no address until the site gives it one.
   * That is the one thing the site must declare; title and description stay
   * optional.
   */
  const declareTags = (yaml: string[]) => fs.appendFile(path.join(root, 'site/taxonomy.yaml'), ['', 'tags:', ...yaml, ''].join('\n'));

  await scenario('a declared tag has an archive that lists what carries it', async () => {
    await loadExample();
    // The example's newest post carries 重试 / 延迟 / 成本.
    await declareTags([
      '  重试:',
      '    slug: retries',
      '    title: 重试与退避',
      '    description: 重试次数、退避策略，以及它们在延迟和账单上各自的代价。',
      '  没人用过的:',
      '    slug: never-used',
      '    title: 没人用过的标签',
      '    description: 声明了，但没有任何一篇文章使用它。',
    ]);
    expect((await build()).code === 0, 'a site with tags should build');

    expect(await exists('dist/tags/index.html'), 'the tag index should be built');
    const archive = await dist('tags/retries/index.html');
    expect(archive.includes('把重试从 3 次提到 5 次'), 'the archive should list the entry that carries the tag');
    // Copy is the site's, the way a topic's is. Otherwise every archive is a
    // slug with a list under it, which is the thin page C-21 exists to stop.
    expect(archive.includes('重试与退避'), 'the declared title should be the page title');
    expect(archive.includes('重试次数、退避策略'), 'the declared description should reach the page');

    // …and the chip on the article is the way in. Four dead ends is what this
    // field was; a reader who sees it will try to click it.
    const article = await dist(`writing/${NEWEST}/index.html`);
    expect(/href="\/tags\/retries\/"/.test(article), 'the tag on an article should link to its archive');

    // Declared and unused is still no page: an empty archive is thin content
    // that lands in the sitemap anyway.
    expect(!(await exists('dist/tags/never-used/index.html')), 'a tag nobody uses should have no page');

    const gate = await validate();
    expect(gate.code === 0, `a site with tag archives should pass the gate:\n${gate.out.slice(-900)}`);
  });

  /**
   * A Ghost site arrives with several pages the engine's fixed list of seven
   * does not have — Privacy, Now, Uses. `site/templates/pages/` could only
   * override a route the engine already injects; a new file there produced a
   * warning and no page.
   */
  await scenario('a site can declare a page the engine does not ship', async () => {
    await loadExample();

    // A file alone is still nothing: the URL has to be declared.
    await fs.mkdir(path.join(root, 'site/templates/pages'), { recursive: true });
    await fs.writeFile(
      path.join(root, 'site/templates/pages/privacy.astro'),
      [
        '---',
        "import PageLayout from '@layouts/PageLayout.astro';",
        "import { requireOwnPage } from '@config/pages';",
        "import { localeOfPath, pagePath } from '@config/routes';",
        '',
        'const locale = localeOfPath(Astro.url.pathname);',
        "const { title, description } = requireOwnPage('privacy', locale);",
        '---',
        '',
        '<PageLayout title={title} description={description} canonical={Astro.url.pathname}>',
        '  <p>本站不收集任何个人信息，也没有接入统计脚本。评论走邮件。</p>',
        '</PageLayout>',
        '',
      ].join('\n'),
    );
    expect((await build()).code === 0, 'an undeclared template should not break the build');
    expect(!(await exists('dist/privacy')), 'a file on its own must not conjure a URL');

    await fs.appendFile(
      path.join(root, 'site/pages.yaml'),
      '\nown:\n  privacy:\n    title: 隐私\n    description: 这个站收集什么、不收集什么，以及为什么没有统计脚本。\n',
    );
    await fs.appendFile(path.join(root, 'site/site.yaml'), '  - { href: /privacy/, label: 隐私, order: 95 }\n');
    expect((await build()).code === 0, 'a declared page should build');
    const page = await dist('privacy/index.html');
    expect(page.includes('隐私'), 'the page should render its declared copy');
    expect(page.includes('rel="canonical"'), 'and it should get the engine head, not a bare document');
    // An engine route, so a nav entry naming it resolves like any other.
    expect((await dist('index.html')).includes('href="/privacy/"'), 'the nav entry should resolve');

    const gate = await validate();
    expect(gate.code === 0, `a declared page should clear the gate:\n${gate.out.slice(-900)}`);
  });

  await scenario('a declared page moves with the mount, and says so when it cannot render', async () => {
    await mountExample();
    await fs.appendFile(
      path.join(root, 'site/pages.yaml'),
      '\nown:\n  privacy:\n    title: 隐私\n    description: 这个站收集什么、不收集什么。\n',
    );

    // Declared with nothing to render it.
    const orphan = await build();
    expect(orphan.code !== 0, 'a declaration with no template should fail the build');
    expect(orphan.out.includes('privacy.astro'), `the failure should name the file it wants:\n${orphan.out.slice(-500)}`);

    await fs.mkdir(path.join(root, 'site/templates/pages'), { recursive: true });
    await fs.writeFile(
      path.join(root, 'site/templates/pages/privacy.astro'),
      [
        '---',
        "import PageLayout from '@layouts/PageLayout.astro';",
        "import { requireOwnPage } from '@config/pages';",
        "import { localeOfPath } from '@config/routes';",
        '',
        'const locale = localeOfPath(Astro.url.pathname);',
        "const { title, description } = requireOwnPage('privacy', locale);",
        '---',
        '',
        '<PageLayout title={title} description={description} canonical={Astro.url.pathname}>',
        '  <p>本站不收集任何个人信息。</p>',
        '</PageLayout>',
        '',
      ].join('\n'),
    );
    expect((await build()).code === 0, 'a mounted declared page should build');
    expect(await exists(`dist${MOUNT}/privacy/index.html`), 'the page should live inside the mount');
    expect(!(await exists('dist/privacy')), 'and nowhere at the origin root');
  });

  await scenario('a declared page cannot take a URL something else owns', async () => {
    await loadExample();
    await fs.appendFile(path.join(root, 'site/pages.yaml'), '\nown:\n  writing:\n    title: X\n    description: Y\n');
    const result = await build();
    expect(result.code !== 0, 'a page claiming a content type route should fail the build');
    expect(result.out.includes('collides with'), `the failure should say what it collides with:\n${result.out.slice(-500)}`);
  });

  /**
   * A site could always decline an engine content type and never add one.
   * The registry's own comment explained why declining had to work from
   * `site/` — "a site cannot delete a file inside node_modules" — and the same
   * sentence was true of adding, which is what this closes.
   */
  await scenario('a site can bring a content type the engine does not ship', async () => {
    await loadExample();

    await fs.mkdir(path.join(root, 'site/templates/content-types'), { recursive: true });
    await fs.writeFile(
      path.join(root, 'site/templates/content-types/notes.ts'),
      [
        "import { z } from 'astro:content';",
        "import { defineContentType } from 'aifb-engine/content-types/types';",
        "import { absoluteUrl } from 'aifb-engine/lib/seo';",
        '',
        'export default defineContentType({',
        "  name: 'notes',",
        "  card: 'ArticleCard',",
        "  detail: 'PostDetail',",
        "  sortBy: 'pubDate',",
        '  schema: z.object({',
        '    title: z.string(),',
        '    description: z.string(),',
        '    slug: z.string(),',
        '    pubDate: z.coerce.date(),',
        '    draft: z.boolean().default(false),',
        '    category: z.string(),',
        '    tags: z.array(z.string()).default([]),',
        '  }),',
        '  jsonLd: (entry, { canonical }) => [{',
        "    '@context': 'https://schema.org',",
        "    '@type': 'CreativeWork',",
        '    name: entry.data.title,',
        '    description: entry.data.description,',
        '    url: absoluteUrl(canonical),',
        '  }],',
        '});',
        '',
      ].join('\n'),
    );

    // Declared code is not published code — site/content-types.yaml still decides.
    expect((await build()).code === 0, 'a type nobody declared should simply not be published');
    expect(!(await exists('dist/notes')), 'an undeclared type must not produce pages');

    await fs.appendFile(
      path.join(root, 'site/content-types.yaml'),
      [
        '',
        'notes:',
        '  route: notes',
        '  label: Note',
        '  listTitle: Notes',
        '  listDescription: 没写成文章的东西，先记在这里，够长了再拆出去。',
        '  surfaces:',
        '    nav: 40',
        '    rss: true',
        '    llms: { limit: 6 }',
        '',
      ].join('\n'),
    );
    await fs.mkdir(path.join(root, 'content/notes'), { recursive: true });
    await fs.writeFile(
      path.join(root, 'content/notes/proxy-detection.mdx'),
      [
        '---',
        'title: 判断进程有没有走代理',
        'description: 一段用来确认某个进程到底有没有经过本地代理的排查笔记，包含两条命令和它们各自的盲区。',
        'slug: proxy-detection',
        'pubDate: 2026-03-04',
        'category: llm-reliability',
        '---',
        '',
        '先确认代理端口在听，再确认这个进程真的连上去了 —— 这两件事经常只成立一半。端口在听只说明代理还活着，',
        '不说明任何一个进程选择了它；进程建立了连接也不说明它把流量都交了出去，很多客户端只对一部分域名走代理。',
        '',
        '`lsof -nP -iTCP -sTCP:ESTABLISHED` 能看到进程当前连到哪里，但它看不到已经结束的短连接，所以对一次性的',
        '请求基本没用。抓包能看到全部，代价是要先知道抓哪张网卡，而在有虚拟网卡的机器上这一步本身就容易搞错。',
        '',
        '两条命令的盲区不一样，所以我一般两条都跑：前者确认长连接的去向，后者确认那些一闪而过的请求有没有绕过去。',
        '只跑其中一条得到的结论，我后来都推翻过至少一次。',
        '',
        '相关的排查思路写在 [重试那篇](/writing/why-retries-made-it-worse/) 里，',
        '同一个主题下的其他内容在 [可靠性与降级](/topics/llm-reliability/)。',
        '',
      ].join('\n'),
    );

    const built = await build();
    expect(built.code === 0, `a declared site type should build:\n${built.out.slice(-800)}`);
    expect(await exists('dist/notes/index.html'), 'the list page should exist');
    expect(await exists('dist/notes/proxy-detection/index.html'), 'and the detail page');
    expect((await dist('index.html')).includes('href="/notes/"'), 'and it should register itself in the nav');
    expect((await dist('rss.xml')).includes('proxy-detection'), 'a declared surface should carry its entries');

    const gate = await validate();
    expect(gate.code === 0, `a site-defined type should clear the gate:\n${gate.out.slice(-900)}`);
  });

  await scenario('a type declared in YAML with no module anywhere is still named', async () => {
    await loadExample();
    await fs.appendFile(
      path.join(root, 'site/content-types.yaml'),
      '\nrecipes:\n  route: recipes\n  label: Recipe\n  listTitle: Recipes\n  listDescription: TODO\n  surfaces:\n    rss: true\n',
    );
    const result = await build();
    expect(result.code !== 0, 'a declared type with no module should fail the build');
    expect(result.out.includes('recipes'), `the failure should name the type:\n${result.out.slice(-500)}`);
    expect(
      result.out.includes('site/templates/content-types/'),
      `and should say where a site puts its own:\n${result.out.slice(-500)}`,
    );
  });

  /* ---------------------------------------------------------------- *
   * The URL space a site chooses. See #21 and #26.
   * ---------------------------------------------------------------- */

  await scenario('a site can move its taxonomy prefixes', async () => {
    await loadExample();
    // Ghost's tag archive is /tag/{slug}/ — singular — which this engine could
    // not express, so every migrated tag URL took a redirect hop forever.
    await edit('site/taxonomy.yaml', [['pillars:', 'routes:\n  tags: tag\n  topics: topic\n\npillars:']]);
    expect((await build()).code === 0, 'a site with moved prefixes should build');

    expect(await exists('dist/tag/index.html'), 'the tag archive should be served at its new prefix');
    expect(await exists('dist/topic/index.html'), 'and so should topics');
    expect(!(await exists('dist/tags')), '/tags/ should not be built at all');
    expect(!(await exists('dist/topics')), '/topics/ should not be built at all');

    // Both halves of a page move together, or the index is at one prefix and
    // its detail pages at another.
    expect(await exists('dist/topic/llm-reliability/index.html'), 'a topic detail page should move with its archive');

    // `series` was left alone and must not have moved with them.
    expect(await exists('dist/series/index.html'), 'an archive with no routes: entry keeps its prefix');

    // The site still writes /tags/ in its nav — the key is the stable name.
    const home = await dist('index.html');
    expect(home.includes('href="/tag/"'), `the nav entry should resolve to the new prefix:\n${/<nav[\s\S]{0,400}/.exec(home)?.[0]}`);
    expect(!home.includes('href="/tags/"'), 'and must not leave a link at the old one');

    /**
     * Moving a prefix is a URL change, and the links an author already wrote
     * into an article are not the engine's to rewrite. The gate says so rather
     * than letting the site ship them — which is the whole reason a site can be
     * trusted to make this change.
     */
    const stale = await validate();
    expect(stale.code !== 0, 'links written against the old prefix should be reported');
    expect(stale.out.includes('/topics/llm-reliability/'), `the report should name the dead link:\n${stale.out.slice(-600)}`);

    for (const file of await fs.readdir(path.join(root, 'content/posts'))) {
      if (!file.endsWith('.mdx')) continue;
      const article = path.join(root, 'content/posts', file);
      await fs.writeFile(article, (await fs.readFile(article, 'utf8')).replaceAll('](/topics/', '](/topic/'));
    }
    await build();
    const gate = await validate();
    expect(gate.code === 0, `once the links follow, the site should pass:\n${gate.out.slice(-900)}`);
  });

  await scenario('two archives cannot claim one prefix', async () => {
    await loadExample();
    await edit('site/taxonomy.yaml', [['pillars:', 'routes:\n  tags: topics\n\npillars:']]);
    const result = await build();
    expect(result.code !== 0, 'two archives at one prefix should fail the build');
    expect(result.out.includes('both resolve to'), `the failure should name the collision:\n${result.out.slice(-500)}`);
  });

  /**
   * A site that publishes one content type pays for a segment that cannot
   * disambiguate anything — there is nothing else an entry could be.
   */
  await scenario('a single content type can claim the engine root', async () => {
    await loadExample();
    await onlyPosts();
    await edit('site/content-types.yaml', [['  route: writing', '  route: writing\n  routeAtRoot: true']]);

    /**
     * Claiming the root moves every entry URL, so the site's own redirect table
     * now points at pages that no longer exist. The build refuses rather than
     * shipping a redirect to a 404 — which is the guard that makes this option
     * safe to turn on, so it is asserted before the happy path.
     */
    const stale = await build();
    expect(stale.code !== 0, 'a redirect to the old URL should fail the build');
    expect(stale.out.includes('/writing/why-retries-made-it-worse/'), `the failure should name the dead target:\n${stale.out.slice(-500)}`);

    await edit('site/redirects.yaml', [['/writing/why-retries-made-it-worse/', '/why-retries-made-it-worse/']]);
    for (const file of await fs.readdir(path.join(root, 'content/posts'))) {
      if (!file.endsWith('.mdx')) continue;
      const article = path.join(root, 'content/posts', file);
      await fs.writeFile(article, (await fs.readFile(article, 'utf8')).replaceAll('](/writing/', '](/'));
    }
    expect((await build()).code === 0, 'a root-routed site should build');

    expect(await exists('dist/why-retries-made-it-worse/index.html'), 'an entry should be served at the root');
    expect(!(await exists('dist/writing/why-retries-made-it-worse')), 'and not also under its route');

    // The archive keeps its own URL: it is what nav, llms.txt and the ItemList
    // point at, and `/` is the landing page.
    expect(await exists('dist/writing/index.html'), 'the list page keeps its route');

    const article = await dist('why-retries-made-it-worse/index.html');
    const canonical = /<link rel="canonical" href="([^"]+)"/.exec(article)?.[1] ?? '';
    expect(new URL(canonical).pathname === '/why-retries-made-it-worse/', `canonical should be the root URL: ${canonical}`);

    expect((await dist('index.html')).includes('href="/why-retries-made-it-worse/"'), 'the home page should link to the root URL');
    expect((await dist('llms.txt')).includes('](/why-retries-made-it-worse/'), 'llms.txt should too');

    const gate = await validate();
    expect(gate.code === 0, `a root-routed site should pass the gate:\n${gate.out.slice(-900)}`);
  });

  await scenario('claiming the root needs there to be nothing else at it', async () => {
    // Two types published, one claiming the root: the segment is the only thing
    // telling their entries apart.
    await loadExample();
    await edit('site/content-types.yaml', [['  route: writing', '  route: writing\n  routeAtRoot: true']]);
    const shared = await build();
    expect(shared.code !== 0, 'routeAtRoot alongside another type should fail the build');
    expect(shared.out.includes('routeAtRoot'), `the failure should name the option:\n${shared.out.slice(-600)}`);

    // …and a slug that collides with a page the engine already serves.
    await loadExample();
    await onlyPosts();
    await edit('site/content-types.yaml', [['  route: writing', '  route: writing\n  routeAtRoot: true']]);
    await fs.rename(
      path.join(root, 'content/posts/why-retries-made-it-worse.mdx'),
      path.join(root, 'content/posts/series.mdx'),
    );
    await edit('content/posts/series.mdx', [['slug: why-retries-made-it-worse', 'slug: series']]);
    const collision = await build();
    expect(collision.code !== 0, 'a slug that shadows an archive should fail the build');
    expect(collision.out.includes('"series" is already'), `the failure should name the slug:\n${collision.out.slice(-600)}`);
  });

  await scenario('a tag whose name is already a slug needs no declaration', async () => {
    await loadExample();
    await edit(`content/posts/${NEWEST}.mdx`, [['tags: [重试, 延迟, 成本]', 'tags: [重试, 延迟, 成本, agent-runtime]']]);
    expect((await build()).code === 0, 'an undeclared Latin tag should build');
    const archive = await dist('tags/agent-runtime/index.html');
    expect(archive.includes('agent-runtime'), 'an undeclared tag is titled with its own name');
    expect(archive.includes('把重试从 3 次提到 5 次'), 'and still lists what carries it');
  });

  await scenario('a tag that cannot produce a URL is named, not silently dropped', async () => {
    await loadExample();
    const result = await build();
    expect(result.code === 0, 'a tag with no slug must not break the build');
    // 重试 slugifies to nothing. Failing the build would mean every existing
    // Chinese site stops deploying the day it upgrades; saying nothing would
    // mean the taxonomy is quietly half-missing, which is §6a all over again.
    expect(result.out.includes('重试'), `the build should name the tag it could not address:\n${result.out.slice(-600)}`);
    expect(result.out.includes('slug'), 'and should say what to declare');
    const article = await dist(`writing/${NEWEST}/index.html`);
    expect(!/href="\/tags\/[^"]*"[^>]*>重试/.test(article), 'a tag with no page must not be rendered as a link');
  });

  await scenario('a tag archive exists per language', async () => {
    await localiseExample();
    await writeTranslation();
    expect((await build()).code === 0, 'a two-language site with tags should build');
    // The English translation carries retries / latency / cost; the Chinese
    // original's tags have no slug, so they have no archive in either language.
    expect(await exists('dist/en/tags/retries/index.html'), 'the English tag should be under the locale prefix');
    expect(!(await exists('dist/tags/retries/index.html')), 'an English-only tag has no page in the default language');
    const gate = await validate();
    expect(gate.code === 0, `a translated site with tags should pass the gate:\n${gate.out.slice(-900)}`);
  });

  await scenario('a site that declines tags is left with no links to them', async () => {
    await loadExample();
    await declareTags(['  重试:', '    slug: retries']);
    await edit('astro.config.mjs', [
      ['    engine(),', "    engine({ pages: ['about', 'newsletter', 'series', 'topics', 'uses', 'work-with-me'] }),"],
    ]);
    // The nav is the site's own claim that a URL exists, and the whitelist has
    // just withdrawn it. Leaving the entry is a dead link the gate reports —
    // correctly, and not what this scenario is about.
    const siteYaml = path.join(root, 'site/site.yaml');
    await fs.writeFile(
      siteYaml,
      (await fs.readFile(siteYaml, 'utf8')).split('\n').filter((line) => !/href: \/tags\//.test(line)).join('\n'),
    );
    expect((await build()).code === 0, 'declining tags should build');
    expect(!(await exists('dist/tags/index.html')), 'a declined page must not be published');

    // The half that is easy to forget: the chips are still rendered, and a link
    // to a page the site declined is a 404 the gate would have to catch later.
    const article = await dist(`writing/${NEWEST}/index.html`);
    expect(!article.includes('href="/tags/'), 'nothing should link at a taxonomy the site declined');
    expect((await validate()).code === 0, 'and the site should still pass the gate');
  });

  /* ---------------------------------------------------------------- *
   * The promised imports
   *
   * ADR 0004 makes a short list of engine imports public API and says the
   * examples are what proves the promise holds. They cover cards, components
   * and a flat page — and covered neither a **detail component** nor a
   * **taxonomy archive**, which are the two overrides that need the most help
   * from the engine to clear the gate.
   *
   * These are contract tests rather than bug regressions: nothing is broken
   * today. What they buy is that a signature change to `@lib/taxonomy` or
   * `DetailProps` fails here, naming the public API, instead of failing in
   * somebody's site months later.
   * ---------------------------------------------------------------- */
  console.log('\npromised imports');

  await scenario('a site replaces a taxonomy archive using only promised imports', async () => {
    await loadExample();
    await fs.mkdir(path.join(root, 'site/templates/pages/topics'), { recursive: true });
    await fs.writeFile(
      path.join(root, 'site/templates/pages/topics/[slug].astro'),
      [
        '---',
        "import PageLayout from '@layouts/PageLayout.astro';",
        "import { homePath, localeOfPath, localeParam, localeParams, locales, pagePath, topicPath } from '@config/routes';",
        "import { topicsFor } from '@config/taxonomy';",
        "import { getActiveTopics } from '@lib/taxonomy';",
        "import { entryPath, registryFor } from '@content-types/index';",
        "import { alternatesForPath } from '@lib/alternates';",
        "import { assertSameOrigin, seoFromFields } from '@lib/seo';",
        "import { findEntries } from '@lib/content';",
        "import { cardFor } from '@lib/renderers';",
        "import { breadcrumbSchema, collectionPageSchema, itemListSchema } from '@lib/schema';",
        '',
        'export async function getStaticPaths() {',
        '  const perLocale = await Promise.all(',
        '    localeParams().map(async ({ locale, param }) =>',
        '      (await getActiveTopics(locale)).map((topic) => ({ params: { ...localeParam(param), slug: topic.slug } })),',
        '    ),',
        '  );',
        '  return perLocale.flat();',
        '}',
        '',
        'const locale = localeOfPath(Astro.url.pathname);',
        'const slug = Astro.params.slug;',
        'const topic = topicsFor(locale)[slug];',
        'const canonical = assertSameOrigin(topic.canonical, topicPath(slug, locale), `topics/${slug}`);',
        'const matches = await findEntries(registryFor(locale), (entry) => entry.data.category === slug, locale);',
        'const built = (await Promise.all(',
        '  locales.map(async (tag) => ((await getActiveTopics(tag)).some((item) => item.slug === slug) ? tag : undefined)),',
        ')).filter((tag) => tag !== undefined);',
        'const jsonLd = [',
        '  collectionPageSchema(topic.title, topic.description, canonical, locale),',
        '  itemListSchema(topic.title, matches.map(({ type, entry }) => ({',
        '    name: entry.data.title, description: entry.data.description,',
        '    url: entryPath(type, entry.data.slug, locale),',
        '  }))),',
        '  breadcrumbSchema([',
        "    { name: 'Home', url: homePath(locale) },",
        "    { name: 'Topics', url: pagePath('topics', locale) },",
        '    { name: topic.title, url: canonical },',
        '  ]),',
        '];',
        '---',
        '',
        '<PageLayout',
        '  title={topic.title}',
        '  description={topic.description}',
        '  eyebrow="Topic"',
        '  canonical={canonical}',
        '  jsonLd={jsonLd}',
        "  breadcrumbs={[{ href: pagePath('topics', locale), label: 'Topics' }, { href: canonical, label: topic.title }]}",
        '  alternates={alternatesForPath(`/topics/${slug}/`, built)}',
        '  seo={seoFromFields(topic)}',
        '  heroImage={topic.heroImage}',
        '  heroImageAlt={topic.heroImageAlt}',
        '>',
        '  <section data-item-list class="section grid two">',
        '    {matches.map(({ type, entry }) => {',
        '      const Card = cardFor(type.card);',
        '      return <Card entry={entry} type={type} headingLevel={2} />;',
        '    })}',
        '  </section>',
        '  <p data-site-topic>Rendered by the site.</p>',
        '</PageLayout>',
        '',
      ].join('\n'),
    );

    const result = await build();
    expect(result.code === 0, `a taxonomy override should build:\n${result.out.slice(-800)}`);
    const page = await dist('topics/llm-reliability/index.html');
    expect(page.includes('data-site-topic'), "the site's markup should be what shipped");

    // The point of the promised list: an override built from it clears the gate
    // without the site hand-assembling JSON-LD, breadcrumbs or the head.
    const gate = await validate();
    expect(gate.code === 0, `and should pass every rule:\n${gate.out.slice(-800)}`);
  });

  await scenario('a site replaces a detail component using only promised imports', async () => {
    await loadExample();
    await fs.mkdir(path.join(root, 'site/templates/details'), { recursive: true });
    await fs.writeFile(
      path.join(root, 'site/templates/details/PostDetail.astro'),
      [
        '---',
        "import Breadcrumbs from '@components/Breadcrumbs.astro';",
        "import { listPath } from '@content-types/index';",
        "import { localeOf } from '@lib/content';",
        "import { formatDate } from '@lib/dates';",
        "import type { DetailProps } from '@components/details/detail-props';",
        '',
        'const { entry, type, Content, canonical } = Astro.props as DetailProps;',
        'const Body = Content;',
        '---',
        '',
        '<article class="article-shell" data-site-detail>',
        '  <Breadcrumbs items={[',
        '    { href: listPath(type, localeOf(entry)), label: type.listTitle },',
        '    { href: canonical, label: entry.data.title },',
        '  ]} />',
        '  <h1>{entry.data.title}</h1>',
        '  <p>{entry.data.description}</p>',
        '  <time datetime={entry.data.pubDate.toISOString()}>{formatDate(entry.data.pubDate, localeOf(entry))}</time>',
        '  {entry.data.heroImage && <img src={entry.data.heroImage} alt={entry.data.heroImageAlt ?? ""} />}',
        '  <div class="prose"><Body /></div>',
        '</article>',
        '',
      ].join('\n'),
    );

    const result = await build();
    expect(result.code === 0, `a detail override should build:\n${result.out.slice(-800)}`);
    const article = await dist(`writing/${NEWEST}/index.html`);
    expect(article.includes('data-site-detail'), "the site's detail should be what shipped");
    expect(!article.includes('ReadingProgress'), "and the engine's should be gone");
  });

  /* ---------------------------------------------------------------- *
   * Taxonomy metadata
   *
   * An archive is a page, and until now it was the one kind of page that could
   * not write its own head: PageLayout used `title` for both the <h1> and the
   * <title>, so a topic called 可靠性与降级 had exactly that as its search
   * result and no way to say anything else.
   *
   * Shared across topics, series and tags on purpose. Ghost has one taxonomy
   * and this engine has three, so "per-tag metadata" that skipped topics would
   * mean a tag archive could set its OG image and a topic archive could not —
   * a difference nobody chose, on the two pages that sit next to each other.
   * ---------------------------------------------------------------- */
  console.log('\ntaxonomy metadata');

  /** Add keys under a term already declared in the example's taxonomy.yaml. */
  const describeTopic = (lines: string[]) =>
    edit('site/taxonomy.yaml', [
      ['  llm-reliability:\n', `  llm-reliability:\n${lines.map((line) => `    ${line}`).join('\n')}\n`],
    ]);

  await scenario('a taxonomy archive writes its own head', async () => {
    await loadExample();
    await describeTopic([
      'metaTitle: LLM 可靠性工程：超时、限流与降级',
      'metaDescription: 模型会超时、会改主意、会编。这一组文章是把它当成不确定下游服务之后的具体做法。',
      'ogTitle: 当模型开始不讲道理',
      'ogDescription: 超时、改主意、编。三种失败，三种接法。',
      'ogImage: /content/images/topic-card.png',
    ]);
    await declareTags(['  重试:', '    slug: retries', '    metaTitle: 重试策略与退避：完整取舍', '    twitterTitle: 重试翻车合集']);
    expect((await build()).code === 0, 'archive metadata should build');

    const topic = await dist('topics/llm-reliability/index.html');
    const inHead = head(topic);
    expect(
      (/<title>([^<]*)<\/title>/.exec(inHead)?.[1] ?? '').includes('LLM 可靠性工程'),
      `the <title> should be metaTitle, got "${/<title>([^<]*)<\/title>/.exec(inHead)?.[1]}"`,
    );
    expect(meta(inHead, 'property', 'og:title') === '当模型开始不讲道理', 'og:title should be the archive card');
    expect((meta(inHead, 'property', 'og:image') ?? '').includes('/content/images/topic-card.png'), 'og:image should be the declared one');
    // The overrides are for the head. The page still says what it says.
    const body = topic.slice(topic.indexOf('<body'));
    expect(body.includes('可靠性与降级'), 'the on-page H1 must stay the term title');

    const tag = head(await dist('tags/retries/index.html'));
    expect((/<title>([^<]*)<\/title>/.exec(tag)?.[1] ?? '').includes('重试策略与退避'), 'a tag archive gets the same treatment');
    expect(meta(tag, 'name', 'twitter:title') === '重试翻车合集', 'and its own twitter card');

    expect((await validate()).code === 0, 'archive metadata should pass the gate');
  });

  await scenario('a taxonomy archive can carry a feature image', async () => {
    await loadExample();
    await describeTopic([
      'heroImage: /content/images/topic-hero.png',
      'heroImageAlt: 三种失败模式在同一张时序图上的对照',
    ]);
    expect((await build()).code === 0, 'an archive feature image should build');
    const topic = await dist('topics/llm-reliability/index.html');
    const body = topic.slice(topic.indexOf('<body'));
    expect(body.includes('/content/images/topic-hero.png'), 'the feature image should be on the page');
    expect(body.includes('三种失败模式'), 'with the alt text it declared');
    expect((await validate()).code === 0, 'and should pass the gate');
  });

  await scenario('an archive canonical must stay on this origin', async () => {
    await loadExample();
    // Same rule as an entry's (C-07). An archive is where it would be easiest to
    // get wrong — pointing a topic at the "same" topic on an old domain reads
    // like tidying up and donates the page.
    await describeTopic(['canonical: https://elsewhere.example.com/topic/reliability/']);
    const result = await build();
    expect(result.code !== 0, 'a cross-origin archive canonical should fail the build');
    expect(result.out.includes('elsewhere.example.com'), `the error should name the origin:\n${result.out.slice(-500)}`);
  });

  await scenario('an archive with no metadata keeps the behaviour it had', async () => {
    await loadExample();
    expect((await build()).code === 0, 'the untouched example should build');
    const before = head(await dist('topics/llm-reliability/index.html'));

    // Describing one term must not move another's head.
    await edit('site/taxonomy.yaml', [['  from-backend:\n', '  from-backend:\n    metaTitle: 从后端到 Agent 的迁移笔记\n']]);
    expect((await build()).code === 0, 'a neighbour override should build');
    const after = head(await dist('topics/llm-reliability/index.html'));
    expect(before === after, 'an archive with no metadata should produce the same head as before');
  });

  /* ---------------------------------------------------------------- *
   * Ghost migration
   *
   * `migrate:ghost` had no coverage at all until this group existed, which is
   * how it came to read one export shape and map another. It is also the one
   * command in the pipeline whose output nobody reviews line by line — it
   * writes sixty files at once and prints a success count — so a defect in it
   * is a defect that reports itself as green. Every scenario here asserts
   * against the frontmatter it actually wrote, not against what it said.
   * ---------------------------------------------------------------- */
  console.log('\nghost migration');

  await scenario("an admin export's tags reach the migrated frontmatter", async () => {
    await loadExample();
    await loadGhostExport();
    const result = await migrateGhost();
    expect(result.code === 0, `the migration should succeed:\n${result.out.slice(-500)}`);

    const post = await migrated('the-storm-we-caused');
    expect(post !== undefined, 'the published post should have been written');
    const tags: string[] = post!.tags ?? [];
    // Both tags live in posts_tags, which is the only place an admin export
    // records them. Reading `post.tags` instead finds nothing and reports
    // success anyway — the site's whole taxonomy, dropped silently.
    expect(tags.includes('可靠性'), `expected the 可靠性 tag, got ${JSON.stringify(tags)}`);
    expect(tags.includes('Agents'), `expected the Agents tag, got ${JSON.stringify(tags)}`);
    // Ghost's internal tags are front-end-hidden by definition; migrating
    // #featured as a visible keyword publishes an editorial marker as content.
    expect(!tags.some((tag) => tag.startsWith('#')), `internal tags must not migrate: ${JSON.stringify(tags)}`);
  });

  await scenario("an admin export's per-entry SEO reaches the migrated frontmatter", async () => {
    await loadExample();
    await loadGhostExport();
    expect((await migrateGhost()).code === 0, 'the migration should succeed');

    const post = await migrated('the-storm-we-caused');
    expect(post !== undefined, 'the published post should have been written');

    /**
     * `posts_meta` is the second sibling table, and it is the same trap as
     * `posts_tags`: the Content API hands these ten fields back flattened onto
     * the post, an admin export keeps them in a table of their own, and a
     * migrator written against the first shape reads `undefined` from every
     * post in the second without failing. Ten hand-written SEO overrides,
     * dropped, with a success message.
     */
    expect(post!.metaTitle === '并发调到 32 的代价', `metaTitle should survive, got ${post!.metaTitle}`);
    expect(post!.metaDescription?.startsWith('一次看起来该做的并发调参'), 'metaDescription should survive');
    expect(post!.ogTitle === '并发从 8 提到 32，然后呢', 'ogTitle should survive');
    expect(post!.ogDescription?.startsWith('吞吐没涨'), 'ogDescription should survive');
    expect(post!.twitterTitle === '并发调参翻车实录', 'twitterTitle should survive');
    expect(post!.twitterDescription?.startsWith('8 → 32'), 'twitterDescription should survive');
    expect(post!.heroImageAlt?.includes('限流计数'), 'feature_image_alt should become heroImageAlt');
    expect(post!.heroImageCaption?.includes('14:02'), 'feature_image_caption should become heroImageCaption');
    // Legacy image URLs are rewritten wherever they appear, not only on the hero.
    expect(post!.ogImage === '/content/images/2026/03/storm-og.png', `ogImage should be local, got ${post!.ogImage}`);
    expect(post!.featured === true, 'a Ghost featured post should stay pinned');

    // `canonical_url` is on the post itself, and is the one field of the set a
    // wrong join would have found anyway. It survives while it stays on this
    // site's own origin.
    expect(
      post!.canonical === 'https://agent-notes.example.dev/writing/why-retries-made-it-worse/',
      `a same-origin canonical should survive, got ${post!.canonical}`,
    );

    /**
     * The other direction, where Ghost and this engine genuinely disagree.
     * Ghost lets a canonical point at another domain — that is how a syndicated
     * post credits where it first ran. This engine refuses one outright (C-07),
     * because the same tag on a post that was not syndicated donates its
     * ranking away. Migrating it would fail the build on a file the migration
     * wrote; dropping it silently would lose a publishing decision. So it is
     * reported, with both ways out.
     */
    const note = await migrated('an-unverified-note');
    expect(note?.canonical === undefined, `a cross-origin canonical must not be written, got ${note?.canonical}`);
    const report = await fs.readFile(path.join(root, 'migration/report.md'), 'utf8');
    expect(report.includes('https://elsewhere.example.com/the-original/'), `the report should name it:\n${report}`);
    expect(report.includes('PUBLIC_SITE_URL'), 'and should name the way out that keeps it');
  });

  await scenario('a guest author survives, and the site owner is not repeated', async () => {
    await loadExample();
    await loadGhostExport();
    expect((await migrateGhost()).code === 0, 'the migration should succeed');

    // posts_authors → users, the third sibling table. Multi-author *management*
    // is out of scope (ADR 0007) — a byline is not an author archive, and the
    // name is already rendered.
    const guest = await migrated('the-storm-we-caused');
    expect(guest?.author === '一位客座作者', `a guest byline should survive, got ${guest?.author}`);

    // The other post is by the Ghost account that owns the blog — the same
    // person site.yaml already names. `author` defaults to them and renders
    // only when stated, so writing it into every file would be 61 lines saying
    // what site.yaml says once.
    const own = await migrated('an-unverified-note');
    expect(own?.author === undefined, `the site owner should not be repeated, got ${own?.author}`);
  });

  await scenario("Ghost's tag slugs are handed over, not thrown away", async () => {
    await loadExample();
    await loadGhostExport();
    expect((await migrateGhost()).code === 0, 'the migration should succeed');

    /**
     * Ghost already knows every tag's URL slug and description — that is what
     * `/tag/{slug}/` was built from. The engine needs exactly those to give a
     * tag an archive, and a name like 可靠性 cannot produce one on its own. So
     * the migration writes the block rather than leaving the site to hand-copy
     * it out of an export it is not supposed to read.
     */
    const report = await fs.readFile(path.join(root, 'migration/report.md'), 'utf8');
    expect(report.includes('可靠性:'), `the report should offer a tags: block:\n${report}`);
    expect(report.includes('slug: reliability'), "Ghost's own slug is the one its old URLs used");
    expect(report.includes('超时、限流、降级'), "and Ghost's own tag description");
    expect(!report.includes('#featured'), 'an internal tag has no archive to declare');

    // Ghost's `tags` table carries the same metadata columns as `posts_meta`,
    // and the engine's archives now accept every one of them.
    expect(report.includes('metaTitle: 可靠性工程：超时、限流与降级'), `tag meta_title should be offered:\n${report}`);
    expect(report.includes('ogTitle: 当模型开始不讲道理'), 'and its social card');
    // accent_color is the one column left behind, and it says so rather than
    // vanishing — colour belongs to the theme, not to a five-year-old tag.
    expect(report.includes('accent_color'), `the report should say why the accent was dropped:\n${report}`);
    expect(report.includes('heroImage: /content/images/2026/02/tag-reliability.png'), 'and its feature image, rewritten local');
  });

  await scenario('what Ghost knows about the site is handed over too', async () => {
    await loadExample();
    await loadGhostExport();
    expect((await migrateGhost()).code === 0, 'the migration should succeed');

    /**
     * `settings` is the sixth table in Ghost's export allowlist, and it holds
     * the site title, description, navigation, social handles and share image
     * — all of which have a home in site/site.yaml. Discarding them left the
     * owner to retype their own nav out of a JSON dump.
     */
    const report = await fs.readFile(path.join(root, 'migration/report.md'), 'utf8');
    expect(report.includes('并发与重试笔记'), `the site title should be offered:\n${report}`);
    expect(report.includes('一个后端工程师把 LLM'), 'and the description');
    expect(report.includes('https://x.com/chenchi_dev'), 'a bare Twitter handle should become a URL');
    expect(report.includes('href: /about/'), "Ghost's navigation should become nav: entries");
    expect(report.includes('/content/images/2026/01/card.png'), 'and the share image should be rewritten local');

    // Offered, never written: site/ is the intent plane.
    const siteYaml = await fs.readFile(path.join(root, 'site/site.yaml'), 'utf8');
    expect(!siteYaml.includes('并发与重试笔记'), 'a migration must not write into site/site.yaml');
  });

  await scenario('a Ghost page is not migrated as an article', async () => {
    await loadExample();
    await loadGhostExport();
    expect((await migrateGhost()).code === 0, 'the migration should succeed');

    // Ghost keeps pages in the same table as posts, separated only by `type`.
    // Migrated as a post, About lands in the archive, the feed and the sitemap
    // as though it were an article.
    expect((await migrated('about')) === undefined, 'a type: page entry must not become a post');
    expect((await migrated('half-written')) === undefined, 'a draft must not be migrated');

    const report = await fs.readFile(path.join(root, 'migration/report.md'), 'utf8');
    expect(/page/i.test(report), `the report should account for the skipped page:\n${report}`);
  });

  await scenario('which keyword means which category is a site decision', async () => {
    await loadExample();
    await loadGhostExport();
    // The mapping is site intent, so it belongs in site/. Held in
    // packages/cli/src/category-map.ts it is unreachable from a site running a
    // published aifb-cli, which gets the fallback category for every post.
    //
    // The rule deliberately matches a *tag name* and nothing else: neither the
    // title nor the slug contains it, so this passes only if the tags were
    // read.
    await fs.writeFile(
      path.join(root, 'site/migration.yaml'),
      [
        '# Keyword → category mapping for `pnpm migrate:ghost`.',
        'fallbackCategory: notes',
        'rules:',
        '  - match: [可靠性]',
        '    category: llm-reliability',
        '',
      ].join('\n'),
    );
    const result = await migrateGhost();
    expect(result.code === 0, `the migration should succeed:\n${result.out.slice(-500)}`);

    const mapped = await migrated('the-storm-we-caused');
    expect(mapped?.category === 'llm-reliability', `expected the mapped category, got ${mapped?.category}`);

    // The other direction: a rule that fires on everything is worth nothing.
    const unmapped = await migrated('an-unverified-note');
    expect(unmapped?.category === 'notes', `expected the fallback category, got ${unmapped?.category}`);
    const report = await fs.readFile(path.join(root, 'migration/report.md'), 'utf8');
    expect(/unmapped/i.test(report), `the report should name what matched nothing:\n${report}`);
  });

  await scenario('a migrated site clears the gate', async () => {
    await loadExample();
    await loadGhostExport();
    expect((await migrateGhost()).code === 0, 'the migration should succeed');
    const built = await build();
    expect(built.code === 0, `the migrated site should build:\n${built.out.slice(-900)}`);
    const result = await validate();
    const report = JSON.parse(await fs.readFile(path.join(root, 'validate-report.json'), 'utf8'));
    expect(report.errors === 0, `a migration that does not clear the gate has not migrated:\n${result.out.slice(-900)}`);
  });

  console.log('\ndeployment');

  await scenario('a redirect to a missing page fails the build', async () => {
    await loadExample();
    await edit('site/redirects.yaml', [['    to: /writing/why-retries-made-it-worse/', '    to: /writing/deleted/']]);
    const result = await build();
    expect(result.code !== 0, 'a dead redirect target should fail the build');
    expect(result.out.includes('two hops'), 'the error should explain why it matters');
  });

  await scenario('production emits redirects, headers and a sitemap', async () => {
    await loadExample();
    expect((await build()).code === 0, 'production build should succeed');
    const dist = (file: string) => fs.readFile(path.join(root, 'dist', file), 'utf8');
    expect((await dist('_redirects')).includes('301'), '_redirects should carry the rules');
    expect((await dist('_headers')).includes('immutable'), '_headers should cache hashed assets');
    expect((await dist('robots.txt')).includes('Allow: /'), 'production robots should allow crawling');
    await fs.access(path.join(root, 'dist/sitemap-index.xml'));
  });

  await scenario('preview is noindex, sitemap-free and disallowed', async () => {
    await loadExample();
    expect((await build({ DEPLOY_CONTEXT: 'preview' })).code === 0, 'preview build should succeed');
    const html = await fs.readFile(path.join(root, 'dist/index.html'), 'utf8');
    const robots = await fs.readFile(path.join(root, 'dist/robots.txt'), 'utf8');
    expect(html.includes('noindex'), 'every preview page must be noindex');
    expect(robots.includes('Disallow: /'), 'preview robots must disallow');
    const sitemap = await fs
      .access(path.join(root, 'dist/sitemap-index.xml'))
      .then(() => true)
      .catch(() => false);
    expect(!sitemap, 'a preview must not ship a sitemap that contradicts its meta tags');
  });
} finally {
  await restore();
}

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

const failed = results.filter((result) => !result.ok);
console.log('');
for (const result of failed) console.log(`✗ ${result.name}\n    ${result.detail}`);
console.log(
  `${results.length - failed.length}/${results.length} scenario(s) passed` +
    (skipped > 0 ? `, ${skipped} skipped by --only ${only}.` : '.'),
);
process.exit(failed.length > 0 ? 1 : 0);

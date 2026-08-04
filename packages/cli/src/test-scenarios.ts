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

const run = promisify(execFile);
const root = process.cwd();
const SNAPSHOT = path.join(root, '.scenario-snapshot');
const MUTABLE = ['site', 'content', 'public', '.github/workflows/cloudflare-pages.yml'];

/** The path data in the mark this framework ships; mirrors src/brand.ts. */
const FRAMEWORK_MARK = 'M17 19h31L27 45h21';

type Result = { name: string; ok: boolean; detail?: string };
const results: Result[] = [];

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

const build = (env: Record<string, string> = {}) => sh('pnpm', ['build'], env);
const validate = () => sh('pnpm', ['validate']);
const analyze = (target?: string) => sh('pnpm', ['analyze', ...(target ? [target] : [])]);

async function cp(from: string, to: string) {
  await fs.rm(to, { recursive: true, force: true });
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
 * Each scenario mutates real files, so each one restores the snapshot on its
 * way out — pass or fail. Without that a failing scenario leaves the site in a
 * broken state and every scenario after it fails for the wrong reason, which is
 * exactly how a harness starts lying about where the defect is.
 */
async function scenario(name: string, body: () => Promise<void>) {
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
console.log(`${results.length - failed.length}/${results.length} scenario(s) passed.`);
process.exit(failed.length > 0 ? 1 : 0);

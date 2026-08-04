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
// astro.config.mjs is in here because the mount scenarios change the one line a
// site owner would change — `engine({ mount })`. Driving the option through the
// real config is the difference between testing the feature and testing a
// private helper that happens to agree with it.
const MUTABLE = ['site', 'content', 'public', 'astro.config.mjs', '.github/workflows/cloudflare-pages.yml'];

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
  const exists = (relative: string) => fs.access(path.join(root, relative)).then(() => true).catch(() => false);
  const dist = (file: string) => fs.readFile(path.join(root, 'dist', file), 'utf8');

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
      .filter((line) => !/href: \/(about|work-with-me|uses|newsletter)\//.test(line))
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

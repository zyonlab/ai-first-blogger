/**
 * Proves every rule actually fires.
 *
 * A validation suite that reports zero errors is indistinguishable from one
 * that is silently broken. This feeds each rule a synthetic violation and
 * asserts it is caught, plus a clean fixture and asserts it is not.
 *
 *   pnpm validate:self-test
 */
import { contentRules } from './rules/content';
import { linkRules } from './rules/links';
import { localeRules } from './rules/locale';
import { sourceLinkRules } from './rules/links-source';
import { seoRules } from './rules/seo';
import { typographyRules } from './rules/typography';
import { onPageRules } from './rules/onpage';
import { qualityRules, styleFloorViolations } from './rules/quality';
import { colourScanTargets, hardcodedColours, missingTokens, themeFiles, themeRules } from './rules/theme';
import type { BuiltPage, Rule, RuleContext, SourceEntry } from './types';

const rules: Rule[] = [...contentRules, ...seoRules, ...linkRules, ...localeRules, ...themeRules, ...onPageRules, ...typographyRules, ...sourceLinkRules, ...qualityRules];
const ORIGIN = 'https://example.test';

function entry(overrides: Partial<SourceEntry> = {}): SourceEntry {
  return {
    file: 'content/posts/good-post.mdx',
    type: 'posts',
    data: { title: 'Good', description: 'Good description', slug: 'good-post' },
    body: '## Section\n\nSee [topic](/topics/a/) and [other](/writing/b/).\n',
    frontmatterLines: { title: 2, description: 3, slug: 4 },
    ...overrides,
  };
}

type PageOverrides = Partial<{
  title: string;
  description: string;
  image: string;
  canonical: string;
  body: string;
  intro: string;
  breadcrumbSchema: boolean;
  breadcrumbMarkup: boolean;
  /** `<html lang>`, which is what tells the duplicate rules two pages differ. */
  lang: string;
  /** hreflang alternates, as paths. `x-default` is derived from `xDefault`. */
  alternates: { hreflang: string; href: string }[];
  xDefault: string;
}>;

function page(url: string, overrides: PageOverrides = {}): BuiltPage {
  const {
    title = 'A reasonable page title',
    description = 'x'.repeat(130),
    image = `${ORIGIN}/og-default.png`,
    canonical = `${ORIGIN}${url}`,
    body = '',
    intro = 'An introduction long enough to clear the listing-intro threshold in policy.',
    breadcrumbSchema = false,
    breadcrumbMarkup = false,
    lang = 'zh-CN',
    alternates = [],
    xDefault,
  } = overrides;

  const isDetail = url.split('/').filter(Boolean).length >= 2 && !url.startsWith('/topics/') && !url.startsWith('/series/');
  const schema =
    (breadcrumbSchema ? '<script type="application/ld+json">{"@type":"BreadcrumbList"}</script>' : '') +
    (isDetail ? '<script type="application/ld+json">{"@type":"Article"}</script>' : '');
  const markup = breadcrumbMarkup ? '<nav class="breadcrumbs"></nav>' : '';
  const hreflang =
    alternates
      .map((item) => `<link rel="alternate" hreflang="${item.hreflang}" href="${ORIGIN}${item.href}">`)
      .join('') +
    (xDefault ? `<link rel="alternate" hreflang="x-default" href="${ORIGIN}${xDefault}">` : '');

  return {
    url,
    file: `dist${url}index.html`,
    html: `<html lang="${lang}"><title>${title}</title><meta name="description" content="${description}"><meta property="og:image" content="${image}"><link rel="canonical" href="${canonical}">${hreflang}${schema}${markup}<main><h1>${title}</h1><p>${intro}</p>${body}</main>`,
  };
}

/**
 * A pair of pages that are each other's translation: same title and
 * description, different `lang`, reciprocal hreflang. This is the shape C-14
 * and C-15 must *not* report and C-31 must.
 */
function translationPair(path: string, prefix: string, overrides: PageOverrides = {}) {
  const alternates = [
    { hreflang: 'zh-CN', href: path },
    { hreflang: 'en-US', href: `/${prefix}${path}` },
  ];
  return [
    page(path, { ...overrides, lang: 'zh-CN', alternates, xDefault: path }),
    page(`/${prefix}${path}`, { ...overrides, lang: 'en-US', alternates, xDefault: path }),
  ];
}

function ctx(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    entries: [entry()],
    pages: [page('/')],
    hasBuild: true,
    siteOrigin: ORIGIN,
    mount: '',
    localePrefixes: [],
    defaultLocale: 'zh-CN',
    ...overrides,
  };
}

/** For each rule: a context that must trip it, and one that must not. */
const cases: Record<string, { bad: RuleContext; good: RuleContext }> = {
  'C-01': {
    bad: ctx({ pages: [page('/', { image: `${ORIGIN}/favicon.svg` })] }),
    good: ctx(),
  },
  'C-02': {
    bad: ctx({ entries: [entry({ body: 'No links at all.\n' })] }),
    good: ctx(),
  },
  'C-03': {
    bad: ctx({ pages: [page('/', { body: '<a href="/missing/">gone</a>' })] }),
    good: ctx({ pages: [page('/', { body: '<a href="/about/">ok</a>' }), page('/about/')] }),
  },
  'C-04': {
    bad: ctx({ pages: [page('/'), page('/lonely/')] }),
    good: ctx({ pages: [page('/', { body: '<a href="/lonely/">x</a>' }), page('/lonely/')] }),
  },
  'C-05': {
    bad: ctx({ pages: [page('/', { title: 'A'.repeat(80) })] }),
    good: ctx(),
  },
  'C-06': {
    bad: ctx({ pages: [page('/', { description: 'too short' })] }),
    good: ctx(),
  },
  'C-07': {
    bad: ctx({ pages: [page('/', { canonical: 'https://someone-else.example/' })] }),
    good: ctx(),
  },
  'C-08': {
    bad: ctx({ entries: [entry({ file: 'content/posts/mismatch.mdx' })] }),
    good: ctx(),
  },
  'C-09': {
    bad: ctx({ entries: [entry({ body: '## Two\n\n#### Four\n\n[a](/x/) [b](/y/)\n' })] }),
    good: ctx(),
  },
  'C-10': {
    bad: ctx({ pages: [page('/writing/post/', { breadcrumbSchema: true, breadcrumbMarkup: false })] }),
    good: ctx({ pages: [page('/writing/post/', { breadcrumbSchema: true, breadcrumbMarkup: true })] }),
  },
  'C-11': {
    bad: ctx({ entries: [entry({ data: { slug: 'good-post', title: 'Good' } })] }),
    good: ctx(),
  },
  'C-14': {
    bad: ctx({ pages: [page('/a/'), page('/b/')] }),
    good: ctx({ pages: [page('/a/', { title: 'One' }), page('/b/', { title: 'Two' })] }),
  },
  'C-15': {
    bad: ctx({ pages: [page('/a/', { title: 'One' }), page('/b/', { title: 'Two' })] }),
    good: ctx({
      pages: [
        page('/a/', { title: 'One', description: 'a'.repeat(130) }),
        page('/b/', { title: 'Two', description: 'b'.repeat(130) }),
      ],
    }),
  },
  'C-16': {
    bad: ctx({ pages: [page('/', { body: '<h1>second</h1>' })] }),
    good: ctx(),
  },
  'C-17': {
    bad: ctx({ pages: [page('/', { body: '<img src="/x.png">' })] }),
    good: ctx({ pages: [page('/', { body: '<img src="/x.png" alt="something">' })] }),
  },
  'C-18': {
    bad: ctx({ pages: [page('/', { body: '<a href="/x/">点击这里</a>' })] }),
    good: ctx({ pages: [page('/', { body: '<a href="/x/">Vue 响应式原理</a>' })] }),
  },
  // The `good` case keeps a fragment link on purpose: `href="#main"` is the skip
  // link every page carries, and a rule that flagged it would fire everywhere.
  'C-28': {
    bad: ctx({ pages: [page('/', { body: '<a>YouTube</a>' })] }),
    good: ctx({ pages: [page('/', { body: '<a href="#main">Skip</a><a href="/x/">Writing</a>' })] }),
  },
  'C-29': {
    bad: ctx({ pages: [page('/', { body: '<h1>Writing</h1><h3>An article</h3>' })] }),
    good: ctx({ pages: [page('/', { body: '<h1>Writing</h1><h2>An article</h2><h3>A detail</h3>' })] }),
  },
  'C-19': {
    bad: ctx({ pages: [page('/Writing_Posts/')] }),
    good: ctx({ pages: [page('/writing-posts/')] }),
  },
  'C-20': {
    bad: ctx({
      pages: [
        page('/secret/', { body: '<meta name="robots" content="noindex">' }),
        { url: '/sitemap-0.xml', file: 'dist/sitemap-0.xml', html: `<loc>${ORIGIN}/secret/</loc>` },
      ],
    }),
    good: ctx({
      pages: [
        page('/secret/', { body: '<meta name="robots" content="noindex">' }),
        { url: '/sitemap-0.xml', file: 'dist/sitemap-0.xml', html: `<loc>${ORIGIN}/</loc>` },
      ],
    }),
  },
  'C-21': {
    bad: ctx({ pages: [page('/writing/', { intro: 'too short' })] }),
    good: ctx({ pages: [page('/writing/')] }),
  },
  'C-22': {
    bad: ctx({
      pages: [
        page('/writing/', {
          body: '<section data-item-list><article>one</article></section><script type="application/ld+json">{"@type":"ItemList","itemListElement":[1,2,3]}</script>',
        }),
      ],
    }),
    good: ctx({
      pages: [
        page('/writing/', {
          body: '<section data-item-list><article>one</article></section><script type="application/ld+json">{"@type":"ItemList","itemListElement":[1]}</script>',
        }),
      ],
    }),
  },
  'C-26': {
    bad: ctx({ entries: [entry({ body: '## S\n\n太短了。[a](/x/) [b](/y/)\n' })] }),
    good: ctx({
      entries: [entry({ body: `## S\n\n${'这是一段足够长的正文，用来说明问题、代价和取舍。'.repeat(12)}\n\n[a](/x/) [b](/y/)\n` })],
    }),
  },
  'C-25': {
    bad: ctx({ entries: [entry({ body: 'See [gone](/topics/does-not-exist/) and [b](/writing/x/).\n' })] }),
    good: ctx({ entries: [entry({ body: 'See [about](/about/) and [series index](/series/).\n' })] }),
  },
  'C-24': {
    bad: ctx({ entries: [entry({ body: '## S\n\n这是一个test测试,标点不对。[a](/x/) [b](/y/)\n' })] }),
    good: ctx({ entries: [entry({ body: '## S\n\n这是一个 test 测试，标点正确。[a](/x/) [b](/y/)\n' })] }),
  },
  'C-23': {
    bad: ctx({ pages: [{ url: '/writing/post/', file: 'dist/writing/post/index.html', html: '<main><h1>t</h1></main>' }] }),
    good: ctx({ pages: [page('/writing/post/')] }),
  },
  'C-30': {
    bad: ctx({
      pages: [
        page('/writing/post/', {
          lang: 'zh-CN',
          alternates: [
            { hreflang: 'zh-CN', href: '/writing/post/' },
            { hreflang: 'en-US', href: '/en/writing/post/' },
          ],
          xDefault: '/writing/post/',
        }),
      ],
    }),
    good: ctx({ pages: translationPair('/writing/post/', 'en') }),
  },
  'C-31': {
    bad: ctx({ pages: translationPair('/writing/post/', 'en') }),
    good: ctx({
      pages: [
        ...translationPair('/writing/post/', 'en'),
        // Same pair, actually translated: the titles differ, so nothing to say.
      ].map((item, index) =>
        index === 1
          ? { ...item, html: item.html.replace('<title>A reasonable page title</title>', '<title>Translated at last</title>') }
          : item,
      ),
    }),
  },
};

/**
 * C-12 and C-13 read real trees — `site/themes/`, and the installed engine
 * wherever module resolution puts it — rather than the synthetic context, so
 * they are checked against the repository instead of a fixture.
 *
 * "No violations in the repository" was the whole of that check, and it is
 * exactly what a broken rule reports. C-13 spent every release scanning zero
 * files, because its paths only existed in this repository's own layout, and
 * this line printed a ✓ for it each time. So each one now has to show its
 * inputs and answer a planted violation: the files it looked at, one text it
 * must flag, and one it must not.
 */
const FILESYSTEM_RULES: Record<string, () => Promise<{ scanned: string[]; caught: number; clean: number }>> = {
  'C-12': async () => {
    const full = { base: new Set(['--fg', '--bg']), alternate: new Set(['--fg']) };
    const partial = { base: new Set(['--fg']), alternate: new Set<string>() };
    return {
      // An unreadable directory is C-12's own violation to report; here it is
      // simply nothing scanned, which fails this check on its own.
      scanned: (await themeFiles().catch(() => [])).map((file) => `site/themes/${file}`),
      caught: missingTokens(full, partial).length,
      clean: missingTokens(full, full).length,
    };
  },
  'C-13': async () => {
    const target = { file: 'fixture.css', absolute: '', kind: 'css' as const };
    return {
      scanned: (await colourScanTargets()).targets.map((item) => item.file),
      caught: hardcodedColours('.a { color: #ff0044; }', target).length,
      clean: hardcodedColours('.a { color: var(--fg, #ff0044); }', target).length,
    };
  },
};

/**
 * C-27 is off unless the site sets a floor, so `run` against the default policy
 * can never trip it. Its decision is exported separately for exactly this:
 * a rule the self-test cannot exercise is a rule nobody has checked.
 */
const POLICY_GATED: Record<string, () => { caught: number; clean: number }> = {
  'C-27': () => {
    const boosterism = '## S\n\n本文目标是全面解析。让我们一起来看，这是最佳实践。\n';
    const grounded = `## S\n\n${'我在一次线上排查里发现，代价是延迟涨了 300ms，取舍并不划算。'.repeat(6)}\n`;
    return {
      caught: styleFloorViolations([{ file: 'content/posts/bad.mdx', body: boosterism }], 90, 'warn').length,
      clean: styleFloorViolations([{ file: 'content/posts/good.mdx', body: grounded }], 40, 'warn').length,
    };
  },
};


let failures = 0;

for (const rule of rules.sort((a, b) => a.id.localeCompare(b.id))) {
  const filesystem = FILESYSTEM_RULES[rule.id];
  if (filesystem) {
    const found = await rule.run(ctx());
    const { scanned, caught, clean } = await filesystem();
    const ok = found.length === 0 && scanned.length > 0 && caught > 0 && clean === 0;

    console.log(
      `${ok ? '✓' : '✗'} ${rule.id} ${rule.title} (filesystem rule, ${scanned.length} file(s) scanned, ${found.length} issue(s) in repo)`,
    );
    if (scanned.length === 0) console.log('    read no files at all — a pass from this run would mean nothing');
    if (caught === 0) console.log('    did not flag a known violation');
    if (clean > 0) console.log('    false positive on clean input');
    for (const item of found) console.log(`    ${item.file} — ${item.message}`);
    if (!ok) failures += 1;
    continue;
  }

  const gated = POLICY_GATED[rule.id];
  if (gated) {
    const { caught, clean } = gated();
    const ok = caught > 0 && clean === 0;
    console.log(`${ok ? '✓' : '✗'} ${rule.id} ${rule.title} (policy-gated; exercised with an explicit threshold)`);
    if (!ok) failures += 1;
    continue;
  }

  const scenario = cases[rule.id];
  if (!scenario) {
    console.log(`✗ ${rule.id} ${rule.title}: no self-test case defined`);
    failures += 1;
    continue;
  }

  const caught = (await rule.run(scenario.bad)).filter((item) => item.rule === rule.id);
  const clean = (await rule.run(scenario.good)).filter((item) => item.rule === rule.id);

  if (caught.length === 0) {
    console.log(`✗ ${rule.id} ${rule.title}: did not flag a known violation`);
    failures += 1;
  } else if (clean.length > 0) {
    console.log(`✗ ${rule.id} ${rule.title}: false positive on clean input — ${clean[0]!.message}`);
    failures += 1;
  } else {
    console.log(`✓ ${rule.id} ${rule.title}`);
  }
}

/* ------------------------------------------------------------------ *
 * Mounted engine.
 *
 * Everything above is exercised at the origin root. A mounted engine
 * (`engine({ mount: '/zh/blog' })`) is the same site a few directories
 * deeper, and the rules that read meaning out of URL shape — one segment is
 * a listing page, two is a detail page, `/` is the home page — measure from
 * the engine's root rather than the origin's.
 *
 * A rule that forgot to subtract the prefix would not fail here by
 * erroring: it would file every listing page as a detail page and quietly
 * stop checking what it was written for. So each case states which
 * direction it is proving — the defect is still caught, or the correct
 * mounted page is still passed.
 * ------------------------------------------------------------------ */

const MOUNT = '/zh/blog';
const byId = new Map(rules.map((rule) => [rule.id, rule]));

type MountCase = { rule: string; what: string; expect: 'fires' | 'silent'; ctx: RuleContext };

const mountCases: MountCase[] = [
  {
    rule: 'C-03',
    what: 'a link that forgot the prefix is caught, and the message offers the prefixed URL',
    expect: 'fires',
    ctx: ctx({ mount: MOUNT, pages: [page(`${MOUNT}/`, { body: '<a href="/writing/x/">x</a>' }), page(`${MOUNT}/writing/x/`)] }),
  },
  {
    rule: 'C-04',
    what: 'the mount root is the home page, not an orphan',
    expect: 'silent',
    ctx: ctx({ mount: MOUNT, pages: [page(`${MOUNT}/`, { body: `<a href="${MOUNT}/writing/">x</a>` }), page(`${MOUNT}/writing/`)] }),
  },
  {
    rule: 'C-04',
    what: 'a mounted page nothing links to is still an orphan',
    expect: 'fires',
    ctx: ctx({ mount: MOUNT, pages: [page(`${MOUNT}/`), page(`${MOUNT}/lonely/`)] }),
  },
  {
    rule: 'C-10',
    what: 'a mounted listing page carries breadcrumb schema without a trail',
    expect: 'silent',
    ctx: ctx({ mount: MOUNT, pages: [page(`${MOUNT}/writing/`, { breadcrumbSchema: true, breadcrumbMarkup: false })] }),
  },
  {
    rule: 'C-10',
    what: 'a mounted detail page without the trail it declares',
    expect: 'fires',
    ctx: ctx({ mount: MOUNT, pages: [page(`${MOUNT}/writing/post/`, { breadcrumbSchema: true, breadcrumbMarkup: false })] }),
  },
  {
    rule: 'C-19',
    what: 'the mount does not count toward the URL depth the site chose',
    expect: 'silent',
    ctx: ctx({ mount: MOUNT, pages: [page(`${MOUNT}/writing/post/`)] }),
  },
  {
    rule: 'C-19',
    what: 'a mounted URL segment that is not kebab-case',
    expect: 'fires',
    ctx: ctx({ mount: MOUNT, pages: [page(`${MOUNT}/Writing_Posts/`)] }),
  },
  {
    rule: 'C-20',
    what: 'a mounted noindex page listed in the sitemap',
    expect: 'fires',
    ctx: ctx({
      mount: MOUNT,
      pages: [
        page(`${MOUNT}/secret/`, { body: '<meta name="robots" content="noindex">' }),
        { url: '/sitemap-0.xml', file: 'dist/sitemap-0.xml', html: `<loc>${ORIGIN}${MOUNT}/secret/</loc>` },
      ],
    }),
  },
  {
    rule: 'C-20',
    what: 'a mounted noindex page kept out of the sitemap',
    expect: 'silent',
    ctx: ctx({
      mount: MOUNT,
      pages: [
        page(`${MOUNT}/secret/`, { body: '<meta name="robots" content="noindex">' }),
        { url: '/sitemap-0.xml', file: 'dist/sitemap-0.xml', html: `<loc>${ORIGIN}${MOUNT}/</loc>` },
      ],
    }),
  },
  {
    rule: 'C-21',
    what: 'a mounted listing page is still asked to introduce its subject',
    expect: 'fires',
    ctx: ctx({ mount: MOUNT, pages: [page(`${MOUNT}/writing/`, { intro: 'too short' })] }),
  },
  {
    rule: 'C-22',
    what: 'a mounted listing page whose ItemList does not match what it renders',
    expect: 'fires',
    ctx: ctx({
      mount: MOUNT,
      pages: [
        page(`${MOUNT}/writing/`, {
          body: '<section data-item-list><article>one</article></section><script type="application/ld+json">{"@type":"ItemList","itemListElement":[1,2,3]}</script>',
        }),
      ],
    }),
  },
  {
    rule: 'C-23',
    what: 'a mounted listing page is not mistaken for an untyped detail page',
    expect: 'silent',
    ctx: ctx({
      mount: MOUNT,
      pages: [{ url: `${MOUNT}/writing/`, file: `dist${MOUNT}/writing/index.html`, html: '<main><h1>t</h1></main>' }],
    }),
  },
  {
    rule: 'C-25',
    what: 'a link to the host site outside the mount is not this rule\'s to judge',
    expect: 'silent',
    ctx: ctx({ mount: MOUNT, entries: [entry({ body: 'See [privacy](/privacy/) and [terms](/terms/).\n' })] }),
  },
  {
    rule: 'C-25',
    what: 'a link inside the mount that resolves to nothing',
    expect: 'fires',
    ctx: ctx({ mount: MOUNT, entries: [entry({ body: `See [gone](${MOUNT}/not-a-section/) here.\n` })] }),
  },
];

console.log('');
console.log('mounted engine (mount: /zh/blog)');

for (const item of mountCases) {
  const rule = byId.get(item.rule)!;
  const found = (await rule.run(item.ctx)).filter((violation) => violation.rule === item.rule);
  const ok = item.expect === 'fires' ? found.length > 0 : found.length === 0;
  console.log(`${ok ? '✓' : '✗'} ${item.rule} ${item.what}`);
  if (!ok) {
    console.log(`    expected the rule to ${item.expect === 'fires' ? 'fire' : 'stay quiet'}${found[0] ? ` — got "${found[0].message}"` : ''}`);
    failures += 1;
  }
}

// The prefixed suggestion is the whole value of C-03 under a mount: without it
// the report says "not a built page" about a link that is one prefix away.
const mountedHint = (await byId.get('C-03')!.run(mountCases[0]!.ctx)).find((violation) => violation.rule === 'C-03');
if (!mountedHint?.fix.includes(`${MOUNT}/writing/x/`)) {
  console.log('✗ C-03 does not offer the mounted URL a content link should have used');
  failures += 1;
}

/* ------------------------------------------------------------------ *
 * Translated site.
 *
 * The same argument as the mounted block above, one segment further in.
 * A site with `locales:` serves the default language at the root and
 * every other behind a prefix, so `/en/writing/` is a listing page and
 * `/en/` is a home page — and a rule that counts from the origin files
 * both one level too deep and stops checking that language entirely.
 *
 * Two of these are not about URL shape at all. They are the pair of
 * claims that make a translated site correct rather than merely built:
 * the Chinese and English versions of one article are not duplicate
 * content, and an article that exists in one language must not advertise
 * a version that does not exist. Both build green either way.
 * ------------------------------------------------------------------ */

const PREFIXES = ['en'];

type LocaleCase = { rule: string; what: string; expect: 'fires' | 'silent'; ctx: RuleContext };

const localised = (overrides: Partial<RuleContext>) =>
  ctx({ localePrefixes: PREFIXES, defaultLocale: 'zh-CN', ...overrides });

const localeCases: LocaleCase[] = [
  {
    rule: 'C-04',
    what: "a language's own root is a home page, not an orphan",
    expect: 'silent',
    ctx: localised({
      pages: [page('/', { body: '<a href="/en/">EN</a>' }), page('/en/', { title: 'EN home', lang: 'en-US' })],
    }),
  },
  {
    rule: 'C-04',
    what: 'a translated page nothing links to is still an orphan',
    expect: 'fires',
    ctx: localised({ pages: [page('/'), page('/en/lonely/', { title: 'Lonely', lang: 'en-US' })] }),
  },
  {
    rule: 'C-10',
    what: 'a translated listing page carries breadcrumb schema without a trail',
    expect: 'silent',
    ctx: localised({
      pages: [page('/en/writing/', { title: 'Writing', lang: 'en-US', breadcrumbSchema: true, breadcrumbMarkup: false })],
    }),
  },
  {
    rule: 'C-10',
    what: 'a translated detail page without the trail it declares',
    expect: 'fires',
    ctx: localised({
      pages: [page('/en/writing/post/', { title: 'Post', lang: 'en-US', breadcrumbSchema: true, breadcrumbMarkup: false })],
    }),
  },
  {
    rule: 'C-19',
    what: 'the locale prefix does not count toward the URL depth the site chose',
    expect: 'silent',
    ctx: localised({ pages: [page('/en/writing/post/', { title: 'Post', lang: 'en-US' })] }),
  },
  {
    rule: 'C-19',
    what: 'a translated URL segment that is not kebab-case',
    expect: 'fires',
    ctx: localised({ pages: [page('/en/Writing_Posts/', { title: 'Posts', lang: 'en-US' })] }),
  },
  {
    rule: 'C-21',
    what: 'a translated listing page is still asked to introduce its subject',
    expect: 'fires',
    ctx: localised({ pages: [page('/en/writing/', { title: 'Writing', lang: 'en-US', intro: 'too short' })] }),
  },
  {
    rule: 'C-22',
    what: 'a translated listing page whose ItemList does not match what it renders',
    expect: 'fires',
    ctx: localised({
      pages: [
        page('/en/writing/', {
          title: 'Writing',
          lang: 'en-US',
          body: '<section data-item-list><article>one</article></section><script type="application/ld+json">{"@type":"ItemList","itemListElement":[1,2,3]}</script>',
        }),
      ],
    }),
  },
  {
    rule: 'C-23',
    what: 'a translated listing page is not mistaken for an untyped detail page',
    expect: 'silent',
    ctx: localised({
      pages: [{ url: '/en/writing/', file: 'dist/en/writing/index.html', html: '<html lang="en-US"><main><h1>t</h1></main>' }],
    }),
  },
  {
    rule: 'C-14',
    what: 'the two language versions of one page are not duplicate titles',
    expect: 'silent',
    ctx: localised({ pages: translationPair('/writing/post/', 'en') }),
  },
  {
    rule: 'C-14',
    what: 'two pages in the same language with one title are still duplicates',
    expect: 'fires',
    ctx: localised({ pages: [page('/en/a/', { lang: 'en-US' }), page('/en/b/', { lang: 'en-US' })] }),
  },
  {
    rule: 'C-14',
    what: 'two languages sharing a title without an hreflang pair are still duplicates',
    expect: 'fires',
    ctx: localised({ pages: [page('/a/', { lang: 'zh-CN' }), page('/en/b/', { lang: 'en-US' })] }),
  },
  {
    rule: 'C-15',
    what: 'the two language versions of one page are not duplicate descriptions',
    expect: 'silent',
    ctx: localised({ pages: translationPair('/writing/post/', 'en') }),
  },
  {
    rule: 'C-08',
    what: 'one slug in two languages is a translation, not a collision',
    expect: 'silent',
    ctx: localised({
      entries: [entry(), entry({ file: 'content/posts/en/good-post.mdx' })],
    }),
  },
  {
    rule: 'C-08',
    what: 'one slug twice in the same language is still a collision',
    expect: 'fires',
    ctx: localised({
      entries: [entry({ file: 'content/posts/en/good-post.mdx' }), entry({ file: 'content/posts/en/good-post.mdx' })],
    }),
  },
  {
    rule: 'C-08',
    what: 'two entries in one language claiming the same translationKey',
    expect: 'fires',
    ctx: localised({
      entries: [
        entry({ file: 'content/posts/en/one.mdx', data: { title: 'One', description: 'd', slug: 'one', translationKey: 'shared' } }),
        entry({ file: 'content/posts/en/two.mdx', data: { title: 'Two', description: 'd', slug: 'two', translationKey: 'shared' } }),
      ],
    }),
  },
  {
    rule: 'C-25',
    what: 'a link into a language that has no such entry',
    expect: 'fires',
    ctx: localised({
      entries: [entry({ body: 'See [the English one](/en/writing/b/) here.\n' })],
    }),
  },
  {
    rule: 'C-25',
    what: 'a cross-language link that does resolve',
    expect: 'silent',
    ctx: localised({
      entries: [
        entry({ body: 'See [the English one](/en/writing/b/) and [about](/about/).\n' }),
        entry({ file: 'content/posts/en/b.mdx', data: { title: 'B', description: 'd', slug: 'b' }, body: 'x\n' }),
      ],
    }),
  },
  {
    rule: 'C-30',
    what: 'an article advertising a translation that was never built',
    expect: 'fires',
    ctx: localised({
      pages: [
        page('/writing/post/', {
          alternates: [
            { hreflang: 'zh-CN', href: '/writing/post/' },
            { hreflang: 'en-US', href: '/en/writing/post/' },
          ],
          xDefault: '/writing/post/',
        }),
      ],
    }),
  },
  {
    rule: 'C-30',
    what: 'an article that exists in one language only says nothing at all',
    expect: 'silent',
    ctx: localised({ pages: [page('/writing/post/')] }),
  },
  {
    rule: 'C-30',
    what: 'a pair where only one side claims the other',
    expect: 'fires',
    ctx: localised({
      pages: [
        page('/writing/post/', {
          alternates: [
            { hreflang: 'zh-CN', href: '/writing/post/' },
            { hreflang: 'en-US', href: '/en/writing/post/' },
          ],
        }),
        page('/en/writing/post/', { title: 'Post', lang: 'en-US' }),
      ],
    }),
  },
  {
    rule: 'C-31',
    what: 'a translated page that never had its copy translated',
    expect: 'fires',
    ctx: localised({ pages: translationPair('/about/', 'en') }),
  },
];

console.log('');
console.log('translated site (default zh-CN at the root, en-US under /en/)');

for (const item of localeCases) {
  const rule = byId.get(item.rule)!;
  const found = (await rule.run(item.ctx)).filter((violation) => violation.rule === item.rule);
  const ok = item.expect === 'fires' ? found.length > 0 : found.length === 0;
  console.log(`${ok ? '✓' : '✗'} ${item.rule} ${item.what}`);
  if (!ok) {
    console.log(`    expected the rule to ${item.expect === 'fires' ? 'fire' : 'stay quiet'}${found[0] ? ` — got "${found[0].message}"` : ''}`);
    failures += 1;
  }
}

/**
 * The mounted *and* translated case, which is where the composition order is
 * either right or silently one directory off. `/zh/blog/en/writing/` is a
 * listing page; measured from the origin it is four segments deep, and every
 * rule that counts would file it as something else.
 */
const bothCtx = ctx({
  mount: MOUNT,
  localePrefixes: PREFIXES,
  pages: [page(`${MOUNT}/en/writing/`, { title: 'Writing', lang: 'en-US', intro: 'too short' })],
});
const both = (await byId.get('C-21')!.run(bothCtx)).filter((violation) => violation.rule === 'C-21');
if (both.length === 0) {
  console.log('✗ C-21 a page that is both mounted and translated is not recognised as a listing page');
  failures += 1;
} else {
  console.log('✓ C-21 mount and locale subtract in that order (/zh/blog/en/writing/ is a listing page)');
}

console.log('');
if (failures > 0) {
  console.log(`${failures} check(s) failed self-test.`);
  process.exit(1);
}
console.log(`All ${rules.length} rules verified: each catches a known violation and passes clean input.`);
console.log(`${mountCases.length} mounted-engine case(s) verified.`);
console.log(`${localeCases.length} translated-site case(s) verified, plus the mounted-and-translated composition.`);

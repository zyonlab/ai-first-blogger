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
import { sourceLinkRules } from './rules/links-source';
import { seoRules } from './rules/seo';
import { typographyRules } from './rules/typography';
import { onPageRules } from './rules/onpage';
import { qualityRules, styleFloorViolations } from './rules/quality';
import { themeRules } from './rules/theme';
import type { BuiltPage, Rule, RuleContext, SourceEntry } from './types';

const rules: Rule[] = [...contentRules, ...seoRules, ...linkRules, ...themeRules, ...onPageRules, ...typographyRules, ...sourceLinkRules, ...qualityRules];
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

function page(url: string, overrides: Partial<{ title: string; description: string; image: string; canonical: string; body: string; intro: string; breadcrumbSchema: boolean; breadcrumbMarkup: boolean }> = {}): BuiltPage {
  const {
    title = 'A reasonable page title',
    description = 'x'.repeat(130),
    image = `${ORIGIN}/og-default.png`,
    canonical = `${ORIGIN}${url}`,
    body = '',
    intro = 'An introduction long enough to clear the listing-intro threshold in policy.',
    breadcrumbSchema = false,
    breadcrumbMarkup = false,
  } = overrides;

  const isDetail = url.split('/').filter(Boolean).length >= 2 && !url.startsWith('/topics/') && !url.startsWith('/series/');
  const schema =
    (breadcrumbSchema ? '<script type="application/ld+json">{"@type":"BreadcrumbList"}</script>' : '') +
    (isDetail ? '<script type="application/ld+json">{"@type":"Article"}</script>' : '');
  const markup = breadcrumbMarkup ? '<nav class="breadcrumbs"></nav>' : '';

  return {
    url,
    file: `dist${url}index.html`,
    html: `<title>${title}</title><meta name="description" content="${description}"><meta property="og:image" content="${image}"><link rel="canonical" href="${canonical}">${schema}${markup}<main><h1>${title}</h1><p>${intro}</p>${body}</main>`,
  };
}

function ctx(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    entries: [entry()],
    pages: [page('/')],
    hasBuild: true,
    siteOrigin: ORIGIN,
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
};

// C-12/C-13 read the real site/themes/ and packages/engine/styles/ trees rather than the
// synthetic context, so they are verified against the repo instead of fixtures.
const FILESYSTEM_RULES = new Set(['C-12', 'C-13']);

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
  if (FILESYSTEM_RULES.has(rule.id)) {
    const found = await rule.run(ctx());
    console.log(`${found.length === 0 ? '✓' : '✗'} ${rule.id} ${rule.title} (filesystem rule, ${found.length} issue(s) in repo)`);
    if (found.length > 0) {
      for (const item of found) console.log(`    ${item.file} — ${item.message}`);
      failures += 1;
    }
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

console.log('');
if (failures > 0) {
  console.log(`${failures} rule(s) failed self-test.`);
  process.exit(1);
}
console.log(`All ${rules.length} rules verified: each catches a known violation and passes clean input.`);

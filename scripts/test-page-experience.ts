import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stringify } from 'yaml';
import { validatePageExperience } from './lib/page-experience';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'afb-page-experience-'));
const templates = [
  ['home', 'src/pages/index.astro', '/'],
  ['article', 'src/pages/writing/[slug].astro', '/writing/**'],
  ['video', 'src/pages/videos/[slug].astro', '/videos/**'],
  ['profile', 'src/pages/about.astro', '/about/'],
];
await fs.mkdir(path.join(root, 'content-plans'), { recursive: true });
await fs.mkdir(path.join(root, 'src/pages/writing'), { recursive: true });
await fs.mkdir(path.join(root, 'src/pages/videos'), { recursive: true });
await fs.mkdir(path.join(root, 'src/components'), { recursive: true });
await fs.mkdir(path.join(root, 'src/styles'), { recursive: true });
await fs.mkdir(path.join(root, 'dist'), { recursive: true });

for (const [, source] of templates) {
  await fs.mkdir(path.dirname(path.join(root, source)), { recursive: true });
  await fs.writeFile(path.join(root, source), '<h1>Fixture</h1>\n');
}
await fs.writeFile(path.join(root, 'src/components/Toc.astro'), '<a href={`#${heading.slug}`}>Heading</a>\n');
await fs.writeFile(path.join(root, 'src/components/YouTubeEmbed.astro'), '<div class="youtube-embed"><iframe></iframe></div>\n');
await fs.writeFile(path.join(root, 'src/styles/global.css'), `
:focus-visible { outline: 3px solid currentColor; }
.prose :is(h2, h3, h4)[id] { scroll-margin-top: 6rem; }
.youtube-embed { aspect-ratio: 16 / 9; }
@media (prefers-reduced-motion: reduce) {
  * {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
`);
await fs.writeFile(path.join(root, 'content-plans/page-experience-budgets.yaml'), stringify({
  schemaVersion: 1,
  measurement: { formFactor: 'mobile', runs: 3, aggregation: 'median' },
  representativeTemplates: templates.map(([id, source, route]) => ({ id, source, path: route })),
  lighthouseBudgets: [{
    path: '/**',
    timings: [
      { metric: 'first-contentful-paint', budget: 1800 },
      { metric: 'largest-contentful-paint', budget: 2500 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
      { metric: 'total-blocking-time', budget: 200 },
    ],
    resourceSizes: [{ resourceType: 'total', budget: 500 }],
    resourceCounts: [{ resourceType: 'script', budget: 12 }],
  }],
  deterministicChecks: {},
}));
await fs.writeFile(path.join(root, 'dist/index.html'), '<main><img src="/hero.png" width="1200" height="630" alt="Fixture"></main>\n');

const valid = await validatePageExperience(root, path.join(root, 'dist'));
assert.deepEqual(valid.errors, []);
assert.equal(valid.checkedTemplates.length, 4);
assert.equal(valid.checkedRenderedPages, 1);

await fs.writeFile(path.join(root, 'dist/index.html'), '<main><img src="/hero.png" alt="Fixture"></main>\n');
const invalidImage = await validatePageExperience(root, path.join(root, 'dist'));
assert.ok(invalidImage.errors.some((error) => error.includes('must include width and height')));

await fs.writeFile(path.join(root, 'src/styles/global.css'), '.youtube-embed { aspect-ratio: 16 / 9; }\n');
const invalidAccessibility = await validatePageExperience(root);
assert.ok(invalidAccessibility.errors.some((error) => error.includes('prefers-reduced-motion')));
assert.ok(invalidAccessibility.errors.some((error) => error.includes(':focus-visible')));
assert.ok(invalidAccessibility.errors.some((error) => error.includes('scroll-margin-top')));
assert.ok(invalidAccessibility.errors.some((error) => error.includes('animation duration')));
assert.ok(invalidAccessibility.errors.some((error) => error.includes('transition duration')));
assert.ok(invalidAccessibility.errors.some((error) => error.includes('smooth scrolling')));

await fs.rm(root, { recursive: true, force: true });
console.log('Page experience tests passed.');

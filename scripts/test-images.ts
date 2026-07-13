import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stringify } from 'yaml';
import { generateImages, validateImages } from './lib/images';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'afb-images-'));
await fs.mkdir(path.join(root, 'content-plans'), { recursive: true });
await fs.mkdir(path.join(root, 'src/content/posts'), { recursive: true });
await fs.mkdir(path.join(root, 'src/data'), { recursive: true });
await fs.mkdir(path.join(root, 'public'), { recursive: true });
await fs.writeFile(path.join(root, 'src/data/site.ts'), 'const site = { defaultImage: "/default-social-card.svg" };\n');
await fs.writeFile(path.join(root, 'public/default-social-card.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"></svg>\n');

const manifest = {
  schemaVersion: 1,
  images: [
    {
      src: '/default-social-card.svg',
      width: 1200,
      height: 630,
      alt: 'Default social sharing card for fixture pages',
      usage: ['site-og'],
    },
    {
      src: '/images/social/static-content-workflow.svg',
      width: 1200,
      height: 630,
      alt: 'Diagram card showing a Git backed static content workflow',
      usage: ['article', 'social-card'],
      generator: {
        type: 'social-card',
        title: 'Static content workflow',
        eyebrow: 'Engineering notes',
        description: 'Git-backed publishing without a runtime CMS',
      },
    },
  ],
};
await fs.writeFile(path.join(root, 'content-plans/images.yaml'), stringify(manifest));
await fs.writeFile(path.join(root, 'src/content/posts/static-content-workflow.mdx'), `---
title: Static content workflow
description: Fixture
slug: static-content-workflow
pubDate: 2026-01-01
draft: false
heroImage: /images/social/static-content-workflow.svg
---

![Git repository feeding a static build](/images/social/static-content-workflow.svg)
`);

assert.deepEqual(await generateImages(root), ['/images/social/static-content-workflow.svg']);
const valid = await validateImages(root);
assert.deepEqual(valid.errors, []);
assert.equal(valid.imageCount, 2);

await fs.appendFile(path.join(root, 'public/images/social/static-content-workflow.svg'), '<!-- stale -->');
const stale = await validateImages(root);
assert.ok(stale.errors.some((error) => error.includes('generated social card is stale')));

await generateImages(root);
await fs.writeFile(path.join(root, 'src/content/posts/static-content-workflow.mdx'), `---
title: Static content workflow
slug: static-content-workflow
pubDate: 2026-01-01
heroImage: /missing.svg
---

![](https://cdn.example.org/image.png)
`);
const invalid = await validateImages(root);
for (const expected of ['requires meaningful alt text', 'must be stored in public', 'heroImage /missing.svg is not registered']) {
  assert.ok(invalid.errors.some((error) => error.includes(expected)), `Missing image error: ${expected}`);
}

await fs.rm(root, { recursive: true, force: true });
console.log('Image pipeline tests passed.');


import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();

function runNode(args, env = {}) {
  return spawnSync(process.execPath, args, {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

function expectFailure(result, message) {
  if (result.status === 0) throw new Error(message);
}

const validConfig = runNode(['-e', "import('./astro.config.mjs')"], {
  CI: 'true',
  PUBLIC_SITE_URL: 'https://staging.example.org',
});
if (validConfig.status !== 0) throw new Error(validConfig.stderr || 'Valid deployment URL was rejected.');

const missingConfig = runNode(['-e', "import('./astro.config.mjs')"], {
  CI: 'true',
  PUBLIC_SITE_URL: '',
});
expectFailure(missingConfig, 'Missing deployment URL should fail.');

const placeholderConfig = runNode(['-e', "import('./astro.config.mjs')"], {
  CI: 'true',
  PUBLIC_SITE_URL: 'https://blog.example',
});
expectFailure(placeholderConfig, 'Placeholder deployment URL should fail.');

const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-first-blogger-validator-'));
await fs.writeFile(path.join(fixture, 'llms.txt'), '# Fixture\n');
await fs.writeFile(path.join(fixture, 'sitemap-0.xml'), '<urlset></urlset>');
await fs.writeFile(path.join(fixture, 'index.html'), `<!doctype html>
<html><head>
<link rel="canonical" href="http://localhost:4321/">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"VideoObject","name":"Incomplete"}</script>
</head><body><a href="/missing/">Broken</a></body></html>`);

const invalidBuild = runNode(['scripts/validate-build.mjs'], {
  BUILD_OUTPUT_DIR: fixture,
  PUBLIC_SITE_URL: 'http://localhost:4321',
});
expectFailure(invalidBuild, 'Invalid build fixture should fail validation.');

const combinedOutput = `${invalidBuild.stdout}\n${invalidBuild.stderr}`;
for (const expected of ['broken internal link /missing/', 'VideoObject is missing thumbnailUrl', 'VideoObject is missing uploadDate']) {
  if (!combinedOutput.includes(expected)) throw new Error(`Validator did not report: ${expected}`);
}

await fs.rm(fixture, { recursive: true, force: true });
console.log('Phase 0 negative-path tests passed.');

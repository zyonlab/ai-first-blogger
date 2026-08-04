/**
 * Bundle the CLI to JavaScript.
 *
 * Shipping TypeScript and loading it with tsx at runtime made every consumer
 * install a ~30 MB compiler to run a linter. Compiling here means the published
 * binary is plain node.
 *
 * `aifb-engine` is bundled in rather than left external on purpose: the engine
 * ships `.ts` sources — Astro compiles those through Vite, but node cannot
 * import them. Its config loader reads the same `site/*.yaml` either way, so
 * the two copies cannot disagree about anything.
 */
import { build } from 'esbuild';
import fs from 'node:fs/promises';

const ENTRIES = [
  'src/aifb.ts',
  'src/env.ts',
  'src/context.ts',
  'src/analyze-content.ts',
  'src/metrics.ts',
  'src/test-scenarios.ts',
  'src/generate-og-default.ts',
  'src/convert-ghost-to-mdx.ts',
  'src/validate/index.ts',
  'src/validate/self-test.ts',
];

await fs.rm('dist', { recursive: true, force: true });

await build({
  entryPoints: ENTRIES,
  outdir: 'dist',
  outbase: 'src',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outExtension: { '.js': '.mjs' },
  // Real npm dependencies stay external; only workspace TypeScript is inlined.
  external: ['gray-matter', 'turndown', 'yaml', 'zhlint', 'esbuild'],
  banner: { js: '#!/usr/bin/env node' },
  logLevel: 'warning',
});

console.log(`built ${ENTRIES.length} entr(ies) to dist/`);

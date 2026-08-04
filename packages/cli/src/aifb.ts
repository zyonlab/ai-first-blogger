/**
 * Single entry point for the pipeline.
 *
 *   aifb <command> [args]
 *
 * The root package.json still exposes `pnpm validate` and friends, because that
 * is what the docs and CI say. This exists so the package is usable from a site
 * that only depends on it — the eventual `npx aifb validate`.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Command → the compiled entry beside this file. */
const COMMANDS: Record<string, string> = {
  env: 'env.mjs',
  validate: 'validate/index.mjs',
  'validate:self-test': 'validate/self-test.mjs',
  context: 'context.mjs',
  analyze: 'analyze-content.mjs',
  metrics: 'metrics.mjs',
  'test:scenarios': 'test-scenarios.mjs',
  brand: 'generate-og-default.mjs',
  'og:default': 'generate-og-default.mjs',
  'migrate:ghost': 'convert-ghost-to-mdx.mjs',
};

const [command, ...rest] = process.argv.slice(2);
const entry = command ? COMMANDS[command] : undefined;

if (!entry) {
  console.error(command ? `Unknown command "${command}".` : 'Usage: aifb <command> [args]');
  console.error(`Commands: ${Object.keys(COMMANDS).join(', ')}`);
  process.exit(1);
}

spawn(process.execPath, [path.join(here, entry), ...rest], { stdio: 'inherit' }).on('exit', (code) =>
  process.exit(code ?? 0),
);

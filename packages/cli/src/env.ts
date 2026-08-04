/**
 * `aifb env` — the environment block an issue report needs.
 *
 * Every bug report asks for versions, and every reporter looks them up by hand
 * and gets one of them wrong. The three packages release as a set, so a mismatch
 * between them *is* the bug often enough to be worth printing every time.
 *
 * Output is a fenced Markdown block, ready to paste into the issue form. It
 * reads only package manifests and `process` — no network, no build required, so
 * it still works in the situation you are reporting.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = process.cwd();

/** Installed version, resolved from the site's own node_modules. */
function installed(name: string) {
  try {
    return require(`${name}/package.json`).version as string;
  } catch {
    // A workspace link, or simply absent. Fall back to the manifest's request.
    try {
      const own = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
      const range = own.dependencies?.[name] ?? own.devDependencies?.[name];
      return range ? `${range} (declared; not resolved)` : 'not installed';
    } catch {
      return 'unknown';
    }
  }
}

/** Which parts of the intent layer this site has, so a report says what it is. */
function siteShape() {
  const dir = path.join(root, 'site');
  if (!fs.existsSync(dir)) return 'no site/ directory';
  const has = (entry: string) => (fs.existsSync(path.join(dir, entry)) ? entry : null);
  const parts = ['themes', 'templates'].map(has).filter(Boolean);
  const templates = path.join(dir, 'templates');
  const overrides = fs.existsSync(templates)
    ? fs
        .readdirSync(templates, { withFileTypes: true })
        .filter((item) => item.isDirectory())
        .map((item) => `${item.name}/${fs.readdirSync(path.join(templates, item.name)).length}`)
        .join(' ')
    : '';
  return `${parts.join(' ') || 'yaml only'}${overrides ? ` — overrides: ${overrides}` : ''}`;
}

const lines = [
  '```',
  `aifb-engine   ${installed('aifb-engine')}`,
  `aifb-cli      ${installed('aifb-cli')}`,
  `astro         ${installed('astro')}`,
  `node          ${process.version}`,
  `platform      ${process.platform} ${process.arch}`,
  `site/         ${siteShape()}`,
  '```',
];

console.log(lines.join('\n'));

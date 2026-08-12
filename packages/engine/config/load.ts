/**
 * Reader for the intent layer (`site/`).
 *
 * Everything a site owner decides lives in YAML and Markdown, not TypeScript.
 * That is not a formatting preference: a YAML file cannot contain an import or
 * a component, so the boundary between intent and mechanism cannot erode the
 * way it did when brand values and engine settings shared one .ts file.
 *
 * The cost of dropping TypeScript here is literal types (`TopicSlug` used to be
 * a union). It is paid back by validation that runs the same way for the Astro
 * build and for the node scripts — both of which read these files.
 *
 * Every failure in this layer names the file, the key and the fix. A
 * misconfigured site must not build into a subtly wrong one.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

/** Marker that identifies the project root, searched upward from cwd. */
const ROOT_MARKER = path.join('site', 'site.yaml');

function findRoot() {
  let dir = process.cwd();
  for (let depth = 0; depth < 6; depth += 1) {
    if (fs.existsSync(path.join(dir, ROOT_MARKER))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `Could not find ${ROOT_MARKER} above ${process.cwd()}. Run commands from the project root.`,
  );
}

export const root = findRoot();
export const siteDir = path.join(root, 'site');

/** Fail with a message written for whoever has to fix it. */
export function fail(file: string, problems: string[]): never {
  throw new Error(`Invalid ${file}:\n${problems.map((line) => `  - ${line}`).join('\n')}`);
}

export function readYaml<T = unknown>(name: string): T {
  const file = path.join(siteDir, name);
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    fail(`site/${name}`, ['File is missing. Every site needs it — see docs/specs/site-config-contract.md.']);
  }
  try {
    return (parse(text) ?? {}) as T;
  } catch (error) {
    fail(`site/${name}`, [`Not valid YAML: ${(error as Error).message}`]);
  }
}

/**
 * The same, for a file a site may simply not have.
 *
 * `readYaml` treats a missing file as a misconfigured site, which is right for
 * the six every site needs and wrong for one that only matters during a
 * migration. Returns `undefined` when the file is absent; a file that exists
 * and is malformed still fails by name, because "I wrote it and nothing
 * happened" is the worse outcome of the two.
 */
export function readOptionalYaml<T = unknown>(name: string): T | undefined {
  const file = path.join(siteDir, name);
  if (!fs.existsSync(file)) return undefined;
  try {
    return (parse(fs.readFileSync(file, 'utf8')) ?? {}) as T;
  } catch (error) {
    fail(`site/${name}`, [`Not valid YAML: ${(error as Error).message}`]);
  }
}

export function readText(name: string): string {
  const file = path.join(siteDir, name);
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    fail(`site/${name}`, ['File is missing.']);
  }
}

export function fileExists(relativeToRoot: string) {
  return fs.existsSync(path.join(root, relativeToRoot));
}

/* ------------------------------------------------------------------ *
 * Small typed accessors. They exist so a missing key fails with the key
 * name rather than as `undefined is not an object` three layers away.
 * ------------------------------------------------------------------ */

export function requireString(source: Record<string, any>, key: string, file: string): string {
  const value = key.split('.').reduce<any>((item, part) => item?.[part], source);
  if (typeof value !== 'string' || value.trim() === '') {
    fail(file, [`"${key}" is required and must be a non-empty string.`]);
  }
  return value;
}

export function optionalString(source: Record<string, any>, key: string): string | undefined {
  const value = key.split('.').reduce<any>((item, part) => item?.[part], source);
  return typeof value === 'string' ? value : undefined;
}

export function requireList<T = unknown>(source: Record<string, any>, key: string, file: string): T[] {
  const value = key.split('.').reduce<any>((item, part) => item?.[part], source);
  if (!Array.isArray(value)) fail(file, [`"${key}" is required and must be a list.`]);
  return value as T[];
}

export function requireRecord(source: Record<string, any>, key: string, file: string): Record<string, any> {
  const value = key.split('.').reduce<any>((item, part) => item?.[part], source);
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(file, [`"${key}" is required and must be a mapping.`]);
  }
  return value as Record<string, any>;
}

export const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/* ------------------------------------------------------------------ *
 * Per-locale copy.
 * ------------------------------------------------------------------ */

function isPlainObject(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * One rule for every localisable thing in `site/`: **any mapping may carry an
 * `i18n:` block whose keys are locale tags, and that block replaces the
 * mapping's own keys for that locale.**
 *
 *     title: 写作
 *     i18n:
 *       en-US:
 *         title: Writing
 *
 * Stated once and applied by every loader, rather than a differently-shaped
 * translation table per file. The alternative — a parallel `site/en-US/`
 * directory holding whole copies of taxonomy.yaml and pages.yaml — was rejected
 * for the reason duplicated config is always rejected here: the two copies drift
 * on everything that is *not* copy (a topic's `pillar`, a content type's
 * `route`), and nothing notices until a topic page exists in one language only.
 *
 * Mappings merge key by key so a locale states only what differs. Lists and
 * scalars replace: half-translating a nav bar or a hero's action list by index
 * is not a thing anyone means, and merging them by position is how you get an
 * English label on a Chinese href.
 *
 * `i18n` itself is stripped from the result — it is a directive about the node,
 * not a field of it, and leaving it in would put a translation table on the
 * merged ContentTypeDef every consumer of the registry can see.
 */
export function localised<T>(node: T, locale: string): T {
  if (!isPlainObject(node)) return node;

  const { i18n, ...own } = node as Record<string, any>;
  const overrides = isPlainObject(i18n) ? i18n[locale] : undefined;

  const merged: Record<string, any> = {};
  for (const [key, value] of Object.entries(own)) merged[key] = localised(value, locale);
  if (!isPlainObject(overrides)) return merged as T;

  for (const [key, value] of Object.entries(overrides)) {
    merged[key] = isPlainObject(value) && isPlainObject(merged[key])
      ? localised({ ...merged[key], i18n: { [locale]: value } }, locale)
      : localised(value, locale);
  }
  return merged as T;
}

/** Locale tags a mapping declares copy for, at any depth. */
export function declaredLocales(node: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(node)) {
    for (const item of node) declaredLocales(item, found);
    return found;
  }
  if (!isPlainObject(node)) return found;
  for (const [key, value] of Object.entries(node)) {
    if (key === 'i18n' && isPlainObject(value)) for (const tag of Object.keys(value)) found.add(tag);
    else declaredLocales(value, found);
  }
  return found;
}

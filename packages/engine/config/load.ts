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

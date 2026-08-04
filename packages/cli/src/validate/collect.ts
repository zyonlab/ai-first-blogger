import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import type { BuiltPage, SourceEntry } from './types';

const root = process.cwd();

async function walk(dir: string, match: (file: string) => boolean): Promise<string[]> {
  let out: string[] = [];
  let items: import('node:fs').Dirent[];
  try {
    items = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const item of items) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) out = out.concat(await walk(full, match));
    else if (match(full)) out.push(full);
  }
  return out;
}

/** Line number of each top-level frontmatter key, so violations can point at it. */
function frontmatterLines(raw: string): Record<string, number> {
  const lines = raw.split('\n');
  const out: Record<string, number> = {};
  if (lines[0]?.trim() !== '---') return out;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i]?.trim() === '---') break;
    const key = /^([A-Za-z_][\w-]*):/.exec(lines[i] ?? '');
    if (key) out[key[1]!] = i + 1;
  }
  return out;
}

/**
 * Content files under content/.
 *
 * Drafts are excluded by default. A draft never produces a page, so the rules
 * that define "publishable" cannot apply to it — letting them apply would mean
 * an unfinished file in the repository blocks the whole site from deploying.
 * Pass `includeDrafts` when you need the raw set, e.g. to report how many were
 * held back.
 */
export async function collectEntries(options: { includeDrafts?: boolean } = {}): Promise<SourceEntry[]> {
  const contentRoot = path.join(root, 'content');
  const files = await walk(contentRoot, (file) => file.endsWith('.md') || file.endsWith('.mdx'));

  const entries = await Promise.all(
    files.sort().map(async (file) => {
      const raw = await fs.readFile(file, 'utf8');
      const parsed = matter(raw);
      const rel = path.relative(root, file);
      const type = path.relative(contentRoot, file).split(path.sep)[0] ?? 'unknown';
      return {
        file: rel,
        type,
        data: parsed.data as Record<string, any>,
        body: parsed.content,
        frontmatterLines: frontmatterLines(raw),
      };
    }),
  );

  return options.includeDrafts ? entries : entries.filter((entry) => entry.data.draft !== true);
}

export async function collectPages(): Promise<BuiltPage[]> {
  const distRoot = path.join(root, 'dist');
  const files = await walk(distRoot, (file) => file.endsWith('.html'));

  return Promise.all(
    files.sort().map(async (file) => {
      const html = await fs.readFile(file, 'utf8');
      const rel = path.relative(distRoot, file);
      const url = `/${rel.replace(/index\.html$/, '').replace(/\\/g, '/')}`;
      return { url, file: path.relative(root, file), html };
    }),
  );
}

export async function hasBuild() {
  try {
    await fs.access(path.join(root, 'dist'));
    return true;
  } catch {
    return false;
  }
}

import path from 'node:path';
import TurndownService from 'turndown';
import { slugify } from '../../src/lib/slug';
import type { ImportedMedia } from './types';

const turndown = new TurndownService({
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  headingStyle: 'atx',
  strongDelimiter: '**',
});

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asString(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

export function unique(values: Array<string | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

export function normalizeDate(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const date = new Date(typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d/.test(value) ? `${value.replace(' ', 'T')}Z` : value);
  return Number.isNaN(date.valueOf()) ? undefined : date.toISOString();
}

export function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export function stripHtml(value: string) {
  return decodeXml(value)
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function summarize(value: string, fallback: string, maxLength = 180) {
  const text = stripHtml(value).replace(/\s+/g, ' ').trim() || fallback;
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function escapeMdxExpressions(markdown: string) {
  let fenced = false;
  return markdown.split('\n').map((line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      return line;
    }
    if (fenced) return line;
    let inlineCode = false;
    let output = '';
    for (const character of line) {
      if (character === '`') inlineCode = !inlineCode;
      if (!inlineCode && character === '{') output += '&#123;';
      else if (!inlineCode && character === '}') output += '&#125;';
      else output += character;
    }
    return output;
  }).join('\n');
}

export function htmlToMdx(html: string) {
  const cleaned = html
    .replace(/<!--\s*wp:[\s\S]*?-->/g, '')
    .replace(/<!--\s*\/wp:[\s\S]*?-->/g, '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '');
  return escapeMdxExpressions(turndown.turndown(cleaned)).trim();
}

export function mediaFromHtml(html: string, role: ImportedMedia['role'] = 'content') {
  const media: ImportedMedia[] = [];
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    const sourceUrl = tag.match(/\bsrc=["']([^"']+)["']/i)?.[1];
    if (!sourceUrl) continue;
    const alt = tag.match(/\balt=["']([^"']*)["']/i)?.[1]?.trim();
    media.push({ sourceUrl: decodeXml(sourceUrl), role, ...(alt ? { alt: decodeXml(alt) } : {}) });
  }
  return dedupeMedia(media);
}

export function dedupeMedia(media: ImportedMedia[]) {
  const seen = new Set<string>();
  return media.filter((item) => {
    const key = `${item.role}:${item.sourceUrl}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function deterministicSlug(value: string, fallback: string) {
  return slugify(value) || slugify(fallback) || 'imported-content';
}

export function legacyPath(value: string | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return normalizeRoute(url.pathname);
  } catch {
    return value.startsWith('/') ? normalizeRoute(value) : undefined;
  }
}

export function normalizeRoute(value: string) {
  const pathname = value.split(/[?#]/, 1)[0];
  const normalized = path.posix.normalize(`/${pathname.replace(/^\/+/, '')}`);
  return normalized === '/' || path.posix.extname(normalized) ? normalized : `${normalized.replace(/\/$/, '')}/`;
}

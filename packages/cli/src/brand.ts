/**
 * Brand assets, derived from the intent layer. **No side effects** — the
 * generator script imports this; so does the planning preflight.
 *
 * That separation is the point of the file. The constant identifying the
 * framework's own favicon lived in the generator for about ten minutes, and
 * because the generator is a script that writes files at import time, `aifb
 * validate` silently started regenerating `public/` as a side effect of asking
 * "is this favicon still the framework's". Nothing errored. A module that does
 * work when you import it cannot be imported for a fact.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { site } from 'aifb-engine/config/site';

export type RGB = readonly [number, number, number];

/** `#rgb` / `#rrggbb` → channels. `undefined` for anything else. */
export function parseHex(value: string | undefined): RGB | undefined {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((value ?? '').trim());
  if (!match) return undefined;
  const hex = match[1]!;
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as unknown as RGB;
}

export function mix(a: RGB, b: RGB, amount: number): RGB {
  return [0, 1, 2].map((i) => Math.round(a[i]! + (b[i]! - a[i]!) * amount)) as unknown as RGB;
}

/** Relative luminance — decides whether a glyph on this colour must be light or dark. */
export const luminance = ([r, g, b]: RGB) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

export const hex = (c: RGB) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;

/**
 * The path data in the mark this framework ships.
 *
 * Recognised for two reasons: the preflight reports a site still wearing it,
 * and the generator refuses to overwrite a favicon that is anything else. The
 * moment a site draws its own, this framework stops touching the file.
 */
export const FRAMEWORK_FAVICON_MARK = 'M17 19h31L27 45h21';

/** The background the site actually paints, per its default mode. */
export function backgroundColour(): RGB {
  return (
    parseHex(site.theme.defaultMode === 'light' ? site.theme.colorLight : site.theme.colorDark) ?? [7, 11, 20]
  );
}

/**
 * The theme's `--accent`, read from the block its default mode uses.
 *
 * A theme file is two `:root` blocks and the unqualified one is the default
 * mode. The fallback is a tint of the background rather than a fixed colour:
 * whatever a theme without an accent gets should still look like *that theme*,
 * not like this framework.
 */
export async function accentColour(root: string, background: RGB): Promise<RGB> {
  const file = path.join(root, 'site/themes', `${site.theme.name}.css`);
  const css = await fs.readFile(file, 'utf8').catch(() => '');
  const base = css.split(/(?=^:root)/m).find((block) => /^:root(?!\[)/.test(block.trim())) ?? css;
  return (
    parseHex(/--accent:\s*([^;]+);/.exec(base)?.[1]) ??
    mix(background, luminance(background) > 0.5 ? [0, 0, 0] : [255, 255, 255], 0.55)
  );
}

/** The site's favicon: its initial on its own background, under its accent. */
export function faviconSvg(background: RGB, accent: RGB) {
  const glyph = (site.brand.initial || site.name.slice(0, 1) || '·').slice(0, 2);
  // The accent is only trusted for the bar — a theme may pick one with too
  // little contrast to read a letter against.
  const ink: RGB = luminance(background) > 0.5 ? [17, 17, 17] : [255, 255, 255];
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Site icon">',
    `  <rect width="64" height="64" rx="14" fill="${hex(background)}"/>`,
    `  <rect x="4" y="52" width="56" height="4" rx="2" fill="${hex(accent)}"/>`,
    '  <text x="32" y="40" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace"',
    `        font-size="${glyph.length > 1 ? 28 : 38}" font-weight="700" fill="${hex(ink)}">${glyph}</text>`,
    '</svg>',
    '',
  ].join('\n');
}

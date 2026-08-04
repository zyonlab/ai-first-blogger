/**
 * The site's brand assets — `public/og-default.png` and `public/favicon.svg`.
 *
 *   aifb brand        both
 *   aifb og:default   the same thing, under its original name
 *
 * Why this exists at all: an SVG favicon was once used as the site-wide
 * og:image, and no social platform renders SVG, so every shared link produced a
 * blank card. This writes a real 1200x630 raster using only `node:zlib` — a
 * working default without an image toolchain as a dependency.
 *
 * Why it reads the intent layer: both files used to be constants. The palette
 * was the *default theme's* `--bg` and `--accent`, and the favicon was the
 * framework's own mark — so every scaffolded site shipped someone else's tab
 * icon, and a site on a white monospace theme got a dark cyan share card that
 * matched nothing it rendered. Neither errors. Both are only ever wrong in
 * someone else's repository.
 *
 * Everything here comes from `site/site.yaml` and the theme it names:
 *
 *   theme.defaultMode + colorDark/colorLight  →  background
 *   the theme's --accent token                →  glow and bar
 *   brand.initial                             →  the favicon glyph
 *
 * Replace either file with real artwork whenever you have one. The filenames
 * are what matter, not this generator — and a favicon that is no longer the
 * framework's is never overwritten.
 */
import { deflateSync } from 'node:zlib';
import fs from 'node:fs/promises';
import path from 'node:path';
import { site } from 'aifb-engine/config/site';
import {
  accentColour,
  backgroundColour,
  faviconSvg,
  FRAMEWORK_FAVICON_MARK,
  luminance,
  mix,
  type RGB,
} from './brand';

const WIDTH = 1200;
const HEIGHT = 630;

const root = process.cwd();

const background = backgroundColour();
const ACCENT = await accentColour(root, background);
/** A gentle vertical gradient away from the flat background colour. */
const TOP: RGB = background;
const BOTTOM: RGB = mix(background, luminance(background) > 0.5 ? [0, 0, 0] : [255, 255, 255], 0.06);

const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf: Buffer) {
  let c = -1;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type: string, data: Buffer) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function buildPixels() {
  // One filter byte (0 = None) plus RGB triples per scanline.
  const raw = Buffer.alloc(HEIGHT * (1 + WIDTH * 3));
  let offset = 0;

  for (let y = 0; y < HEIGHT; y += 1) {
    raw[offset] = 0;
    offset += 1;
    const t = y / (HEIGHT - 1);

    for (let x = 0; x < WIDTH; x += 1) {
      const base = [
        Math.round(TOP[0] + (BOTTOM[0] - TOP[0]) * t),
        Math.round(TOP[1] + (BOTTOM[1] - TOP[1]) * t),
        Math.round(TOP[2] + (BOTTOM[2] - TOP[2]) * t),
      ];

      // Soft accent glow in the upper-left, so the card is not a flat block.
      const dx = (x - WIDTH * 0.18) / (WIDTH * 0.55);
      const dy = (y - HEIGHT * 0.24) / (HEIGHT * 0.7);
      const glow = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy)) ** 2 * 0.22;

      // Accent bar along the bottom edge.
      const bar = y > HEIGHT - 12 ? 1 : 0;

      for (let c = 0; c < 3; c += 1) {
        const mixed = base[c]! + (ACCENT[c]! - base[c]!) * glow;
        raw[offset + x * 3 + c] = Math.round(bar ? ACCENT[c]! : mixed);
      }
    }
    offset += WIDTH * 3;
  }
  return raw;
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(WIDTH, 0);
ihdr.writeUInt32BE(HEIGHT, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // colour type: truecolour
ihdr[10] = 0; // compression
ihdr[11] = 0; // filter
ihdr[12] = 0; // interlace

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(buildPixels(), { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const target = path.join(root, 'public/og-default.png');
await fs.mkdir(path.dirname(target), { recursive: true });
await fs.writeFile(target, png);
console.log(`Wrote ${path.relative(root, target)} (${WIDTH}x${HEIGHT}, ${(png.length / 1024).toFixed(1)} KB)`);

/* ------------------------------------------------------------------ *
 * favicon.svg
 * ------------------------------------------------------------------ */

const iconPath = path.join(root, 'public/favicon.svg');
const existing = await fs.readFile(iconPath, 'utf8').catch(() => '');

if (existing && !existing.includes(FRAMEWORK_FAVICON_MARK)) {
  console.log(`Kept ${path.relative(root, iconPath)} — it is no longer the framework's mark.`);
} else {
  await fs.writeFile(iconPath, faviconSvg(background, ACCENT));
  console.log(`Wrote ${path.relative(root, iconPath)} (brand.initial "${site.brand.initial}", theme ${site.theme.name})`);
}

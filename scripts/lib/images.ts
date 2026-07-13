import { promises as fs } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { parse, stringify } from 'yaml';

export type ImageUsage = 'article' | 'content' | 'project' | 'site-og' | 'social-card';

export type ImageVariant = {
  src: string;
  width: number;
  height: number;
};

export type SocialCardGenerator = {
  type: 'social-card';
  title: string;
  description?: string;
  eyebrow?: string;
  background?: string;
  foreground?: string;
  accent?: string;
};

export type ImageRecord = {
  src: string;
  width: number;
  height: number;
  alt: string;
  usage: ImageUsage[];
  variants?: ImageVariant[];
  generator?: SocialCardGenerator;
};

type ImageManifest = {
  schemaVersion: number;
  images: ImageRecord[];
};

export type ImageValidationResult = {
  errors: string[];
  imageCount: number;
  contentFileCount: number;
};

const supportedUsage = new Set<ImageUsage>(['article', 'content', 'project', 'site-og', 'social-card']);
const genericFilename = /^(?:image|img|photo|picture|screenshot|hero|cover|untitled)(?:[-_]?\d+)?$/i;
const localImagePattern = /\.(?:gif|jpe?g|png|svg|webp)$/i;

async function walk(directory: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(entries.map((entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory() ? walk(target) : [target];
    }));
    return nested.flat();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function publicFile(root: string, src: string) {
  return path.join(root, 'public', src.replace(/^\//, ''));
}

function validatePublicPath(src: unknown, label: string, errors: string[]): src is string {
  if (typeof src !== 'string' || !src.startsWith('/') || src.startsWith('//') || src.includes('?') || src.includes('#')) {
    errors.push(`${label}: src must be a root-relative public path without a query or fragment`);
    return false;
  }
  const normalized = path.posix.normalize(src);
  if (normalized !== src || normalized.includes('..') || !localImagePattern.test(src)) {
    errors.push(`${label}: src must be a normalized supported image path`);
    return false;
  }
  const stem = path.posix.basename(src, path.posix.extname(src));
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(stem) || genericFilename.test(stem)) {
    errors.push(`${label}: filename must be descriptive lowercase kebab-case, received ${path.posix.basename(src)}`);
    return false;
  }
  return true;
}

function positiveInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function parseSvgDimensions(source: string): { width: number; height: number } | undefined {
  const openTag = source.match(/<svg\b[^>]*>/i)?.[0];
  if (!openTag) return undefined;
  const width = openTag.match(/\bwidth=["']([0-9]+(?:\.[0-9]+)?)(?:px)?["']/i)?.[1];
  const height = openTag.match(/\bheight=["']([0-9]+(?:\.[0-9]+)?)(?:px)?["']/i)?.[1];
  if (width && height) return { width: Math.round(Number(width)), height: Math.round(Number(height)) };
  const viewBox = openTag.match(/\bviewBox=["']([^"']+)["']/i)?.[1]
    .trim()
    .split(/\s+/)
    .map(Number);
  return viewBox?.length === 4 && viewBox.every(Number.isFinite)
    ? { width: Math.round(viewBox[2]), height: Math.round(viewBox[3]) }
    : undefined;
}

function parseJpegDimensions(buffer: Buffer): { width: number; height: number } | undefined {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return undefined;
  let offset = 2;
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) return undefined;
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2) return undefined;
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return undefined;
}

export async function readImageDimensions(file: string): Promise<{ width: number; height: number } | undefined> {
  const extension = path.extname(file).toLowerCase();
  const buffer = await fs.readFile(file);
  if (extension === '.svg') return parseSvgDimensions(buffer.toString('utf8'));
  if (extension === '.png' && buffer.length >= 24 && buffer.subarray(1, 4).toString('ascii') === 'PNG') {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if ((extension === '.jpg' || extension === '.jpeg')) return parseJpegDimensions(buffer);
  if (extension === '.gif' && buffer.length >= 10 && buffer.subarray(0, 3).toString('ascii') === 'GIF') {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }
  if (extension === '.webp' && buffer.length >= 30 && buffer.subarray(0, 4).toString('ascii') === 'RIFF') {
    const kind = buffer.subarray(12, 16).toString('ascii');
    if (kind === 'VP8X') {
      return {
        width: 1 + buffer.readUIntLE(24, 3),
        height: 1 + buffer.readUIntLE(27, 3),
      };
    }
    if (kind === 'VP8 ' && buffer.subarray(23, 26).equals(Buffer.from([0x9d, 0x01, 0x2a]))) {
      return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
    }
    if (kind === 'VP8L' && buffer[20] === 0x2f) {
      return {
        width: 1 + (((buffer[22] & 0x3f) << 8) | buffer[21]),
        height: 1 + (((buffer[24] & 0x0f) << 10) | (buffer[23] << 2) | ((buffer[22] & 0xc0) >> 6)),
      };
    }
  }
  return undefined;
}

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[character] as string);
}

function wrapTitle(title: string, maxLength = 24) {
  const words = title.includes(' ') ? title.split(/\s+/) : [...title];
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const separator = title.includes(' ') && line ? ' ' : '';
    if (`${line}${separator}${word}`.length > maxLength && line) {
      lines.push(line);
      line = word;
    } else {
      line = `${line}${separator}${word}`;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

export function renderSocialCard(record: ImageRecord) {
  if (!record.generator || record.generator.type !== 'social-card') return undefined;
  const generator = record.generator;
  const background = generator.background ?? '#07111f';
  const foreground = generator.foreground ?? '#f1f5f9';
  const accent = generator.accent ?? '#67e8f9';
  const lines = wrapTitle(generator.title);
  const title = lines.map((line, index) => `<text x="76" y="${250 + index * 92}" font-family="system-ui, sans-serif" font-size="72" font-weight="750" fill="${escapeXml(foreground)}">${escapeXml(line)}</text>`).join('\n  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${record.width}" height="${record.height}" viewBox="0 0 ${record.width} ${record.height}" role="img" aria-labelledby="title description">
  <title id="title">${escapeXml(generator.title)}</title>
  <desc id="description">${escapeXml(record.alt)}</desc>
  <rect width="100%" height="100%" fill="${escapeXml(background)}"/>
  <rect x="76" y="74" width="180" height="10" rx="5" fill="${escapeXml(accent)}"/>
  ${generator.eyebrow ? `<text x="76" y="150" font-family="system-ui, sans-serif" font-size="28" font-weight="700" fill="${escapeXml(accent)}">${escapeXml(generator.eyebrow)}</text>` : ''}
  ${title}
  ${generator.description ? `<text x="76" y="${record.height - 68}" font-family="system-ui, sans-serif" font-size="28" fill="${escapeXml(foreground)}" opacity=".72">${escapeXml(generator.description)}</text>` : ''}
</svg>
`;
}

async function loadManifest(root: string): Promise<unknown> {
  return parse(await fs.readFile(path.join(root, 'content-plans/images.yaml'), 'utf8'));
}

function validateManifestShape(value: unknown, errors: string[]): ImageRecord[] {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.images)) {
    errors.push('content-plans/images.yaml: expected schemaVersion 1 and an images array');
    return [];
  }
  return value.images as ImageRecord[];
}

async function validateRegisteredFile(root: string, record: ImageRecord | ImageVariant, label: string, errors: string[]) {
  if (!validatePublicPath(record.src, label, errors)) return;
  if (!positiveInteger(record.width) || !positiveInteger(record.height)) {
    errors.push(`${label}: width and height must be positive integers`);
    return;
  }
  const file = publicFile(root, record.src);
  try {
    const dimensions = await readImageDimensions(file);
    if (!dimensions) {
      errors.push(`${label}: cannot read intrinsic dimensions from ${record.src}`);
    } else if (dimensions.width !== record.width || dimensions.height !== record.height) {
      errors.push(`${label}: declared ${record.width}x${record.height}, actual ${dimensions.width}x${dimensions.height}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') errors.push(`${label}: missing public asset ${record.src}`);
    else throw error;
  }
}

function markdownImages(source: string) {
  const images: Array<{ src: string; alt: string }> = [];
  for (const match of source.matchAll(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g)) {
    images.push({ alt: match[1].trim(), src: match[2].trim() });
  }
  for (const match of source.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    const src = tag.match(/\bsrc=["']([^"']+)["']/i)?.[1] ?? '';
    const alt = tag.match(/\balt=["']([^"']*)["']/i)?.[1]?.trim() ?? '';
    if (src) images.push({ src, alt });
  }
  return images;
}

function normalizeContentImage(src: string) {
  if (/^https?:\/\//i.test(src)) return undefined;
  return src.startsWith('/') ? src : undefined;
}

export async function validateImages(root = process.cwd()): Promise<ImageValidationResult> {
  const errors: string[] = [];
  let manifestValue: unknown;
  try {
    manifestValue = await loadManifest(root);
  } catch (error) {
    errors.push(`content-plans/images.yaml: ${(error as Error).message}`);
    return { errors, imageCount: 0, contentFileCount: 0 };
  }
  const images = validateManifestShape(manifestValue, errors);
  const bySrc = new Map<string, ImageRecord>();

  for (const [index, rawRecord] of images.entries()) {
    const label = `images[${index}]`;
    if (!isRecord(rawRecord)) {
      errors.push(`${label}: expected an object`);
      continue;
    }
    const record = rawRecord as ImageRecord;
    await validateRegisteredFile(root, record, label, errors);
    if (typeof record.src === 'string') {
      if (bySrc.has(record.src)) errors.push(`${label}: duplicate src ${record.src}`);
      bySrc.set(record.src, record);
    }
    if (typeof record.alt !== 'string' || record.alt.trim().length < 8 || record.alt.length > 180) {
      errors.push(`${label}: alt must describe the image in 8-180 characters`);
    }
    if (!Array.isArray(record.usage) || record.usage.length === 0 || record.usage.some((usage) => !supportedUsage.has(usage))) {
      errors.push(`${label}: usage must contain supported values`);
    }
    const extension = typeof record.src === 'string' ? path.extname(record.src).toLowerCase() : '';
    const variants = record.variants ?? [];
    if (extension !== '.svg' && record.usage?.some((usage) => ['article', 'content', 'project'].includes(usage))) {
      if (variants.length < 2) errors.push(`${label}: raster content images require at least two responsive variants`);
    }
    const widths = new Set<number>();
    for (const [variantIndex, variant] of variants.entries()) {
      await validateRegisteredFile(root, variant, `${label}.variants[${variantIndex}]`, errors);
      if (widths.has(variant.width)) errors.push(`${label}: responsive variant widths must be unique`);
      widths.add(variant.width);
    }
    const generated = renderSocialCard(record);
    if (record.generator && !generated) errors.push(`${label}: unsupported generator`);
    if (generated && typeof record.src === 'string') {
      try {
        const committed = await fs.readFile(publicFile(root, record.src), 'utf8');
        if (committed !== generated) errors.push(`${label}: generated social card is stale; run pnpm images:generate`);
      } catch {
        // Missing output is already reported by the asset check.
      }
    }
  }

  const siteOg = images.filter((image) => image.usage?.includes('site-og'));
  if (siteOg.length !== 1) errors.push(`images: expected exactly one site-og image, found ${siteOg.length}`);
  for (const image of siteOg) {
    if (image.width < 1200 || image.height < 630) errors.push(`${image.src}: site-og image must be at least 1200x630`);
  }
  try {
    const siteConfig = await fs.readFile(path.join(root, 'src/data/site.ts'), 'utf8');
    const defaultImage = siteConfig.match(/\bdefaultImage:\s*["']([^"']+)["']/)?.[1];
    if (!defaultImage) errors.push('src/data/site.ts: could not find a static defaultImage path');
    else if (!siteOg.some((image) => image.src === defaultImage)) {
      errors.push(`src/data/site.ts: defaultImage ${defaultImage} must match the registered site-og image`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  const contentDirectory = path.join(root, 'src/content');
  const contentFiles = (await walk(contentDirectory)).filter((file) => /\.(?:md|mdx)$/.test(file));
  for (const file of contentFiles) {
    const relative = path.relative(root, file).split(path.sep).join('/');
    const source = await fs.readFile(file, 'utf8');
    const { data, content } = matter(source);
    for (const image of markdownImages(content)) {
      if (!image.alt) errors.push(`${relative}: image ${image.src} requires meaningful alt text`);
      const localSrc = normalizeContentImage(image.src);
      if (!localSrc) {
        errors.push(`${relative}: image ${image.src} must be stored in public and registered in content-plans/images.yaml`);
      } else if (!bySrc.has(localSrc)) {
        errors.push(`${relative}: image ${localSrc} is not registered in content-plans/images.yaml`);
      } else if (!bySrc.get(localSrc)?.usage.some((usage) => usage === 'article' || usage === 'content')) {
        errors.push(`${relative}: image ${localSrc} must have article or content usage`);
      }
    }
    const isPost = relative.startsWith('src/content/posts/');
    const pubDate = data.pubDate ? new Date(data.pubDate) : undefined;
    const published = isPost && data.draft !== true && (!pubDate || pubDate.valueOf() <= Date.now());
    if (data.heroImage !== undefined) {
      if (typeof data.heroImage !== 'string' || !data.heroImage.startsWith('/')) {
        errors.push(`${relative}: heroImage must be a root-relative public path`);
      } else {
        const representative = bySrc.get(data.heroImage);
        if (!representative) errors.push(`${relative}: heroImage ${data.heroImage} is not registered`);
        else if (!representative.usage.some((usage) => usage === 'article' || usage === 'social-card')) {
          errors.push(`${relative}: heroImage ${data.heroImage} must have article or social-card usage`);
        } else if (representative.width < 1200 || representative.height < 630) {
          errors.push(`${relative}: representative heroImage must be at least 1200x630 for large previews`);
        }
      }
    } else if (published) {
        errors.push(`${relative}: published article requires a root-relative heroImage`);
    }
    if (data.cover !== undefined) {
      if (typeof data.cover !== 'string' || !data.cover.startsWith('/')) {
        errors.push(`${relative}: cover must be a root-relative public path`);
      } else if (!bySrc.get(data.cover)?.usage.includes('project')) {
        errors.push(`${relative}: cover ${data.cover} must be registered with project usage`);
      }
    }
  }

  return { errors, imageCount: images.length, contentFileCount: contentFiles.length };
}

export async function generateImages(root = process.cwd()) {
  const errors: string[] = [];
  const images = validateManifestShape(await loadManifest(root), errors);
  if (errors.length > 0) throw new Error(errors.join('\n'));
  const written: string[] = [];
  for (const record of images) {
    const output = renderSocialCard(record);
    if (!output) continue;
    if (!validatePublicPath(record.src, 'generated image', errors)) continue;
    const target = publicFile(root, record.src);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, output);
    written.push(record.src);
  }
  if (errors.length > 0) throw new Error(errors.join('\n'));
  return written;
}

export function serializeImageManifest(manifest: ImageManifest) {
  return stringify(manifest);
}

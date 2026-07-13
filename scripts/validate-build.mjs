import { promises as fs } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

const root = process.cwd();
const isStagingBuild = process.env.PUBLIC_DEPLOY_ENV === 'staging';
const distDir = process.env.BUILD_OUTPUT_DIR
  ? path.resolve(process.env.BUILD_OUTPUT_DIR)
  : path.join(root, 'dist');
const configuredOrigin = new URL(process.env.PUBLIC_SITE_URL?.trim() || 'http://localhost:4321').origin;
const errors = [];

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  }));
  return nested.flat();
}

function pagePath(file) {
  const relative = path.relative(distDir, file).split(path.sep).join('/');
  if (relative === 'index.html') return '/';
  if (relative.endsWith('/index.html')) return `/${relative.slice(0, -'index.html'.length)}`;
  return `/${relative}`;
}

function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}=["']([^"']+)["']`, 'i'));
  return match?.[1];
}

function routeCandidates(pathname) {
  const decoded = decodeURIComponent(pathname);
  const clean = decoded.replace(/\/{2,}/g, '/');
  if (clean === '/') return [path.join(distDir, 'index.html')];

  const relative = clean.replace(/^\//, '');
  if (path.extname(relative)) return [path.join(distDir, relative)];

  return [
    path.join(distDir, relative, 'index.html'),
    path.join(distDir, `${relative}.html`),
  ];
}

async function routeExists(pathname) {
  for (const candidate of routeCandidates(pathname)) {
    try {
      if ((await fs.stat(candidate)).isFile()) return true;
    } catch {
      continue;
    }
  }
  return false;
}

function isContentPage(pathname) {
  return /^\/(writing|videos|projects|case-studies|series|topics)\/[^/]+\/$/.test(pathname);
}

function validateJsonLdNode(node, pathname) {
  if (Array.isArray(node)) {
    node.forEach((item) => validateJsonLdNode(item, pathname));
    return;
  }
  if (!node || typeof node !== 'object') return;

  if (Array.isArray(node['@graph'])) validateJsonLdNode(node['@graph'], pathname);
  const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];

  if (types.includes('BlogPosting')) {
    for (const property of ['headline', 'image', 'datePublished', 'dateModified', 'author', 'mainEntityOfPage']) {
      if (!node[property]) errors.push(`${pathname}: BlogPosting is missing ${property}`);
    }
  }

  if (types.includes('VideoObject')) {
    for (const property of ['name', 'thumbnailUrl', 'uploadDate']) {
      if (!node[property]) errors.push(`${pathname}: VideoObject is missing ${property}`);
    }
    if (!node.contentUrl && !node.embedUrl) {
      errors.push(`${pathname}: VideoObject requires contentUrl or embedUrl`);
    }
  }

  if (types.includes('ProfilePage') && !node.mainEntity) {
    errors.push(`${pathname}: ProfilePage is missing mainEntity`);
  }
}

const files = await walk(distDir);
const htmlFiles = files.filter((file) => file.endsWith('.html'));
const incomingLinks = new Map();
const generatedPages = new Set(htmlFiles.map(pagePath));
const noindexPages = new Set();

for (const file of htmlFiles) {
  const pathname = pagePath(file);
  const html = await fs.readFile(file, 'utf8');
  const noindex = /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(html);
  if (noindex) noindexPages.add(pathname);
  const linkTags = html.match(/<link\b[^>]*>/gi) ?? [];
  const canonicalTags = linkTags.filter((tag) => attribute(tag, 'rel')?.toLowerCase() === 'canonical');

  if (!noindex) {
    if (canonicalTags.length !== 1) {
      errors.push(`${pathname}: expected exactly one canonical link, found ${canonicalTags.length}`);
    } else {
      const canonicalHref = attribute(canonicalTags[0], 'href');
      try {
        const canonical = new URL(canonicalHref);
        if (canonical.origin !== configuredOrigin) {
          errors.push(`${pathname}: canonical origin ${canonical.origin} does not match ${configuredOrigin}`);
        }
      } catch {
        errors.push(`${pathname}: canonical is not an absolute URL`);
      }
    }
  }

  const jsonLdBlocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const [, source] of jsonLdBlocks) {
    try {
      validateJsonLdNode(JSON.parse(source), pathname);
    } catch (error) {
      errors.push(`${pathname}: invalid JSON-LD (${error.message})`);
    }
  }

  const anchorTags = html.match(/<a\b[^>]*>/gi) ?? [];
  for (const tag of anchorTags) {
    const href = attribute(tag, 'href');
    if (!href || href.startsWith('#') || /^(mailto|tel|javascript):/i.test(href)) continue;

    let target;
    try {
      target = new URL(href, new URL(pathname, configuredOrigin));
    } catch {
      errors.push(`${pathname}: invalid href ${href}`);
      continue;
    }

    if (target.origin !== configuredOrigin) continue;
    if (!(await routeExists(target.pathname))) {
      errors.push(`${pathname}: broken internal link ${target.pathname}`);
      continue;
    }

    const normalizedTarget = target.pathname.endsWith('/') || path.extname(target.pathname)
      ? target.pathname
      : `${target.pathname}/`;
    incomingLinks.set(normalizedTarget, (incomingLinks.get(normalizedTarget) ?? 0) + 1);
  }
}

const sitemapText = (await Promise.all(
  files.filter((file) => /sitemap.*\.xml$/.test(file)).map((file) => fs.readFile(file, 'utf8')),
)).join('\n');

for (const pathname of noindexPages) {
  if (sitemapText.includes(new URL(pathname, configuredOrigin).toString())) {
    errors.push(`${pathname}: noindex page must not appear in the sitemap`);
  }
}

for (const pathname of generatedPages) {
  if (!isContentPage(pathname)) continue;
  if (!incomingLinks.get(pathname)) errors.push(`${pathname}: published content page is orphaned`);
  if (!isStagingBuild && !sitemapText.includes(new URL(pathname, configuredOrigin).toString())) {
    errors.push(`${pathname}: published content page is missing from the sitemap`);
  }
}

const llmsFile = path.join(distDir, 'llms.txt');
try {
  const llmsText = await fs.readFile(llmsFile, 'utf8');
  for (const match of llmsText.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = new URL(match[1], configuredOrigin);
    if (target.origin === configuredOrigin && !(await routeExists(target.pathname))) {
      errors.push(`/llms.txt: broken internal link ${target.pathname}`);
    }
  }
} catch {
  errors.push('/llms.txt: output is missing');
}

const unpublishedCollections = [
  ['posts', 'writing'],
  ['videos', 'videos'],
  ['case-studies', 'case-studies'],
];

for (const [collection, route] of unpublishedCollections) {
  const directory = path.join(root, 'src', 'content', collection);
  const contentFiles = (await walk(directory)).filter((file) => /\.mdx?$/.test(file));
  for (const file of contentFiles) {
    const { data } = matter(await fs.readFile(file, 'utf8'));
    const unpublished = data.draft === true || (data.pubDate && new Date(data.pubDate).valueOf() > Date.now());
    if (!unpublished || !data.slug) continue;
    const pathname = `/${route}/${data.slug}/`;
    if (generatedPages.has(pathname) || sitemapText.includes(new URL(pathname, configuredOrigin).toString())) {
      errors.push(`${pathname}: draft or future content was published`);
    }
  }
}

if (errors.length > 0) {
  console.error('Build validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Build validation passed: ${htmlFiles.length} HTML pages checked.`);

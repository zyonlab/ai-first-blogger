import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import TurndownService from 'turndown';
import { categoryMap } from './category-map';
import { slugMap } from './slug-map';

type GhostTag = {
  name?: string;
  slug?: string;
};

type GhostPost = {
  title?: string;
  slug?: string;
  status?: string;
  html?: string;
  custom_excerpt?: string;
  excerpt?: string;
  meta_description?: string;
  published_at?: string;
  updated_at?: string;
  feature_image?: string;
  tags?: GhostTag[];
};

const root = process.cwd();
const exportPath = path.join(root, 'migration/ghost-export.json');
const imageInput = path.join(root, 'migration/images');
const imageOutput = path.join(root, 'public/content/images');
const postsOutput = path.join(root, 'src/content/posts');
const reportPath = path.join(root, 'migration/report.md');
const domainImagePattern = /^https?:\/\/zyoncode\.com\/content\/images\//i;
const localImagePattern = /(?:src|href)=["']([^"']*\/content\/images\/[^"']+)["']/g;

function cleanDescription(post: GhostPost) {
  const description = post.custom_excerpt || post.excerpt || post.meta_description || post.title || 'Migrated Ghost post.';
  return description.replace(/\s+/g, ' ').trim().slice(0, 260);
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function uniqueSlug(base: string, used: Set<string>) {
  let slug = base || 'untitled';
  let index = 2;
  while (used.has(slug)) {
    slug = `${base}-${index}`;
    index += 1;
  }
  used.add(slug);
  return slug;
}

function normalizeImageUrl(value = '') {
  if (domainImagePattern.test(value)) {
    return value.replace(domainImagePattern, '/content/images/');
  }
  if (value.startsWith('http://zyoncode.com/content/images/')) {
    return value.replace('http://zyoncode.com/content/images/', '/content/images/');
  }
  if (value.startsWith('https://zyoncode.com/content/images/')) {
    return value.replace('https://zyoncode.com/content/images/', '/content/images/');
  }
  return value;
}

function mapTaxonomy(post: GhostPost) {
  const rawTags = (post.tags ?? [])
    .flatMap((tag) => [tag.name, tag.slug])
    .filter(Boolean)
    .map((tag) => String(tag).toLowerCase());
  const text = [post.title, post.slug, ...rawTags].filter(Boolean).join(' ').toLowerCase();
  const match = categoryMap.find((item) => item.match.some((keyword) => text.includes(keyword.toLowerCase())));

  return {
    category: match?.category ?? 'notes',
    series: match?.series,
    tags: [...new Set((post.tags ?? []).map((tag) => tag.name || tag.slug).filter(Boolean))],
  };
}

function getGhostPosts(raw: unknown): GhostPost[] {
  const data = raw as any;
  const db = data?.db?.[0]?.data;
  return db?.posts ?? data?.posts ?? data?.data?.posts ?? [];
}

async function exists(target: string) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await exists(exportPath))) {
    console.error(`Ghost export not found: ${exportPath}`);
    console.error('Place your export at migration/ghost-export.json, then run pnpm migrate:ghost.');
    process.exitCode = 1;
    return;
  }

  await fs.mkdir(postsOutput, { recursive: true });
  await fs.mkdir(path.dirname(reportPath), { recursive: true });

  if (await exists(imageInput)) {
    await fs.mkdir(imageOutput, { recursive: true });
    await fs.cp(imageInput, imageOutput, { recursive: true });
  }

  const raw = JSON.parse(await fs.readFile(exportPath, 'utf8'));
  const posts = getGhostPosts(raw).filter((post) => post.status === 'published');
  const usedSlugs = new Set<string>();
  const turndown = new TurndownService({
    codeBlockStyle: 'fenced',
    headingStyle: 'atx',
    bulletListMarker: '-',
  });

  const warnings: string[] = [];
  const migrated: string[] = [];

  for (const post of posts) {
    const title = post.title || 'Untitled';
    const baseSlug = slugMap[post.slug ?? ''] ?? post.slug ?? slugify(title);
    const slug = uniqueSlug(slugify(baseSlug), usedSlugs);
    const taxonomy = mapTaxonomy(post);
    let html = post.html ?? '';
    html = html.replaceAll('https://zyoncode.com/content/images/', '/content/images/');
    html = html.replaceAll('http://zyoncode.com/content/images/', '/content/images/');

    const localImages = [...html.matchAll(localImagePattern)].map((match) => normalizeImageUrl(match[1]));
    const missingImages = localImages.filter((image) => image.startsWith('/content/images/'));
    if (missingImages.length > 0 && !(await exists(imageInput))) {
      warnings.push(`- ${title}: local image references found but migration/images does not exist.`);
    }

    const body = turndown.turndown(html).replace(/\\\[/g, '[').replace(/\\\]/g, ']');
    const frontmatter = {
      title,
      description: cleanDescription(post),
      slug,
      pubDate: post.published_at ?? new Date().toISOString(),
      updatedDate: post.updated_at,
      draft: false,
      heroImage: normalizeImageUrl(post.feature_image),
      category: taxonomy.category,
      tags: taxonomy.tags,
      series: taxonomy.series,
      author: 'Zyon',
      legacySlug: post.slug,
    };

    const output = matter.stringify(body.trim() + '\n', frontmatter);
    await fs.writeFile(path.join(postsOutput, `${slug}.mdx`), output);
    migrated.push(`- ${title} → /writing/${slug}/`);
  }

  const report = [
    '# Ghost Migration Report',
    '',
    `Migrated posts: ${migrated.length}`,
    '',
    '## Posts',
    '',
    ...migrated,
    '',
    '## Warnings',
    '',
    ...(warnings.length > 0 ? warnings : ['- No warnings.']),
    '',
  ].join('\n');

  await fs.writeFile(reportPath, report);
  console.log(`Migrated ${migrated.length} posts.`);
  console.log(`Report written to ${reportPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

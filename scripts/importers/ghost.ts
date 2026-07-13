import { asString, dedupeMedia, deterministicSlug, htmlToMdx, isRecord, mediaFromHtml, normalizeDate, summarize, unique } from './shared';
import type { ImportedContent, ImportedMedia, ParsedExport } from './types';

type GhostData = Record<string, unknown[]>;

function unwrapExport(input: unknown) {
  if (!isRecord(input)) throw new Error('Ghost export must be a JSON object');
  const wrapped = Array.isArray(input.db) ? input.db[0] : input;
  if (!isRecord(wrapped) || !isRecord(wrapped.data)) throw new Error('Ghost export must contain a data object (optionally inside db[0])');
  return {
    meta: isRecord(wrapped.meta) ? wrapped.meta : {},
    data: wrapped.data as GhostData,
  };
}

function renderLexicalNode(node: unknown): string {
  if (!isRecord(node)) return '';
  const children = Array.isArray(node.children) ? node.children.map(renderLexicalNode).join('') : '';
  if (node.type === 'text') {
    let text = asString(node.text) ?? '';
    const format = typeof node.format === 'number' ? node.format : 0;
    if (format & 16) text = `\`${text.replace(/`/g, '\\`')}\``;
    if (format & 1) text = `**${text}**`;
    if (format & 2) text = `*${text}*`;
    if (format & 4) text = `~~${text}~~`;
    return text;
  }
  if (node.type === 'root') return `${children}\n`;
  if (node.type === 'paragraph') return `${children}\n\n`;
  if (node.type === 'heading') return `${'#'.repeat(Number(String(node.tag).replace('h', '')) || 2)} ${children}\n\n`;
  if (node.type === 'quote') return `${children.split('\n').filter(Boolean).map((line) => `> ${line}`).join('\n')}\n\n`;
  if (node.type === 'link' || node.type === 'autolink') return `[${children}](${asString(node.url) ?? ''})`;
  if (node.type === 'list') return `${children}\n`;
  if (node.type === 'listitem') return `- ${children.trim()}\n`;
  if (node.type === 'linebreak') return '\n';
  if (node.type === 'code') return `\n\`\`\`${asString(node.language) ?? ''}\n${asString(node.code) ?? children}\n\`\`\`\n\n`;
  if (node.type === 'image') {
    const src = asString(node.src) ?? '';
    return src ? `![${asString(node.altText) ?? ''}](${src})\n\n` : '';
  }
  return children;
}

function lexicalToMdx(value: string) {
  try {
    const document = JSON.parse(value);
    return renderLexicalNode(isRecord(document) && document.root ? document.root : document).trim();
  } catch {
    return undefined;
  }
}

function lexicalMedia(value: string) {
  try {
    const found: ImportedMedia[] = [];
    const visit = (node: unknown) => {
      if (!isRecord(node)) return;
      if (node.type === 'image' && typeof node.src === 'string') {
        found.push({ sourceUrl: node.src, role: 'content', ...(typeof node.altText === 'string' && node.altText ? { alt: node.altText } : {}) });
      }
      if (Array.isArray(node.children)) node.children.forEach(visit);
    };
    const document = JSON.parse(value);
    visit(isRecord(document) && document.root ? document.root : document);
    return found;
  } catch {
    return [];
  }
}

export function parseGhostExport(source: string): ParsedExport {
  let json: unknown;
  try {
    json = JSON.parse(source);
  } catch (error) {
    throw new Error(`Invalid Ghost JSON: ${(error as Error).message}`);
  }
  const { meta, data } = unwrapExport(json);
  const posts = Array.isArray(data.posts) ? data.posts.filter(isRecord) : [];
  const tags = new Map((Array.isArray(data.tags) ? data.tags : []).filter(isRecord).map((tag) => [String(tag.id), asString(tag.name) ?? asString(tag.slug) ?? String(tag.id)]));
  const users = new Map((Array.isArray(data.users) ? data.users : []).filter(isRecord).map((user) => [String(user.id), asString(user.name) ?? asString(user.slug) ?? String(user.id)]));
  const postTags = (Array.isArray(data.posts_tags) ? data.posts_tags : []).filter(isRecord);
  const postAuthors = (Array.isArray(data.posts_authors) ? data.posts_authors : []).filter(isRecord);
  const postMeta = new Map((Array.isArray(data.posts_meta) ? data.posts_meta : []).filter(isRecord).map((item) => [String(item.post_id), item]));
  const settings = (Array.isArray(data.settings) ? data.settings : []).filter(isRecord);
  const siteUrl = settings.find((setting) => setting.key === 'url' && typeof setting.value === 'string')?.value as string | undefined;
  const content: ImportedContent[] = [];

  for (const [index, post] of posts.entries()) {
    const sourceId = String(post.id ?? `post-${index + 1}`);
    const title = asString(post.title)?.trim() || `Untitled ${sourceId}`;
    const html = asString(post.html);
    const lexical = asString(post.lexical);
    const lexicalBody = lexical ? lexicalToMdx(lexical) : undefined;
    const warnings: string[] = [];
    let body = html ? htmlToMdx(html) : lexicalBody;
    if (!body && asString(post.mobiledoc)) warnings.push('Mobiledoc-only body was not converted; manual content recovery is required.');
    if (!body) {
      body = '> Imported without a convertible body. Review the migration report and recover the source content before publishing.';
      warnings.push('No supported HTML or Lexical body was available.');
    }
    const type = asString(post.type) ?? 'post';
    if (type !== 'post' && type !== 'page') warnings.push(`Unexpected Ghost content type: ${type}`);
    const visibility = asString(post.visibility) ?? 'public';
    if (visibility !== 'public') warnings.push(`Original visibility was ${visibility}; imported as a draft to prevent accidental disclosure.`);
    const metaRecord = postMeta.get(sourceId);
    const featureImage = asString(post.feature_image);
    const featureAlt = metaRecord ? asString(metaRecord.feature_image_alt) : undefined;
    const media = [
      ...mediaFromHtml(html ?? ''),
      ...(lexical ? lexicalMedia(lexical) : []),
      ...(featureImage ? [{ sourceUrl: featureImage, role: 'feature' as const, ...(featureAlt ? { alt: featureAlt } : {}) }] : []),
    ];
    const authors = postAuthors
      .filter((relation) => String(relation.post_id) === sourceId)
      .sort((left, right) => Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0))
      .map((relation) => users.get(String(relation.author_id)));
    const relatedTags = postTags
      .filter((relation) => String(relation.post_id) === sourceId)
      .sort((left, right) => Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0))
      .map((relation) => tags.get(String(relation.tag_id)));
    const publishedAt = normalizeDate(post.published_at) ?? normalizeDate(post.created_at);
    const draft = asString(post.status) !== 'published' || visibility !== 'public';
    const metadata: ImportedContent['metadata'] = {
      sourceSlug: asString(post.slug) ?? null,
      status: asString(post.status) ?? null,
      visibility,
      featured: Boolean(post.featured),
      canonicalUrl: asString(post.canonical_url) ?? null,
      metaTitle: asString(post.meta_title) ?? null,
      metaDescription: asString(post.meta_description) ?? null,
      featureImageAlt: featureAlt ?? null,
      featureImageCaption: metaRecord ? asString(metaRecord.feature_image_caption) ?? null : null,
    };
    content.push({
      source: 'ghost', sourceId, sourceType: type, title,
      slugHint: deterministicSlug(asString(post.slug) ?? title, `ghost-${sourceId}`),
      description: summarize(asString(post.custom_excerpt) ?? body, title),
      body, publishedAt, updatedAt: normalizeDate(post.updated_at), draft,
      authors: unique(authors), tags: unique(relatedTags), categories: [], metadata,
      legacyUrl: asString(post.url) ?? asString(post.canonical_url) ?? (siteUrl ? new URL(`${asString(post.slug) ?? title}/`, `${siteUrl.replace(/\/$/, '')}/`).toString() : undefined),
      media: dedupeMedia(media), warnings,
    });
  }

  const mediaInventory = dedupeMedia(content.flatMap((item) => item.media));
  return {
    source: 'ghost',
    sourceVersion: asString(meta.version),
    siteUrl,
    content,
    mediaInventory,
    skipped: [],
    warnings: posts.length === 0 ? ['Ghost export contains no posts or pages.'] : [],
  };
}

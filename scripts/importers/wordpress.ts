import { decodeXml, dedupeMedia, deterministicSlug, htmlToMdx, mediaFromHtml, normalizeDate, summarize, unique } from './shared';
import type { ImportedContent, ImportedMedia, ParsedExport, SkippedContent } from './types';

function blocks(source: string, tag: string) {
  return [...source.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'gi'))].map((match) => match[1]);
}

function field(source: string, tag: string) {
  const escaped = tag.replace(':', '\\:');
  const match = source.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, 'i'));
  return match ? decodeXml(match[1]).trim() : undefined;
}

function attributes(openingTag: string) {
  return Object.fromEntries([...openingTag.matchAll(/([\w:-]+)=["']([^"']*)["']/g)].map((match) => [match[1], decodeXml(match[2])]));
}

function taxonomies(item: string) {
  return [...item.matchAll(/<category\b([^>]*)>([\s\S]*?)<\/category>/gi)].map((match) => {
    const values = attributes(match[1]);
    return { domain: values.domain, nicename: values.nicename, name: decodeXml(match[2]).trim() };
  });
}

function postMeta(item: string) {
  const result = new Map<string, string>();
  for (const block of blocks(item, 'wp:postmeta')) {
    const key = field(block, 'wp:meta_key');
    const value = field(block, 'wp:meta_value');
    if (key && value !== undefined) result.set(key, value);
  }
  return result;
}

function siteUrl(xml: string) {
  const channel = blocks(xml, 'channel')[0] ?? xml;
  return field(channel.replace(/<item>[\s\S]*?<\/item>/gi, ''), 'wp:base_site_url') ?? field(channel, 'link');
}

export function parseWordPressExport(source: string): ParsedExport {
  if (!/<rss\b/i.test(source) || !/xmlns:wp=/i.test(source)) throw new Error('WordPress import requires a WXR/XML export with the wp namespace');
  const items = blocks(source, 'item');
  const attachmentUrls = new Map<string, string>();
  const authorNames = new Map<string, string>();
  for (const author of blocks(source, 'wp:author')) {
    const login = field(author, 'wp:author_login');
    const displayName = field(author, 'wp:author_display_name');
    if (login && displayName) authorNames.set(login, displayName);
  }
  for (const item of items) {
    if (field(item, 'wp:post_type') !== 'attachment') continue;
    const id = field(item, 'wp:post_id');
    const url = field(item, 'wp:attachment_url') ?? field(item, 'guid');
    if (id && url) attachmentUrls.set(id, url);
  }

  const content: ImportedContent[] = [];
  const skipped: SkippedContent[] = [];
  for (const [index, item] of items.entries()) {
    const sourceId = field(item, 'wp:post_id') ?? `item-${index + 1}`;
    const sourceType = field(item, 'wp:post_type') ?? 'post';
    const title = field(item, 'title') || `Untitled ${sourceId}`;
    if (sourceType === 'attachment') continue;
    if (sourceType !== 'post' && sourceType !== 'page') {
      skipped.push({ sourceId, sourceType, title, reason: 'Custom post types require a project-specific mapping and were not imported.' });
      continue;
    }
    const status = field(item, 'wp:status') ?? 'draft';
    if (status === 'trash' || status === 'auto-draft' || status === 'inherit') {
      skipped.push({ sourceId, sourceType, title, reason: `WordPress status ${status} is not publishable content.` });
      continue;
    }
    const html = field(item, 'content:encoded') ?? '';
    const body = htmlToMdx(html) || '> Imported without body content. Review before publishing.';
    const terms = taxonomies(item);
    const categories = unique(terms.filter((term) => term.domain === 'category').map((term) => term.name));
    const tags = unique(terms.filter((term) => term.domain === 'post_tag').map((term) => term.name));
    const metadata = postMeta(item);
    const thumbnail = metadata.get('_thumbnail_id');
    const featureUrl = thumbnail ? attachmentUrls.get(thumbnail) : undefined;
    const media: ImportedMedia[] = [
      ...mediaFromHtml(html),
      ...(featureUrl ? [{ sourceUrl: featureUrl, sourceId: thumbnail, role: 'feature' as const }] : []),
    ];
    const warnings: string[] = [];
    const knownMetaKeys = new Set(['_thumbnail_id']);
    const unmappedMetaKeys = [...metadata.keys()].filter((key) => !knownMetaKeys.has(key)).sort();
    if (unmappedMetaKeys.length > 0) warnings.push(`Unmapped WordPress custom-field keys: ${unmappedMetaKeys.join(', ')}`);
    if (/(?:^|[\s>])\[[a-z][a-z0-9_-]*(?:\s[^\]]*)?\](?:$|[\s<])/i.test(html)) warnings.push('Possible WordPress shortcode remains and requires manual review.');
    if (sourceType === 'page') warnings.push('WordPress page was mapped to the posts collection; review its desired information architecture.');
    content.push({
      source: 'wordpress', sourceId, sourceType, title,
      slugHint: deterministicSlug(field(item, 'wp:post_name') ?? title, `wordpress-${sourceId}`),
      description: summarize(field(item, 'excerpt:encoded') ?? body, title),
      body,
      publishedAt: normalizeDate(field(item, 'wp:post_date_gmt')) ?? normalizeDate(field(item, 'pubDate')),
      updatedAt: normalizeDate(field(item, 'wp:post_modified_gmt')),
      draft: status !== 'publish',
      authors: unique([authorNames.get(field(item, 'dc:creator') ?? '') ?? field(item, 'dc:creator')]),
      tags: unique([...tags, ...categories]), categories,
      metadata: {
        sourceSlug: field(item, 'wp:post_name') ?? null,
        status,
        commentStatus: field(item, 'wp:comment_status') ?? null,
        pingStatus: field(item, 'wp:ping_status') ?? null,
        postParent: field(item, 'wp:post_parent') ?? null,
        menuOrder: Number(field(item, 'wp:menu_order') ?? 0),
        sticky: field(item, 'wp:is_sticky') === '1',
        passwordProtected: Boolean(field(item, 'wp:post_password')),
        thumbnailId: thumbnail ?? null,
        unmappedCustomFieldCount: unmappedMetaKeys.length,
      },
      legacyUrl: field(item, 'link'), media: dedupeMedia(media), warnings,
    });
  }

  const mediaInventory = dedupeMedia([
    ...content.flatMap((item) => item.media),
    ...[...attachmentUrls].map(([sourceId, sourceUrl]) => ({ sourceId, sourceUrl, role: 'attachment' as const })),
  ]);
  return {
    source: 'wordpress',
    sourceVersion: field(source, 'wp:wxr_version'),
    siteUrl: siteUrl(source),
    content,
    mediaInventory,
    skipped,
    warnings: items.length === 0 ? ['WXR export contains no items.'] : [],
  };
}

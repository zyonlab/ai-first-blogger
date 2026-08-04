/**
 * Content type contract — the mechanism half.
 *
 * A content type is declared in two places, split by who owns the decision:
 *
 *   site/content-types.yaml         route, label, list copy, surfaces   (yours)
 *   engine/content-types/<name>.ts  schema, JSON-LD, components         (engine)
 *
 * The merged view is what every surface derives from:
 *
 *   collection schema  ->  engine/content.config.ts
 *   list page          ->  engine/pages/[type]/index.astro
 *   detail page        ->  engine/pages/[type]/[slug].astro
 *   navigation         ->  engine/config/nav.ts
 *   home sections      ->  engine/pages/index.astro
 *   rss / llms.txt     ->  engine/pages/rss.xml.ts, engine/pages/llms.txt.ts
 *
 * Adding a content type must not require editing any of those files.
 * See docs/adr/0001-content-type-registry.md and docs/adr/0002-three-planes.md.
 */
import type { ContentTypeSurfaces, SiteContentType } from '../config/content-types';
import type { ListLayout } from '../config/content-types';

export type { ContentTypeSurfaces, SiteContentType };

export type SeoHints = {
  type?: 'website' | 'article';
  image?: string;
  publishedTime?: Date;
  modifiedTime?: Date;
  tags?: string[];
  /** Override the canonical path. Must stay on the site origin (rule C-07). */
  canonical?: string;
};

/**
 * Frontmatter of a content entry.
 *
 * Deliberately untyped: each content type declares its own zod schema, so the
 * concrete shape differs per type and is narrowed at the point of use. The
 * fields every type must carry (title, description, slug) are enforced by
 * `pnpm validate` rule C-11, not by this type.
 */
export type EntryData = Record<string, any>;

export type ContentEntry = {
  id: string;
  body?: string;
  data: EntryData;
};

/** What engine/content-types/<name>.ts declares — the mechanism half. */
export type EngineContentType = {
  /** Collection name. Must match the directory under content/ and the key in site/content-types.yaml. */
  name: string;
  /** Zod object describing the frontmatter. */
  schema: unknown;
  /** Card component key — a file in engine/components/cards/<key>.astro. */
  card: string;
  /** Detail component key — a file in engine/components/details/<key>.astro. */
  detail: string;
  /** Default list arrangement; site/content-types.yaml overrides it. */
  listLayout?: ListLayout;
  /** Sort order for listings. `pubDate` sorts newest first. */
  sortBy?: 'pubDate' | 'none';
  /** Render a tag cloud above the list page, built from `data.tags`. */
  listTagCloud?: boolean;
  /** Extra JSON-LD for the detail page, on top of the breadcrumb graph. */
  jsonLd?: (entry: ContentEntry, ctx: { canonical: string; locale: string }) => Record<string, unknown>[];
  /** SEO hints for the detail page. */
  seo?: (entry: ContentEntry) => SeoHints;
};

/** The merged view every consumer sees: mechanism + the site's half. */
export type ContentTypeDef = EngineContentType & SiteContentType;

/**
 * The two fields every content type carries once a site publishes in more than
 * one language, added to each type's own schema in content.config.ts rather
 * than written into each of them.
 *
 * That is not tidiness. A content type is two halves and one of them ships
 * inside `node_modules`; if `locale` had to be declared per type, a site could
 * not translate a type whose engine module it cannot edit, and every type added
 * after this change would silently be the one type that could not be
 * translated. The shared contract is the only half a site can rely on.
 *
 *   locale          which language this file is. Defaults to the directory it
 *                   is in — `content/posts/en/x.mdx` is the `en` locale — and
 *                   to the site's default locale when that says nothing. State
 *                   it explicitly only to contradict the path.
 *   translationKey  what makes two files the same article in two languages.
 *                   Defaults to `slug`, so a translation that keeps the slug is
 *                   paired with no field at all. Set it on the translation when
 *                   its slug is localised too, which is the case worth doing:
 *                   `/en/writing/why-retries-made-it-worse/` should not be the
 *                   URL of the Chinese article's English twin if the English
 *                   article deserves an English slug.
 */
export const LOCALE_FIELDS = ['locale', 'translationKey'] as const;

/** Narrow a def without losing the literal `name`. */
export function defineContentType<T extends EngineContentType>(def: T): T {
  return def;
}

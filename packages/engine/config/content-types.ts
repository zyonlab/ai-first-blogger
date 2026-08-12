/**
 * site/content-types.yaml → the half of a content type the site owns.
 *
 * A content type has two halves:
 *   site/content-types.yaml       what it is called, its URL, where it appears
 *   engine/content-types/<name>.ts  its schema, JSON-LD and components
 *
 * The engine offers the second half; this file decides which types the site
 * publishes. An engine type nobody declares here is simply not published — a
 * site that installed the engine cannot delete a module inside node_modules,
 * so declining a type has to be sayable from here alone.
 *
 * Only the other direction fails the build by name: a key here with no engine
 * module means the site asked for something that does not exist, and dropping
 * it silently would leave a section missing for reasons nobody can see.
 *
 * The merge, and the history behind the asymmetry: ../content-types/index.ts.
 */
import { fail, KEBAB_CASE, localised, readYaml } from './load';
import { reservedSegments } from './routes';
import { defaultLocale, siteLocales } from './site';

const FILE = 'site/content-types.yaml';

/**
 * How a list page arranges its entries.
 *
 * `stack` is one entry per row. It exists because the first site to want it had
 * to override the whole page to get it, and "the shape of a list" is not a
 * mechanism decision — it is the most visible thing about a blog's index.
 */
export const LIST_LAYOUTS = ['grid', 'grid two', 'stack'] as const;
export type ListLayout = (typeof LIST_LAYOUTS)[number];

/** Where a content type shows up. Omitting a surface means "not there". */
export type ContentTypeSurfaces = {
  /** Sort weight in the main navigation. Omit to keep it out of the nav. */
  nav?: number;
  /** Section on the home page. `order` is the sort weight between sections. */
  home?: { limit: number; order: number };
  /** Include entries in /rss.xml. */
  rss?: boolean;
  /** Include entries in /llms.txt, capped at `limit`. */
  llms?: { limit: number };
  /** Include in the sitemap. Defaults to true. */
  sitemap?: boolean;
};

export type SiteContentType = {
  route: string;
  label: string;
  listTitle: string;
  listDescription: string;
  surfaces: ContentTypeSurfaces;
  /**
   * Serve this type's entries at the engine's root: `/my-post/` rather than
   * `/writing/my-post/`.
   *
   * Only legal when the site publishes exactly one type, which is the only
   * case where the segment carries no information — there is nothing else an
   * entry could be. `route` is still required, and still serves the list page:
   * `/writing/` keeps the archive, its ItemList and its nav entry, while the
   * URLs readers actually share lose a segment they never chose. That is the
   * shape a single-purpose blog has everywhere, and the shape a Ghost site
   * arrives with.
   *
   * Every entry slug then occupies a top-level segment, so a slug that
   * collides with an archive or a fixed page fails the build rather than
   * shadowing the page.
   */
  routeAtRoot?: boolean;
  /**
   * How the list page arranges its entries. Optional — the engine's default
   * per type applies when it is absent.
   *
   * This is an intent fact that used to live only in the engine's content-type
   * modules. It always *worked* from here, because the registry is
   * `{ ...engineType, ...siteType }` and this file is spread in whole; it was
   * simply undocumented, unvalidated, and had no third option. A site that
   * wanted one entry per row therefore replaced the entire list page — 68 lines
   * of which 44 were the engine's own `getStaticPaths` and JSON-LD, copied.
   */
  listLayout?: ListLayout;
  /**
   * Render a tag cloud above the list page. Same story as `listLayout`: the
   * engine has a default per type, and whether a site wants that block is the
   * site's call.
   */
  listTagCloud?: boolean;
};

const document = readYaml<Record<string, Record<string, any>>>('content-types.yaml');
const raw = localised(document, defaultLocale) as Record<string, SiteContentType>;

/**
 * Static page routes a content type must not shadow.
 *
 * Read from the resolved URL space rather than listed: a site that moves its
 * tag archive to `/tag/` has freed `tags` for a content type, and a site that
 * has not is protected exactly as before.
 */
const RESERVED_ROUTES = new Set(reservedSegments());

const problems: string[] = [];
const seenRoutes = new Map<string, string>();

for (const [name, def] of Object.entries(raw)) {
  if (!KEBAB_CASE.test(name)) problems.push(`"${name}" is not kebab-case.`);
  for (const key of ['route', 'label', 'listTitle', 'listDescription'] as const) {
    if (typeof def?.[key] !== 'string' || def[key].trim() === '') {
      problems.push(`"${name}.${key}" is required.`);
    }
  }
  if (def?.route) {
    if (!KEBAB_CASE.test(def.route)) problems.push(`"${name}.route" ("${def.route}") is not kebab-case.`);
    if (RESERVED_ROUTES.has(def.route)) problems.push(`"${name}.route" ("${def.route}") collides with a static page.`);
    const previous = seenRoutes.get(def.route);
    if (previous) problems.push(`"${name}" and "${previous}" both claim route "${def.route}".`);
    seenRoutes.set(def.route, name);
  }
  if (def?.listLayout !== undefined && !LIST_LAYOUTS.includes(def.listLayout)) {
    problems.push(
      `"${name}.listLayout" is "${def.listLayout}". Valid: ${LIST_LAYOUTS.map((l) => `"${l}"`).join(', ')}.`,
    );
  }
  if (def?.surfaces === undefined) {
    problems.push(
      `"${name}.surfaces" is required. A type with no surfaces produces pages nothing links to — ` +
        'declare at least one of nav / home / rss / llms.',
    );
  }
}

/**
 * A locale prefix is a path segment like any other, and it is the *first* one.
 * `locales: { en-US: writing }` would put the English site on top of the Writing
 * section: two different pages claiming `/writing/`, one of which wins by
 * whichever route Astro sorts first. Caught here rather than in site.ts because
 * this is the file that knows what the sections are called.
 */
for (const locale of siteLocales) {
  const clash = seenRoutes.get(locale.prefix);
  if (clash) {
    problems.push(
      `locales."${locale.tag}" uses the prefix "${locale.prefix}", which is also "${clash}.route". ` +
        'A locale prefix is the first URL segment and cannot be a section of the site.',
    );
  }
  if (RESERVED_ROUTES.has(locale.prefix)) {
    problems.push(
      `locales."${locale.tag}" uses the prefix "${locale.prefix}", which is a static page of the engine's.`,
    );
  }
}

if (problems.length > 0) fail(FILE, problems);

export const siteContentTypes = raw;
export const declaredTypeNames = Object.keys(raw);

/**
 * The type that declared `routeAtRoot`, by name — or undefined.
 *
 * Read from the YAML rather than from the merged registry because the
 * integration needs it while loading astro.config, where `astro:content` does
 * not exist yet and the registry therefore cannot be imported. Whether that
 * declaration is *legal* — one type, and only one — is checked in
 * ../content-types/index.ts, which is the module that knows what is published.
 */
export const rootRoutedTypeName = Object.entries(raw).find(([, def]) => def?.routeAtRoot === true)?.[0];

const byLocale = new Map<string, Record<string, SiteContentType>>();

/**
 * The site's half of every content type, in one locale's copy.
 *
 * `route` is not localised and that is a decision, not an omission: one route
 * per type keeps `/writing/` and `/en/writing/` parallel, so a page's
 * translation is derivable from its own URL instead of from a lookup table. The
 * *slug* of an individual entry is free to differ per language — that is what
 * `translationKey` pairs — but the section it lives in is structure.
 */
export function siteContentTypesFor(locale: string = defaultLocale): Record<string, SiteContentType> {
  const cached = byLocale.get(locale);
  if (cached) return cached;
  const merged = localised(document, locale) as Record<string, SiteContentType>;
  byLocale.set(locale, merged);
  return merged;
}

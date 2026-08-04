/**
 * site/content-types.yaml → the half of a content type the site owns.
 *
 * A content type has two halves and both must exist:
 *   site/content-types.yaml       what it is called, its URL, where it appears
 *   engine/content-types/<name>.ts  its schema, JSON-LD and components
 *
 * A key present in only one of them fails the build by name. That mismatch is
 * exactly how case-studies once shipped with no nav entry, no home section and
 * no llms.txt section — four orphan pages nobody linked to.
 */
import { fail, KEBAB_CASE, readYaml } from './load';

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

const raw = readYaml<Record<string, SiteContentType>>('content-types.yaml');

/** Static page routes a content type must not shadow. */
const RESERVED_ROUTES = new Set([
  'topics', 'series', 'about', 'uses', 'newsletter', 'work-with-me',
  'rss.xml', 'robots.txt', 'llms.txt',
]);

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

if (problems.length > 0) fail(FILE, problems);

export const siteContentTypes = raw;
export const declaredTypeNames = Object.keys(raw);

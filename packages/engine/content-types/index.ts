/**
 * Content type registry — merges the two halves of every type.
 *
 * To add a content type:
 *   1. site/content-types.yaml   — route, label, list copy, surfaces
 *   2. engine/content-types/<name>.ts + one line in `engineTypes` below
 *   3. content/<name>/
 *
 * Nothing else in the codebase should need to change.
 * See docs/adr/0001-content-type-registry.md and docs/recipes/add-content-type.md.
 */
import { siteContentTypes, siteContentTypesFor } from '../config/content-types';
import { defaultLocale, reservedSegments, withLocale, type Locale } from '../config/routes';
import { siteLocales } from '../config/site';
import caseStudies from './case-studies';
import posts from './posts';
import projects from './projects';
import videos from './videos';
import type { ContentTypeDef, EngineContentType } from './types';

/** The mechanism half of every type the engine knows how to render. */
const engineTypes: EngineContentType[] = [posts, videos, projects, caseStudies];

/* ------------------------------------------------------------------ *
 * Merge.
 *
 * The engine offers content types; site/content-types.yaml decides which the
 * site publishes. The asymmetry is deliberate and was learned the hard way:
 * requiring both halves for every type made sense while both lived in one
 * repository, and became wrong the moment the engine was a dependency — a site
 * cannot delete a file inside node_modules, so it could never decline a type it
 * did not want.
 *
 * So an engine type nobody declared is simply not published. A declared type
 * with no engine module is still an error: the site asked for something that
 * does not exist, and silently dropping it would produce a section that is
 * missing for reasons nobody can see.
 * ------------------------------------------------------------------ */

const engineByName = new Map(engineTypes.map((type) => [type.name, type]));

const missing = Object.keys(siteContentTypes).filter((name) => !engineByName.has(name));
if (missing.length > 0) {
  throw new Error(
    `Invalid content type registry:\n` +
      missing
        .map(
          (name) =>
            `- site/content-types.yaml declares "${name}", but the engine has no content type by that name.\n` +
            `  Available: ${[...engineByName.keys()].join(', ')}. Remove the key, or add the module to the engine.`,
        )
        .join('\n'),
  );
}

const published = engineTypes.filter((type) => Object.hasOwn(siteContentTypes, type.name));

/* ------------------------------------------------------------------ *
 * `routeAtRoot` — one type's entries served at the engine's root.
 *
 * The guard is the whole feature. `/writing/` carries no information on a site
 * where every entry is under it, and carries all of it on a site where two
 * types exist: dropping the segment there means `/my-post/` and `/my-video/`
 * are indistinguishable, and the first slug that appears in both types wins by
 * whichever route Astro sorts first.
 *
 * So it is refused rather than resolved, at config time, by name.
 * ------------------------------------------------------------------ */

const claimingRoot = published.filter((type) => siteContentTypes[type.name]!.routeAtRoot === true);

if (claimingRoot.length > 1) {
  throw new Error(
    'Invalid content type registry:\n' +
      `- ${claimingRoot.map((type) => `"${type.name}"`).join(' and ')} both set routeAtRoot. ` +
      'Only one type can own the root — two would put every entry of each at the same URL space, ' +
      'where a slug shared by both is a collision the build cannot see.',
  );
}

if (claimingRoot.length === 1 && published.length > 1) {
  throw new Error(
    'Invalid content type registry:\n' +
      `- "${claimingRoot[0]!.name}" sets routeAtRoot, but this site also publishes ` +
      `${published.filter((type) => type !== claimingRoot[0]).map((type) => `"${type.name}"`).join(', ')}.\n` +
      '  The route segment is what tells those types apart. It is droppable only when there is ' +
      'nothing else an entry could be — declare one type, or leave routeAtRoot off.',
  );
}

/** Whether some published type serves its entries at the engine's root. */
export const hasRootRoutedType = claimingRoot.length === 1;

/**
 * The type serving its entries at the engine's root, as one locale reads it.
 *
 * A function, and locale-aware, for the same reason the rest of the registry
 * is: the merged type carries the site's half, and the site's half is
 * translatable.
 */
export function rootRoutedTypeFor(locale: Locale = defaultLocale): ContentTypeDef | undefined {
  if (!hasRootRoutedType) return undefined;
  return registryFor(locale).find((type) => type.name === claimingRoot[0]!.name);
}

const registryByLocale = new Map<Locale, ContentTypeDef[]>();

/**
 * The registry as one locale reads it: the same types, the same routes, the
 * same order — the labels and list copy in that language.
 *
 * A page that renders in a locale takes its types from here, not from
 * `registry`. The difference is a nav bar and a set of `<h1>`s: on a bilingual
 * site `registry` alone renders the English section headings in Chinese, which
 * builds green and is wrong on every page.
 */
export function registryFor(locale: Locale = defaultLocale): ContentTypeDef[] {
  const cached = registryByLocale.get(locale);
  if (cached) return cached;
  const localisedTypes = siteContentTypesFor(locale);
  const built = published.map((type) => ({ ...type, ...localisedTypes[type.name]! }));
  registryByLocale.set(locale, built);
  return built;
}

/** The registry in the site's default locale. */
export const registry: ContentTypeDef[] = registryFor(defaultLocale);

export type { ContentTypeDef, ContentTypeSurfaces, EngineContentType } from './types';

export function getContentType(name: string, locale: Locale = defaultLocale): ContentTypeDef | undefined {
  return registryFor(locale).find((type) => type.name === name);
}

export function getContentTypeByRoute(route: string, locale: Locale = defaultLocale): ContentTypeDef | undefined {
  return registryFor(locale).find((type) => type.route === route);
}

/** Types that appear in the main navigation, in declared order. */
export function navTypesFor(locale: Locale = defaultLocale) {
  return registryFor(locale)
    .filter((type) => type.surfaces.nav !== undefined)
    .sort((a, b) => (a.surfaces.nav ?? 0) - (b.surfaces.nav ?? 0));
}

/** Types that render a section on the home page, in declared order. */
export function homeTypesFor(locale: Locale = defaultLocale) {
  return registryFor(locale)
    .filter((type) => type.surfaces.home !== undefined)
    .sort((a, b) => (a.surfaces.home?.order ?? 0) - (b.surfaces.home?.order ?? 0));
}

export function rssTypesFor(locale: Locale = defaultLocale) {
  return registryFor(locale).filter((type) => type.surfaces.rss === true);
}

export function llmsTypesFor(locale: Locale = defaultLocale) {
  return registryFor(locale).filter((type) => type.surfaces.llms !== undefined);
}

export const navTypes = navTypesFor(defaultLocale);
export const homeTypes = homeTypesFor(defaultLocale);
export const rssTypes = rssTypesFor(defaultLocale);
export const llmsTypes = llmsTypesFor(defaultLocale);

/**
 * Absolute path of a list page, e.g. `/writing/` — `/zh/blog/writing/` when the
 * engine is mounted under a prefix, `/en/writing/` in a non-default locale, and
 * `/zh/blog/en/writing/` when a site does both.
 *
 * These two functions are the only place a content type becomes a URL, which is
 * what made `mount` a small change rather than a sweep and made locale routing a
 * small change on top of it. Keep it that way: a page that builds
 * `/${type.route}/${slug}/` by hand is correct until the day someone mounts the
 * engine or adds a language, and then it is a dead link the build reports as a
 * success.
 */
export function listPath(type: ContentTypeDef, locale: Locale = defaultLocale) {
  return withLocale(`/${type.route}/`, locale);
}

/**
 * Absolute path of a detail page, e.g. `/writing/my-post/` — or `/my-post/` on
 * a site whose single content type claimed the root.
 */
export function entryPath(type: ContentTypeDef, slug: string, locale: Locale = defaultLocale) {
  return withLocale(type.routeAtRoot === true ? `/${slug}/` : `/${type.route}/${slug}/`, locale);
}

/**
 * Slugs that cannot live at the engine's root because something else already
 * does. Only meaningful under `routeAtRoot`, where an entry slug *is* a
 * top-level segment.
 *
 * Returns the offenders rather than throwing, so the caller can report every
 * one of them at once instead of one per build.
 */
export function rootSlugCollisions(slugs: string[]): { slug: string; taken: string }[] {
  if (!hasRootRoutedType) return [];

  const taken = new Map<string, string>();
  for (const segment of reservedSegments()) taken.set(segment, 'a page the engine serves');
  for (const type of published) taken.set(siteContentTypes[type.name]!.route, `the "${type.name}" list page`);
  for (const locale of siteLocales) taken.set(locale.prefix, `the "${locale.tag}" locale prefix`);

  return slugs.flatMap((slug) => {
    const owner = taken.get(slug);
    return owner ? [{ slug, taken: owner }] : [];
  });
}

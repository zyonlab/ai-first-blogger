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
import { defaultLocale, withLocale, type Locale } from '../config/routes';
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

/** Absolute path of a detail page, e.g. `/writing/my-post/`. */
export function entryPath(type: ContentTypeDef, slug: string, locale: Locale = defaultLocale) {
  return withLocale(`/${type.route}/${slug}/`, locale);
}

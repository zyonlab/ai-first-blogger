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
import { siteContentTypes } from '../config/content-types';
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

export const registry: ContentTypeDef[] = engineTypes
  .filter((type) => Object.hasOwn(siteContentTypes, type.name))
  .map((type) => ({ ...type, ...siteContentTypes[type.name]! }));

export type { ContentTypeDef, ContentTypeSurfaces, EngineContentType } from './types';

const byName = new Map(registry.map((type) => [type.name, type]));
const byRoute = new Map(registry.map((type) => [type.route, type]));

export function getContentType(name: string): ContentTypeDef | undefined {
  return byName.get(name);
}

export function getContentTypeByRoute(route: string): ContentTypeDef | undefined {
  return byRoute.get(route);
}

/** Types that appear in the main navigation, in declared order. */
export const navTypes = registry
  .filter((type) => type.surfaces.nav !== undefined)
  .sort((a, b) => (a.surfaces.nav ?? 0) - (b.surfaces.nav ?? 0));

/** Types that render a section on the home page, in declared order. */
export const homeTypes = registry
  .filter((type) => type.surfaces.home !== undefined)
  .sort((a, b) => (a.surfaces.home?.order ?? 0) - (b.surfaces.home?.order ?? 0));

export const rssTypes = registry.filter((type) => type.surfaces.rss === true);

export const llmsTypes = registry.filter((type) => type.surfaces.llms !== undefined);

/** Absolute path of a list page, e.g. `/writing/`. */
export function listPath(type: ContentTypeDef) {
  return `/${type.route}/`;
}

/** Absolute path of a detail page, e.g. `/writing/my-post/`. */
export function entryPath(type: ContentTypeDef, slug: string) {
  return `/${type.route}/${slug}/`;
}

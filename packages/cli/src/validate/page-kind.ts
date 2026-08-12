/**
 * Is this URL a listing page or a detail page?
 *
 * Several rules need the answer and none of them can get it from the URL alone
 * any more. Depth used to be enough — one segment is a listing, two is an entry
 * — and two site decisions broke that:
 *
 *   routes: { tags: tag }   in site/taxonomy.yaml    the archive moved
 *   routeAtRoot: true       in site/content-types.yaml  entries are one deep
 *
 * A site that sets the second has articles at `/my-post/`, which the old
 * heuristic filed as listing pages: C-21 then demanded 40 columns of
 * introductory prose from every article, and C-22 stopped counting cards on
 * pages that have them. Neither is a wrong *answer* so much as a rule quietly
 * measuring the wrong thing, which is the failure this file exists to stop.
 *
 * Read from the site's own config rather than from `.aifb/build.json`, the same
 * way `links-source.ts` reads it: these are declarations, not observations of a
 * particular build.
 */
import { siteContentTypes } from 'aifb-engine/config/content-types';
import { segmentFor } from 'aifb-engine/config/routes';
import { engineSegments } from './url';
import type { BuiltPage } from './types';

/**
 * The taxonomy archives, whose second segment is a term rather than a slug.
 * A set rather than three comparisons because the next archive added would
 * otherwise be filed as a detail page in one function and a listing page in
 * neither.
 */
export const TAXONOMY_ARCHIVES = new Set([segmentFor('topics'), segmentFor('series'), segmentFor('tags')]);

/** True when one content type serves its entries at the engine's root. */
const rootRouted = Object.values(siteContentTypes).some((def) => def?.routeAtRoot === true);

/**
 * One-segment URLs that are still pages rather than entries.
 *
 * Only consulted on a root-routed site, where a single segment is ambiguous.
 * Everywhere else one segment has always meant a listing page and still does.
 */
const ONE_SEGMENT_PAGES = new Set([
  ...Object.values(siteContentTypes).map((def) => def?.route).filter((route): route is string => typeof route === 'string'),
  ...TAXONOMY_ARCHIVES,
  'about',
  'uses',
  'newsletter',
  'work-with-me',
]);

export function isListingUrl(url: string, mount: string, localePrefixes: string[]) {
  const segments = engineSegments(url, mount, localePrefixes);
  if (segments.length === 0) return false;
  if (segments.length === 1) return rootRouted ? ONE_SEGMENT_PAGES.has(segments[0]!) : true;
  return segments.length === 2 && TAXONOMY_ARCHIVES.has(segments[0]!);
}

export function isDetailUrl(url: string, mount: string, localePrefixes: string[]) {
  const segments = engineSegments(url, mount, localePrefixes);
  if (rootRouted && segments.length === 1) return !ONE_SEGMENT_PAGES.has(segments[0]!);
  return segments.length >= 2 && !TAXONOMY_ARCHIVES.has(segments[0]!);
}

export const isListingPage = (page: BuiltPage, mount: string, localePrefixes: string[]) =>
  isListingUrl(page.url, mount, localePrefixes);

export const isDetailPage = (page: BuiltPage, mount: string, localePrefixes: string[]) =>
  isDetailUrl(page.url, mount, localePrefixes);

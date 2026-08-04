/**
 * Navigation is derived: a content type declaring `surfaces.nav` in
 * site/content-types.yaml appears here automatically, interleaved with the
 * static entries from site/site.yaml by `order`.
 *
 * This is what stops a new content type from silently becoming an orphan
 * section the way case-studies did.
 */
import { listPath, navTypesFor, registry } from '../content-types/index';
import {
  OPTIONAL_PAGES,
  defaultLocale,
  hasPage,
  homePath,
  llmsPath,
  rssPath,
  withLocale,
  type Locale,
} from './routes';
import { staticNavItems, staticNavItemsFor } from './site';

export { staticNavItems };

/**
 * An href written in site/*.yaml — a nav entry, a hero action — resolved
 * against the engine's URL space, in one locale.
 *
 * A site states `/topics/` because that is where the page is; under
 * `mount: '/zh/blog'` the page is at `/zh/blog/topics/`, on the English side of
 * a bilingual site it is at `/en/topics/`, and the site should not have to know
 * either. So an href that names a route this engine injects is moved with it,
 * and an href that does not is left exactly as written — on a mounted engine
 * most of the site's links belong to the host, and rewriting those would be the
 * same defect in the other direction.
 *
 * The consequence worth stating: exclude `about` from `engine({ pages })` and
 * `/about/` stops being an engine route, so a nav entry pointing at it now
 * means the host's own `/about/`. If the host has no such page the gate reports
 * a dead link (C-03), which is the correct answer to a nav entry that points
 * nowhere.
 */
export function engineHref(href: string, locale: Locale = defaultLocale): string {
  if (typeof href !== 'string' || !href.startsWith('/')) return href;
  if (href === '/') return homePath(locale);
  if (href === '/rss.xml') return rssPath(locale);
  if (href === '/llms.txt') return llmsPath(locale);

  // Section roots, so `/topics/llm-reliability/` moves with `/topics/`.
  const roots = [
    ...OPTIONAL_PAGES.filter((name) => hasPage(name)).map((name) => `/${name}/`),
    // Routes are not localised — `/writing/` is `/writing/` in every language,
    // only the prefix in front of it moves. See siteContentTypesFor().
    ...registry.map((type) => `/${type.route}/`),
  ];
  return roots.some((root) => href.startsWith(root)) ? withLocale(href, locale) : href;
}

/**
 * The main navigation in one locale.
 *
 * `types` narrows the content types listed — a locale lists a section only when
 * that section has something in it, which is the same decision the list page
 * itself makes. A nav entry pointing at a listing page the build declined to
 * produce is a dead link on every page of that language.
 */
export function navItemsFor(locale: Locale = defaultLocale, types = navTypesFor(locale)) {
  return [
    ...types.map((type) => ({
      href: listPath(type, locale),
      label: type.listTitle,
      order: type.surfaces.nav ?? 0,
    })),
    ...staticNavItemsFor(locale).map((item) => ({ ...item, href: engineHref(item.href, locale) })),
  ]
    .sort((a, b) => a.order - b.order)
    .map(({ href, label }) => ({ href, label }));
}

export const navItems = navItemsFor(defaultLocale);

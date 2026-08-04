/**
 * Navigation is derived: a content type declaring `surfaces.nav` in
 * site/content-types.yaml appears here automatically, interleaved with the
 * static entries from site/site.yaml by `order`.
 *
 * This is what stops a new content type from silently becoming an orphan
 * section the way case-studies did.
 */
import { listPath, navTypes, registry } from '../content-types/index';
import { OPTIONAL_PAGES, hasPage, homePath, llmsPath, rssPath, withMount } from './routes';
import { staticNavItems } from './site';

export { staticNavItems };

/**
 * An href written in site/*.yaml — a nav entry, a hero action — resolved
 * against the engine's URL space.
 *
 * A site states `/topics/` because that is where the page is; under
 * `mount: '/zh/blog'` the page is at `/zh/blog/topics/` and the site should not
 * have to know that. So an href that names a route this engine injects is
 * moved with it, and an href that does not is left exactly as written — on a
 * mounted engine most of the site's links belong to the host, and rewriting
 * those would be the same defect in the other direction.
 *
 * The consequence worth stating: exclude `about` from `engine({ pages })` and
 * `/about/` stops being an engine route, so a nav entry pointing at it now
 * means the host's own `/about/`. If the host has no such page the gate reports
 * a dead link (C-03), which is the correct answer to a nav entry that points
 * nowhere.
 */
export function engineHref(href: string): string {
  if (typeof href !== 'string' || !href.startsWith('/')) return href;
  if (href === '/') return homePath;
  if (href === '/rss.xml') return rssPath;
  if (href === '/llms.txt') return llmsPath;

  // Section roots, so `/topics/llm-reliability/` moves with `/topics/`.
  const roots = [
    ...OPTIONAL_PAGES.filter((name) => hasPage(name)).map((name) => `/${name}/`),
    ...registry.map((type) => `/${type.route}/`),
  ];
  return roots.some((root) => href.startsWith(root)) ? withMount(href) : href;
}

export const navItems = [
  ...navTypes.map((type) => ({
    href: listPath(type),
    label: type.listTitle,
    order: type.surfaces.nav ?? 0,
  })),
  ...staticNavItems.map((item) => ({ ...item, href: engineHref(item.href) })),
]
  .sort((a, b) => a.order - b.order)
  .map(({ href, label }) => ({ href, label }));

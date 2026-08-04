/**
 * Navigation is derived: a content type declaring `surfaces.nav` in
 * site/content-types.yaml appears here automatically, interleaved with the
 * static entries from site/site.yaml by `order`.
 *
 * This is what stops a new content type from silently becoming an orphan
 * section the way case-studies did.
 */
import { listPath, navTypes } from '../content-types/index';
import { staticNavItems } from './site';

export { staticNavItems };

export const navItems = [
  ...navTypes.map((type) => ({
    href: listPath(type),
    label: type.listTitle,
    order: type.surfaces.nav ?? 0,
  })),
  ...staticNavItems,
]
  .sort((a, b) => a.order - b.order)
  .map(({ href, label }) => ({ href, label }));

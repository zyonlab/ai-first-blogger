import { site } from '@config/site';

export function absoluteUrl(path = '/') {
  if (path.startsWith('http')) return path;
  return new URL(path, site.url).toString();
}

/**
 * Resolve a canonical override, refusing anything that points off-origin.
 *
 * A cross-origin canonical tells search engines "the real version of this page
 * lives elsewhere", which hands the page's ranking to that other site. That is
 * almost never what a template user intends, so it fails the build instead of
 * shipping silently. Rule C-07 in docs/specs/content-contract.md.
 */
export function assertSameOrigin(override: string | undefined, fallback: string, context: string) {
  if (!override) return fallback;
  if (!override.startsWith('http')) return override;

  const siteOrigin = new URL(site.url).origin;
  const overrideOrigin = new URL(override).origin;
  if (overrideOrigin !== siteOrigin) {
    throw new Error(
      `Cross-origin canonical in ${context}: "${override}" points at ${overrideOrigin}, but this site is ${siteOrigin}. ` +
        'Remove the canonical field, or set PUBLIC_SITE_URL to the domain you are publishing under.',
    );
  }
  return new URL(override).pathname;
}

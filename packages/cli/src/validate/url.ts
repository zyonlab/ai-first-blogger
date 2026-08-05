/**
 * URLs, as the gate has to read them.
 *
 * The engine can be installed under a prefix (`engine({ mount: '/zh/blog' })`)
 * and can publish more than one language (`locales:` in site/site.yaml), and
 * both put segments in front of every URL the site authored:
 *
 *   /zh/blog/en/writing/my-post/
 *   ^^^^^^^^ mount        the host's decision about where the engine lives
 *            ^^ locale    which language this copy of the page is
 *               ^^^^^^^^^^^^^^^^ the site's own URL, and the only part a rule
 *                                that counts segments is asking about
 *
 * Rules that count segments — "one segment is a listing page", "the home page
 * is `/`" — subtract both first. A rule that skipped either step would not
 * fail; it would quietly stop matching, which is the failure this file exists
 * to prevent. Under a two-language mounted site it would be off by two.
 *
 * The order is fixed by the engine and repeated here rather than guessed: mount
 * outside, locale inside. See config/routes.ts and ADR 0006.
 */

/** The path with the mount removed: `/zh/blog/writing/` → `/writing/`. */
export function unmounted(url: string, mount: string) {
  if (mount === '' || !url.startsWith(mount)) return url;
  const rest = url.slice(mount.length);
  return rest === '' ? '/' : rest;
}

/**
 * The path relative to the engine's root in its own locale:
 * `/zh/blog/en/writing/` → `/writing/`.
 */
export function enginePath(url: string, mount: string, localePrefixes: readonly string[] = []) {
  const own = unmounted(url, mount);
  const [first] = own.split('/').filter(Boolean);
  if (first === undefined || !localePrefixes.includes(first)) return own;
  const rest = own.slice(`/${first}`.length);
  return rest === '' ? '/' : rest;
}

/** Which locale prefix a URL carries, or `''` for the default locale's URLs. */
export function localePrefixOf(url: string, mount: string, localePrefixes: readonly string[] = []) {
  const [first] = unmounted(url, mount).split('/').filter(Boolean);
  return first !== undefined && localePrefixes.includes(first) ? first : '';
}

/** Segments of the engine-relative path, e.g. `['writing', 'my-post']`. */
export function engineSegments(url: string, mount: string, localePrefixes: readonly string[] = []) {
  return enginePath(url, mount, localePrefixes).split('/').filter(Boolean);
}

/** True for the engine's own root in any locale — `/`, `/en/`, `/zh/blog/en/`. */
export function isEngineRoot(url: string, mount: string, localePrefixes: readonly string[] = []) {
  return enginePath(url, mount, localePrefixes) === '/';
}

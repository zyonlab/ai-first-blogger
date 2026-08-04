/**
 * URLs, as the gate has to read them.
 *
 * The engine can be installed under a prefix (`engine({ mount: '/zh/blog' })`),
 * and a mounted build's URLs are the same URLs one directory deeper. Rules that
 * count segments — "one segment is a listing page", "the home page is `/`" —
 * are asking about the engine's own URL space, not the host's, so they subtract
 * the mount first. A rule that skipped this step would not fail; it would
 * quietly stop matching, which is the failure this file exists to prevent.
 */

/** The path relative to the engine's root: `/zh/blog/writing/` → `/writing/`. */
export function enginePath(url: string, mount: string) {
  if (mount === '' || !url.startsWith(mount)) return url;
  const rest = url.slice(mount.length);
  return rest === '' ? '/' : rest;
}

/** Segments of the engine-relative path, e.g. `['writing', 'my-post']`. */
export function engineSegments(url: string, mount: string) {
  return enginePath(url, mount).split('/').filter(Boolean);
}

/** True for the engine's own root — `/` unmounted, `/zh/blog/` mounted. */
export function isEngineRoot(url: string, mount: string) {
  return enginePath(url, mount) === '/';
}

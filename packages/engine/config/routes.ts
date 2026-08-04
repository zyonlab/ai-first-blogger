/**
 * The engine's URL space: where it is mounted, and which fixed pages it owns.
 *
 * Until 0.2.2 the engine assumed it *was* the site. It injected `/`, `/404` and
 * `/robots.txt` at the origin root, which is fine for a site that is only a blog
 * and impossible for a site that already has those. Installing the engine into
 * an existing Astro site collided head-on with it — three routes the host
 * already served, plus four pages (`/about/`, `/uses/`, `/newsletter/`,
 * `/work-with-me/`) it never asked for.
 *
 * `mount` moves the whole tree under a prefix. The prefix is applied in exactly
 * one place — `withMount()` — and every absolute path the engine emits is built
 * from a helper here or from `listPath()` / `entryPath()` in the content type
 * registry, which are themselves built from `withMount()`. That is deliberate:
 * a prefix sprinkled across thirty components is a prefix that will be missing
 * from one of them, and a missing prefix is a wrong canonical or a sitemap entry
 * pointing at a page that does not exist — the failure class this project's gate
 * exists to catch, arriving through the one door the gate cannot see behind.
 *
 * Three groups of routes, and they behave differently under a mount:
 *
 *   always      `/` (the engine's own root), `/rss.xml`, `/llms.txt`, and every
 *               content type route. A mounted engine with no root page has no
 *               landing page and every breadcrumb trail points at a 404; the
 *               feeds are what the mount is *for*. `pages` does not govern them.
 *   optional    `about`, `newsletter`, `series`, `topics`, `uses`,
 *               `work-with-me` — the fixed pages a host site may already have or
 *               may simply not want. `pages` is the whitelist; default is all.
 *   root only   `404`, `robots.txt`. Both are origin-level facts. A robots.txt
 *               at `/zh/blog/robots.txt` is read by nobody, and a 404 route
 *               under a prefix cannot be what the host serves for an unknown
 *               URL. Under a mount the engine does not emit them at all rather
 *               than emitting them somewhere they do not work.
 *
 * How the resolved values get here: the options are given to `engine()` in
 * astro.config, and this module is loaded again — separately — inside Vite's SSR
 * module graph when a page renders. The two graphs share a process but not a
 * module registry, so `engine()` publishes the resolution through the
 * environment (`configureRoutes` below) and this module reads it at load time.
 * astro.config is evaluated before any page module, so the ordering holds for
 * both `astro build` and `astro dev`. A plain node script that never loaded the
 * config — `pnpm context`, `pnpm surfaces` — sees the default, an unmounted
 * engine; the gate does not guess, it reads the mount the build recorded (see
 * `.aifb/build.json`).
 */

/** Fixed pages a site can decline via `engine({ pages })`. Names are the URL segment. */
export const OPTIONAL_PAGES = ['about', 'newsletter', 'series', 'topics', 'uses', 'work-with-me'] as const;

export type OptionalPage = (typeof OPTIONAL_PAGES)[number];

/** Injected only when the engine owns the origin root. See the header comment. */
export const ROOT_ONLY_PAGES = ['404', 'robots.txt'] as const;

const MOUNT_ENV = 'AIFB_MOUNT';
const PAGES_ENV = 'AIFB_PAGES';

/**
 * `'/'` → `''`, `'/zh/blog/'` → `'/zh/blog'`.
 *
 * The root is the empty string on purpose: it makes `${mount}${path}` the whole
 * rule, so the default mount is byte-identical to having no mount at all rather
 * than merely equivalent to it.
 */
export function normaliseMount(raw: string | undefined | null): string {
  const value = (raw ?? '/').trim();
  if (value === '' || value === '/') return '';

  const problems: string[] = [];
  if (!value.startsWith('/')) problems.push('it must start with "/" — a mount is an absolute path from the origin root');
  if (/[?#\s]/.test(value)) problems.push('it must be a path, with no query string, fragment or whitespace');
  if (/\/\//.test(value)) problems.push('it has an empty path segment');
  if (problems.length > 0) {
    throw new Error(
      `Invalid engine({ mount: ${JSON.stringify(raw)} }):\n` +
        problems.map((problem) => `  - ${problem}`).join('\n') +
        '\n  Example: mount: \'/zh/blog\'.',
    );
  }
  return value.replace(/\/+$/, '');
}

export function normalisePages(raw: readonly string[] | undefined | null): Set<OptionalPage> {
  if (raw === undefined || raw === null) return new Set(OPTIONAL_PAGES);
  if (!Array.isArray(raw)) {
    throw new Error(`Invalid engine({ pages }): expected a list of page names, got ${JSON.stringify(raw)}.`);
  }

  const unknown = raw.filter((name) => !OPTIONAL_PAGES.includes(name as OptionalPage));
  if (unknown.length > 0) {
    throw new Error(
      `Invalid engine({ pages }): ${unknown.map((name) => JSON.stringify(name)).join(', ')} ` +
        `${unknown.length === 1 ? 'is not a page' : 'are not pages'} this option governs.\n` +
        `  Whitelistable: ${OPTIONAL_PAGES.join(', ')}.\n` +
        '  The root page, the feeds and the content type routes are always injected; ' +
        'a content type is declared in site/content-types.yaml, not here.',
    );
  }
  return new Set(raw as OptionalPage[]);
}

function resolve(rawMount: string | undefined, rawPages: readonly string[] | undefined) {
  const mount = normaliseMount(rawMount);
  const pages = normalisePages(rawPages);

  /**
   * The one place a prefix is applied. Anything that is not an absolute path of
   * this engine's — an external URL, a `mailto:`, a fragment — is returned
   * untouched, because prefixing it would be a corruption rather than a move.
   */
  const withMount = (path: string) => (mount === '' || !path.startsWith('/') ? path : `${mount}${path}`);

  return { mount, pages, withMount };
}

const active = resolve(process.env[MOUNT_ENV], process.env[PAGES_ENV]?.split(',').filter(Boolean));

/** `''` when the engine owns the origin root, otherwise e.g. `/zh/blog`. */
export const mount = active.mount;

/** Whether this site publishes one of the fixed pages. */
export function hasPage(name: OptionalPage) {
  return active.pages.has(name);
}

/** Prefix an engine-owned absolute path with the mount. `/topics/` → `/zh/blog/topics/`. */
export const withMount = active.withMount;

/**
 * Resolve the options `engine()` was given and publish them to the module graph
 * the pages render in. Returns the resolution so the integration works from the
 * same values rather than from its own copy of this module's constants — that
 * copy is loaded before the options exist and would report an unmounted engine.
 */
export function configureRoutes(options: { mount?: string; pages?: readonly string[] }) {
  const resolved = resolve(options.mount, options.pages);
  process.env[MOUNT_ENV] = resolved.mount;
  process.env[PAGES_ENV] = [...resolved.pages].join(',');
  return resolved;
}

/* ------------------------------------------------------------------ *
 * The engine's own routes, as paths. Every one of these goes through
 * `withMount`; nothing outside this file and the content type registry
 * builds an engine path by hand.
 * ------------------------------------------------------------------ */

/** The engine's root — the home page, or the blog index of a mounted engine. */
export const homePath = withMount('/');

export const rssPath = withMount('/rss.xml');

export const llmsPath = withMount('/llms.txt');

/** The path of a fixed page, e.g. `/topics/` or `/work-with-me/`. */
export function pagePath(name: OptionalPage) {
  return withMount(`/${name}/`);
}

export function topicPath(slug: string) {
  return withMount(`/topics/${slug}/`);
}

export function seriesPath(slug: string) {
  return withMount(`/series/${slug}/`);
}

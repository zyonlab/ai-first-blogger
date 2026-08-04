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
 *
 * ## Locale composes *inside* the mount
 *
 * `site/site.yaml` can declare more than one locale (see `siteLocales` in
 * ./site.ts). The default locale is served at the engine's root and every other
 * one behind its prefix, and the prefix goes **after** the mount:
 *
 *     mount '/blog', default zh-CN, also en-US at 'en'
 *
 *     /blog/            /blog/writing/       zh-CN
 *     /blog/en/         /blog/en/writing/    en-US
 *
 * That order is forced, not chosen. The mount is a fact about the host site's
 * URL space — the host decided the engine lives at `/blog`, and it may already
 * serve `/en/` for pages of its own that this engine will never see. Putting the
 * engine's locale prefix outside the mount would mean the engine claiming
 * `/en/blog/`: inventing a URL in a namespace it was given no authority over,
 * and colliding with the host's own translation of everything else.
 *
 * The other direction of the same rule: a site whose *host* is bilingual and
 * mounts a single-language engine under `/zh/blog/` is doing exactly what it did
 * in 0.3.0 and should not also declare `locales` — the language is already in
 * the mount, and declaring it again is how you get `/zh/blog/zh/`.
 *
 * `withLocale()` is the composition, and it is the only function that knows the
 * order. Everything with a locale in it — every path helper below, `listPath()`
 * and `entryPath()` in the registry — is built from it, for the same reason
 * everything with a mount in it is built from `withMount()`.
 */
import { defaultLocale, isMultiLocale, siteLocales } from './site';

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
 * Locale.
 *
 * The list comes from site/site.yaml — it is an intent fact, not an
 * installation fact, so unlike `mount` it needs no environment channel:
 * the same YAML is readable from both module graphs and from a plain
 * node script.
 * ------------------------------------------------------------------ */

export type Locale = string;

export { defaultLocale, isMultiLocale, siteLocales };

/** Every locale this site publishes, default first. */
export const locales: Locale[] = siteLocales.map((locale) => locale.tag);

const prefixByLocale = new Map(siteLocales.map((locale) => [locale.tag, locale.prefix]));
const localeByPrefix = new Map(siteLocales.map((locale) => [locale.prefix, locale.tag]));

export function isDeclaredLocale(locale: string): boolean {
  return prefixByLocale.has(locale);
}

/**
 * The URL segment a locale is served under: `''` for the default locale,
 * `/en` for the rest.
 *
 * The default locale's own prefix is deliberately dropped here rather than
 * never declared. `hreflang` and the sitemap both need to name it, and a value
 * that exists in two shapes — declared for one purpose, invented for another —
 * is the shape of a disagreement nobody can see. It is declared once, and this
 * is the one function that decides it does not appear in a path.
 */
export function localePrefix(locale: Locale = defaultLocale): string {
  if (locale === defaultLocale) return '';
  const prefix = prefixByLocale.get(locale);
  if (prefix === undefined) {
    throw new Error(
      `Unknown locale "${locale}". Declared in site/site.yaml: ${locales.join(', ')}. ` +
        'A page cannot be rendered in a language the site does not publish.',
    );
  }
  return `/${prefix}`;
}

/**
 * The composition: an engine-owned path, in one locale, under this mount.
 *
 *   withLocale('/writing/', 'en-US')   // '/blog/en/writing/'
 *
 * Mount outside, locale inside — see the header comment for why that order is
 * forced. At one locale this is `withMount` exactly, which is why a
 * single-language site's output is byte-identical to 0.3.0 rather than merely
 * equivalent to it.
 */
export function withLocale(path: string, locale: Locale = defaultLocale): string {
  if (!path.startsWith('/')) return path;
  return withMount(`${localePrefix(locale)}${path}`);
}

/**
 * Which locale a URL on this site is in.
 *
 * The read side of `withLocale`, and the reason no component has to be handed
 * its locale through thirty props: a rendering component knows `Astro.url`, and
 * `Astro.url` already says which locale's page it is inside. A module-level
 * "current locale" would be the obvious alternative and is not safe — a static
 * build renders pages concurrently through one module registry, so a mutable
 * global is a page rendering in whichever language finished last.
 */
export function localeOfPath(pathname: string): Locale {
  if (!isMultiLocale) return defaultLocale;
  const own = mount !== '' && pathname.startsWith(mount) ? pathname.slice(mount.length) : pathname;
  const first = own.split('/').filter(Boolean)[0];
  return (first !== undefined && localeByPrefix.get(first)) || defaultLocale;
}

/**
 * The `[...locale]` segment of an injected route, one row per locale.
 *
 * Every route the engine injects for content carries an optional rest
 * parameter in front of it (see `LOCALE_SEGMENT` and the integration). A rest
 * parameter that is `undefined` collapses, so the default locale's paths come
 * out at the engine root exactly as they always did, and every other locale's
 * come out under its prefix. `getStaticPaths` iterates this.
 *
 * The single-locale site returns one row with `param: undefined`, which is the
 * same list of pages 0.3.0 built, from the same code path.
 */
export function localeParams(): { locale: Locale; param: string | undefined }[] {
  return siteLocales.map(({ tag, prefix }) => ({
    locale: tag,
    param: tag === defaultLocale ? undefined : prefix,
  }));
}

/**
 * The `locale` entry of a `params` object, or nothing.
 *
 * Nothing on a single-language site: the route has no such segment there, and a
 * `getStaticPaths` naming a parameter its route does not have is a parameter
 * Astro has no home for.
 */
export function localeParam(param: string | undefined): { locale?: string } {
  return isMultiLocale ? { locale: param as string } : {};
}

/**
 * `getStaticPaths` for a fixed page: one per locale, and nothing else.
 *
 * A fixed page is copy, and a site that declares a language is claiming to
 * serve its About page in it. If the copy is not translated the page renders
 * the default language's words — visible to anyone who opens it, and reported
 * by C-31 — which is a better failure than a URL the nav links to and the build
 * never produced.
 *
 * `undefined` on a single-language site, because there the route has no
 * `[...locale]` segment to fill and is not dynamic at all. Astro warns about a
 * `getStaticPaths` on a static route, and a warning on every build of every
 * site that never asked for a second language is a warning people learn to
 * scroll past.
 */
export const localeStaticPaths = isMultiLocale
  ? () => localeParams().map(({ param }) => ({ params: { locale: param } }))
  : undefined;

/**
 * The rest-parameter segment injected in front of every localisable route.
 *
 * Kept here beside `withLocale` because the two have to agree: the segment
 * decides where a page is *built* and `withLocale` decides what every link to
 * it says. Two files disagreeing about that is a site whose every internal link
 * is one directory off.
 */
export const LOCALE_SEGMENT = '/[...locale]';

/* ------------------------------------------------------------------ *
 * The engine's own routes, as paths. Every one of these goes through
 * `withLocale`, and so through `withMount`; nothing outside this file and
 * the content type registry builds an engine path by hand.
 *
 * They take a locale rather than reading one, and they are functions
 * rather than constants because of it. `homePath` was a constant until
 * 0.4.0; an override still using it as a value is a type error naming the
 * line, which is the loud version of the failure. The quiet version —
 * keeping the constant beside the function — is an override that renders
 * a Chinese link on every English page and builds green.
 * ------------------------------------------------------------------ */

/** The engine's root in one locale — the home page, or a mounted engine's index. */
export function homePath(locale: Locale = defaultLocale) {
  return withLocale('/', locale);
}

export function rssPath(locale: Locale = defaultLocale) {
  return withLocale('/rss.xml', locale);
}

export function llmsPath(locale: Locale = defaultLocale) {
  return withLocale('/llms.txt', locale);
}

/** The path of a fixed page, e.g. `/topics/` or `/work-with-me/`. */
export function pagePath(name: OptionalPage, locale: Locale = defaultLocale) {
  return withLocale(`/${name}/`, locale);
}

export function topicPath(slug: string, locale: Locale = defaultLocale) {
  return withLocale(`/topics/${slug}/`, locale);
}

export function seriesPath(slug: string, locale: Locale = defaultLocale) {
  return withLocale(`/series/${slug}/`, locale);
}

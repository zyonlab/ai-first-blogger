/**
 * site/site.yaml → typed brand configuration.
 *
 * `PUBLIC_SITE_URL` still wins over `url`, so CI can build the same tree for a
 * preview domain and the real one.
 *
 * Everything outward-facing here is readable per locale: `site` is the default
 * locale's view, `siteFor(tag)` is any other's. See `localised()` in ./load.ts
 * for the `i18n:` block that produces the difference, and ADR 0006 for why the
 * list of locales is an intent fact and lives in this file rather than in
 * `engine()` the way `mount` does.
 */
import { declaredLocales, fail, localised, readYaml, requireList, requireRecord, requireString } from './load';

const FILE = 'site/site.yaml';
const document = readYaml<Record<string, any>>('site.yaml');

type NavEntry = { href: string; label: string; order: number };
type HeroAction = { label: string; href: string; variant?: string };

/* ------------------------------------------------------------------ *
 * Locales.
 *
 * `locale` has meant "the one language this site publishes in" since the
 * beginning and still does: it is the **default** locale, served at the engine's
 * root with no prefix. `locales` is the new, optional key — the full set,
 * including the default — and its values are the URL segment each non-default
 * locale is served under:
 *
 *     locale: zh-CN
 *     locales:
 *       zh-CN: zh
 *       en-US: en
 *
 *     /            /writing/       zh-CN, the default, at the root
 *     /en/         /en/writing/    en-US, behind its prefix
 *
 * Omitting `locales` is the single-locale site, which is every site that exists
 * today: one locale, no prefix, and not one byte of output different from 0.3.0.
 * That is the whole migration path — a 0.3.0 site is already correct.
 *
 * The default locale still declares a prefix even though its own URLs never
 * carry one. It is not decoration: `hreflang` and `@astrojs/sitemap`'s
 * `i18n.locales` both need a key for it, and a value that exists only inside the
 * engine would be one more thing a site cannot see when its sitemap disagrees
 * with its head tags.
 * ------------------------------------------------------------------ */

export type SiteLocale = {
  /** BCP 47 tag, e.g. `zh-CN`. Must have a message table in engine/i18n/. */
  tag: string;
  /** URL segment, e.g. `zh`. Unused in URLs for the default locale. */
  prefix: string;
};

const LOCALE_TAG = /^[a-z]{2,3}(?:-[A-Za-z0-9]+)*$/;
const LOCALE_PREFIX = /^[a-z]{2,3}(?:-[a-z0-9]+)*$/;

const problems: string[] = [];

const theme = requireRecord(document, 'theme', FILE);
if (theme.defaultMode !== 'dark' && theme.defaultMode !== 'light') {
  problems.push('theme.defaultMode must be "dark" or "light" — it must match the theme\'s :root block.');
}
for (const key of ['name', 'colorDark', 'colorLight', 'storageKey']) {
  if (typeof theme[key] !== 'string') problems.push(`theme.${key} is required.`);
}

const og = requireRecord(document, 'og', FILE);
if (typeof og.default !== 'string') {
  problems.push('og.default is required — the site-wide fallback Open Graph image.');
} else if (/\.svg(\?|$)/i.test(og.default)) {
  problems.push('og.default must be a raster image (png/jpg/webp). No social platform renders SVG — see rule C-01.');
}

const author = requireRecord(document, 'author', FILE);
for (const key of ['name', 'title', 'bio', 'email']) {
  if (typeof author[key] !== 'string') problems.push(`author.${key} is required.`);
}

const url = requireString(document, 'url', FILE);
try {
  new URL(url);
} catch {
  problems.push(`url "${url}" is not an absolute URL.`);
}

export const defaultLocale = requireString(document, 'locale', FILE);

function readLocales(): SiteLocale[] {
  const raw = document.locales;
  if (raw === undefined || raw === null) return [{ tag: defaultLocale, prefix: defaultLocale.split('-')[0]! }];

  if (typeof raw !== 'object' || Array.isArray(raw)) {
    problems.push(
      'locales must be a mapping of locale tag to URL prefix, e.g. `locales: { zh-CN: zh, en-US: en }`. ' +
        'Remove the key entirely for a single-language site.',
    );
    return [{ tag: defaultLocale, prefix: defaultLocale.split('-')[0]! }];
  }

  const entries = Object.entries(raw as Record<string, unknown>);
  const seenPrefix = new Map<string, string>();
  const out: SiteLocale[] = [];

  for (const [tag, prefix] of entries) {
    if (!LOCALE_TAG.test(tag)) problems.push(`locales key "${tag}" is not a BCP 47 language tag (e.g. zh-CN, en-US).`);
    if (typeof prefix !== 'string' || !LOCALE_PREFIX.test(prefix)) {
      problems.push(`locales."${tag}" must be a lowercase URL segment, e.g. "zh". Got ${JSON.stringify(prefix)}.`);
      continue;
    }
    const previous = seenPrefix.get(prefix);
    if (previous) {
      problems.push(
        `locales."${tag}" and locales."${previous}" both use the prefix "${prefix}". ` +
          'Two languages under one path is one language with two sets of pages at the same URL.',
      );
    }
    seenPrefix.set(prefix, tag);
    out.push({ tag, prefix });
  }

  if (out.length > 0 && !out.some((locale) => locale.tag === defaultLocale)) {
    problems.push(
      `locale is "${defaultLocale}" but locales does not list it. The default locale is served at the root, ` +
        'and it is still a locale — add it, with the prefix its hreflang and sitemap entries should use.',
    );
    return [{ tag: defaultLocale, prefix: defaultLocale.split('-')[0]! }, ...out];
  }

  // The default first: it is the one every listing, every fallback and
  // `x-default` resolves to, so callers should never have to sort for it.
  return [...out].sort((a, b) => Number(b.tag === defaultLocale) - Number(a.tag === defaultLocale));
}

export const siteLocales = readLocales();

/** True when this site publishes more than one language. */
export const isMultiLocale = siteLocales.length > 1;

const localeTags = new Set(siteLocales.map((locale) => locale.tag));
for (const tag of declaredLocales(document)) {
  if (!localeTags.has(tag)) {
    problems.push(
      `an i18n: block declares copy for "${tag}", which is not in locales. ` +
        `Declared: ${[...localeTags].join(', ')}. Copy for a language the site does not publish is copy nothing renders.`,
    );
  }
}

if (problems.length > 0) fail(FILE, problems);

/**
 * The blocks the home page can stack, in the order `home.sections` lists them.
 *
 * `content` is every content type declaring `surfaces.home`, kept in the order
 * the registry already sorts them by — one token rather than one per type,
 * because which types exist is `site/content-types.yaml`'s question and their
 * order among themselves is `surfaces.home.order`'s. This list only answers
 * where that group sits relative to the taxonomy blocks.
 */
export const HOME_SECTIONS = ['content', 'topics', 'series'] as const;

export type HomeSection = (typeof HOME_SECTIONS)[number];

/** Today's markup order, and therefore the default. */
const DEFAULT_HOME_SECTIONS: HomeSection[] = ['topics', 'series', 'content'];

/**
 * `home.sections` — which blocks the landing page shows, and in what order.
 *
 * Section order used to be markup: Topics and Series were hardcoded ahead of
 * the content types, so a product blog whose readers arrive from search and
 * want the writing had no way to put the writing first short of forking
 * `pages/index.astro` — which `docs/specs/templates.md` rightly discourages,
 * because the fork takes the SEO contract with it.
 *
 * Omission is subtraction: a site that lists `[content]` renders no taxonomy
 * blocks at all. That makes this one list answer both questions, which is why
 * it is a list and not three booleans plus a weight.
 */
function readHomeSections(raw: unknown): HomeSection[] {
  if (raw === undefined || raw === null) return DEFAULT_HOME_SECTIONS;

  // Reported here rather than pushed onto `problems`: that list is flushed
  // above, before any call to `buildSite`, so anything added now would never
  // reach a reader.
  const wrong: string[] = [];
  if (!Array.isArray(raw)) {
    fail(FILE, [`home.sections must be a list. Allowed: ${HOME_SECTIONS.join(', ')}.`]);
  }

  const seen = new Set<string>();
  const out: HomeSection[] = [];
  for (const entry of raw as unknown[]) {
    if (typeof entry !== 'string' || !(HOME_SECTIONS as readonly string[]).includes(entry)) {
      wrong.push(`home.sections lists ${JSON.stringify(entry)}. Allowed: ${HOME_SECTIONS.join(', ')}.`);
      continue;
    }
    if (seen.has(entry)) {
      wrong.push(`home.sections lists "${entry}" twice. A section renders once, wherever it is first named.`);
      continue;
    }
    seen.add(entry);
    out.push(entry as HomeSection);
  }
  if (wrong.length > 0) fail(FILE, wrong);
  return out;
}

function buildSite(raw: Record<string, any>) {
  const rawTheme = requireRecord(raw, 'theme', FILE);
  const rawAuthor = requireRecord(raw, 'author', FILE);
  return {
    name: requireString(raw, 'name', FILE),
    title: requireString(raw, 'title', FILE),
    description: requireString(raw, 'description', FILE),
    url: import.meta.env?.PUBLIC_SITE_URL ?? process.env.PUBLIC_SITE_URL ?? url,
    /**
     * The site's default locale.
     *
     * It kept its name through the multi-locale change on purpose. On a
     * single-language site it means exactly what it always did, and every
     * reader of it — the voice check, `Intl` formatting, `inLanguage` — is
     * asking about the language of the page it is rendering, which for those
     * callers is this one. A page that renders in another locale is handed that
     * locale explicitly; see ADR 0006.
     */
    locale: requireString(raw, 'locale', FILE),
    /**
     * How a page title is composed. `{title}` is the page's own title, `{name}`
     * the site name. Every column the suffix costs comes out of the ~60 a search
     * result shows (rule C-05), so on a site with a long name dropping it is a
     * legitimate choice — and it is the site's choice, not the engine's.
     */
    titleTemplate: (raw.titleTemplate as string) ?? '{title} · {name}',
    themeStorageKey: rawTheme.storageKey as string,
    theme: {
      name: rawTheme.name as string,
      defaultMode: rawTheme.defaultMode as 'dark' | 'light',
      colorDark: rawTheme.colorDark as string,
      colorLight: rawTheme.colorLight as string,
    },
    og: { default: (raw.og?.default as string) ?? (og.default as string) },
    brand: {
      initial: (raw.brand?.initial as string) ?? requireString(raw, 'name', FILE).slice(0, 1),
      tagline: (raw.brand?.tagline as string) ?? '',
      keywords: (raw.brand?.keywords as string[]) ?? [],
    },
    author: {
      name: rawAuthor.name as string,
      title: rawAuthor.title as string,
      bio: rawAuthor.bio as string,
      email: rawAuthor.email as string,
    },
    social: (raw.social ?? {}) as Record<string, string>,
    hero: {
      eyebrow: (raw.hero?.eyebrow as string) ?? '',
      title: (raw.hero?.title as string) ?? requireString(raw, 'name', FILE),
      description: (raw.hero?.description as string) ?? requireString(raw, 'description', FILE),
      actions: ((raw.hero?.actions ?? []) as HeroAction[]),
      signals: ((raw.hero?.signals ?? []) as string[]),
    },
    home: {
      sections: readHomeSections(raw.home?.sections),
      /**
       * `.hero-panel` — the Focus Map beside the hero.
       *
       * Unset means "render it when there is something in it". The panel used
       * to render unconditionally, so a site that declared no signals got an
       * empty box under a heading; emptying `hero.signals` was not a way to
       * remove it and there was no other. A site that has signals sees exactly
       * what it saw before, which is the only site the panel was ever for.
       */
      panel: (raw.home?.panel as boolean | undefined) ?? ((raw.hero?.signals ?? []) as string[]).length > 0,
    },
    services: {
      title: (raw.services?.title as string) ?? '',
      description: (raw.services?.description as string) ?? '',
      serviceName: (raw.services?.serviceName as string) ?? '',
      serviceTypes: ((raw.services?.serviceTypes ?? []) as string[]),
      contactText: (raw.services?.contactText as string) ?? '',
    },
  };
}

const byLocale = new Map<string, ReturnType<typeof buildSite>>();

/** The brand configuration as one locale sees it. */
export function siteFor(locale: string = defaultLocale) {
  const cached = byLocale.get(locale);
  if (cached) return cached;
  const built = buildSite(localised(document, locale));
  byLocale.set(locale, built);
  return built;
}

/**
 * Site configuration in the default locale. Shape is stable for the engine; the
 * values come from site/site.yaml and nowhere else.
 *
 * Every locale-neutral consumer — the CLI, the readiness check, the deploy
 * integration — reads this. A rendering surface reads `siteFor(locale)`.
 */
export const site = siteFor(defaultLocale);

export type SiteConfig = ReturnType<typeof buildSite>;

/** Static navigation entries. Content types register themselves separately. */
export function staticNavItemsFor(locale: string = defaultLocale): NavEntry[] {
  return requireList<NavEntry>(localised(document, locale), 'nav', FILE);
}

export const staticNavItems = staticNavItemsFor(defaultLocale);

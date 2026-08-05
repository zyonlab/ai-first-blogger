/**
 * site/pages.yaml → copy for the static pages.
 *
 * This is site-owner content, not UI chrome: a new owner rewrites it rather
 * than translating it, which is why it is here and not in engine/i18n/.
 *
 * Every key used to be mandatory, by accident: the file was a bare
 * `readYaml<PagesConfig>` cast, so a site that declined `/uses/` still had to
 * carry `uses:` copy, and a site that forgot a key got `undefined is not an
 * object` from inside a component at render time. Both are now decided in one
 * place — the integration asks `pageCopyProblems()` for the pages it is about
 * to inject, before the build starts, and names the file, the key and the two
 * ways out. A page nobody publishes needs no copy.
 */
import { fail, localised, readYaml } from './load';
import { defaultLocale } from './site';
import type { OptionalPage } from './routes';

type Titled = { title: string; description: string };

/**
 * Optional here means "a site that does not publish this page may omit it",
 * not "the page renders without it". Read a section through `requirePageCopy`
 * and a missing one fails by name instead of arriving as `undefined`.
 */
export type PagesConfig = {
  topics?: Titled;
  series?: Titled;
  about?: { title: string; sections: { heading: string; body: string }[] };
  newsletter?: { title: string; description: string; body: string; action: string };
  uses?: { title: string; description: string; items: { name: string; body: string }[] };
  workWithMe?: { action: string; services: { name: string; body: string }[] };
};

const document = readYaml<Record<string, any>>('pages.yaml');

const byLocale = new Map<string, PagesConfig>();

/**
 * The static-page copy as one locale sees it.
 *
 * Whole sections merge key by key, so a locale that translates the About page's
 * headings but keeps the same section *structure* states only the headings —
 * and a locale that states nothing renders the default language's copy rather
 * than an empty page. That fallback is deliberate and it is visible: an English
 * About page reading in Chinese is obvious to anyone who opens it, and C-31
 * reports it. An empty one would be a soft 404 nobody sees.
 */
export function pagesFor(locale: string = defaultLocale): PagesConfig {
  const cached = byLocale.get(locale);
  if (cached) return cached;
  const merged = localised(document, locale) as PagesConfig;
  byLocale.set(locale, merged);
  return merged;
}

export const pages = pagesFor(defaultLocale);

/** The key in pages.yaml that carries the copy for a page. */
const COPY_KEY: Record<OptionalPage, keyof PagesConfig> = {
  about: 'about',
  newsletter: 'newsletter',
  series: 'series',
  topics: 'topics',
  uses: 'uses',
  'work-with-me': 'workWithMe',
};

/** What each section must contain for its page to render. */
const REQUIRED: Record<keyof PagesConfig, { strings: string[]; lists: string[] }> = {
  topics: { strings: ['title', 'description'], lists: [] },
  series: { strings: ['title', 'description'], lists: [] },
  about: { strings: ['title'], lists: ['sections'] },
  newsletter: { strings: ['title', 'description', 'body', 'action'], lists: [] },
  uses: { strings: ['title', 'description'], lists: ['items'] },
  workWithMe: { strings: ['action'], lists: ['services'] },
};

/**
 * Everything wrong with the copy for one page, written for whoever has to fix
 * it. Empty means the page can render.
 */
export function pageCopyProblems(page: OptionalPage, locale: string = defaultLocale): string[] {
  const key = COPY_KEY[page];
  const section = pagesFor(locale)[key] as Record<string, unknown> | undefined;

  if (section === undefined || section === null || typeof section !== 'object') {
    return [
      `"${key}" is missing, and the /${page}/ page renders from it. ` +
        `Add the key, or drop "${page}" from engine({ pages: [...] }) in astro.config.mjs.`,
    ];
  }

  const problems: string[] = [];
  for (const field of REQUIRED[key].strings) {
    const value = section[field];
    if (typeof value !== 'string' || value.trim() === '') {
      problems.push(`"${key}.${field}" is required and must be a non-empty string.`);
    }
  }
  for (const field of REQUIRED[key].lists) {
    if (!Array.isArray(section[field])) problems.push(`"${key}.${field}" is required and must be a list.`);
  }
  return problems;
}

/**
 * The copy for one page, or a failure that names the file and the key.
 *
 * The integration checks this before the build so the usual failure arrives at
 * config time; this is the second line, for the case it cannot see — a site's
 * own template rendering an engine page it was never asked about.
 */
export function requirePageCopy<K extends keyof PagesConfig>(
  key: K,
  locale: string = defaultLocale,
): NonNullable<PagesConfig[K]> {
  const page = (Object.keys(COPY_KEY) as OptionalPage[]).find((name) => COPY_KEY[name] === key)!;
  const problems = pageCopyProblems(page, locale);
  if (problems.length > 0) fail('site/pages.yaml', problems);
  return pagesFor(locale)[key] as NonNullable<PagesConfig[K]>;
}

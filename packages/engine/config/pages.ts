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
import { fail, KEBAB_CASE, localised, readYaml } from './load';
import { siteContentTypes } from './content-types';
import { defaultLocale, siteLocales } from './site';
import { reservedSegments, withLocale, type OptionalPage } from './routes';

type Titled = { title: string; description: string };

/**
 * Optional here means "a site that does not publish this page may omit it",
 * not "the page renders without it". Read a section through `requirePageCopy`
 * and a missing one fails by name instead of arriving as `undefined`.
 */
export type PagesConfig = {
  topics?: Titled;
  series?: Titled;
  tags?: Titled;
  about?: { title: string; sections: { heading: string; body: string }[] };
  newsletter?: { title: string; description: string; body: string; action: string };
  uses?: { title: string; description: string; items: { name: string; body: string }[] };
  workWithMe?: { action: string; services: { name: string; body: string }[] };
};

const FILE = 'site/pages.yaml';
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
  tags: 'tags',
  topics: 'topics',
  uses: 'uses',
  'work-with-me': 'workWithMe',
};

/** What each section must contain for its page to render. */
const REQUIRED: Record<keyof PagesConfig, { strings: string[]; lists: string[] }> = {
  topics: { strings: ['title', 'description'], lists: [] },
  series: { strings: ['title', 'description'], lists: [] },
  tags: { strings: ['title', 'description'], lists: [] },
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

/* ------------------------------------------------------------------ *
 * Pages the site adds.
 *
 * A Ghost page is structurally a post that lives at `/{slug}/` and stays out
 * of collections, feeds and archives, and most Ghost sites have several —
 * About, Privacy, Uses, Now. This engine had a fixed list seven long, and
 * `site/templates/pages/` could only *override* a route the engine already
 * injects: a new file there produced a warning and nothing else.
 *
 * The whitelist logic that produced that warning is right, and this does not
 * undo it. A page URL should be **declared**, not conjured by dropping a file
 * in a directory — that is what makes `engine({ pages })` mean something, and
 * why an override for a declined page is reported rather than silently
 * resurrecting the URL. What was missing was a way to *declare* one.
 *
 *     own:
 *       privacy:
 *         title: Privacy
 *         description: …
 *
 * rendered by `site/templates/pages/privacy.astro`. The page is then the
 * engine's: it moves with `mount`, it is in the page inventory, and
 * `engineHref('/privacy/')` resolves like any other engine route — none of
 * which is true of the documented escape hatch, the host's own `src/pages/`.
 *
 * Deliberately not a content entry (`content/pages/privacy.mdx`), which is the
 * other shape the issue raised and the one closer to Ghost. That shape needs
 * answers this one does not: which surfaces a page entry is kept out of, how
 * the gate's article rules apply to a page that is not an article, and what
 * happens to `/{slug}/` when a content type already claims the root. A page
 * that is markup is the half that was blocking sites today.
 * ------------------------------------------------------------------ */

export type OwnPage = { name: string; title: string; description: string };

function readOwnPages(): OwnPage[] {
  const raw = document.own;
  if (raw === undefined || raw === null) return [];

  if (typeof raw !== 'object' || Array.isArray(raw)) {
    fail(FILE, ['own must be a mapping of URL segment to page copy, e.g. `own: { privacy: { title: …, description: … } }`.']);
  }

  const problems: string[] = [];
  const out: OwnPage[] = [];
  const taken = new Map<string, string>();
  for (const segment of reservedSegments()) taken.set(segment, 'a page the engine serves');
  for (const [name, def] of Object.entries(siteContentTypes)) taken.set(def.route, `the "${name}" list page`);
  for (const locale of siteLocales) taken.set(locale.prefix, `the "${locale.tag}" locale prefix`);

  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!KEBAB_CASE.test(name)) {
      problems.push(`own."${name}" is not a single kebab-case path segment.`);
      continue;
    }
    const owner = taken.get(name);
    if (owner !== undefined) {
      problems.push(`own."${name}" collides with ${owner}. One URL, one page.`);
      continue;
    }
    const copy = value as Record<string, unknown> | null;
    if (copy === null || typeof copy !== 'object' || Array.isArray(copy)) {
      problems.push(`own."${name}" must be a mapping with title and description.`);
      continue;
    }
    for (const field of ['title', 'description']) {
      if (typeof copy[field] !== 'string' || (copy[field] as string).trim() === '') {
        problems.push(`own."${name}.${field}" is required and must be a non-empty string.`);
      }
    }
    taken.set(name, `own."${name}"`);
    out.push({ name, title: copy.title as string, description: copy.description as string });
  }

  if (problems.length > 0) fail(FILE, problems);
  return out;
}

/** Pages this site declared, in declaration order. */
export const ownPages = readOwnPages();

const ownPageNames = new Set(ownPages.map((page) => page.name));

/** Whether a URL segment is one of the site's own declared pages. */
export function isOwnPage(name: string) {
  return ownPageNames.has(name);
}

/** The path of a declared page, e.g. `/privacy/` — mounted and localised. */
export function ownPagePath(name: string, locale: string = defaultLocale) {
  return withLocale(`/${name}/`, locale);
}

/**
 * A declared page's copy in one locale, for the template that renders it.
 *
 * Same `i18n:` merge as every other section of this file, so a bilingual site
 * translates the title and description where the rest of its copy lives.
 */
export function requireOwnPage(name: string, locale: string = defaultLocale): OwnPage {
  const section = (pagesFor(locale) as Record<string, any>).own?.[name];
  if (section === undefined) fail(FILE, [`own."${name}" is not declared, but a template asked for its copy.`]);
  return { name, title: section.title as string, description: section.description as string };
}

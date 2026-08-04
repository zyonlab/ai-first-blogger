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
import { fail, readYaml } from './load';
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

export const pages = readYaml<PagesConfig>('pages.yaml');

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
export function pageCopyProblems(page: OptionalPage): string[] {
  const key = COPY_KEY[page];
  const section = pages[key] as Record<string, unknown> | undefined;

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
export function requirePageCopy<K extends keyof PagesConfig>(key: K): NonNullable<PagesConfig[K]> {
  const page = (Object.keys(COPY_KEY) as OptionalPage[]).find((name) => COPY_KEY[name] === key)!;
  const problems = pageCopyProblems(page);
  if (problems.length > 0) fail('site/pages.yaml', problems);
  return pages[key] as NonNullable<PagesConfig[K]>;
}

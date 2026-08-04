/**
 * The rules that exist because a site can be published in more than one
 * language.
 *
 * Both are silent on a single-language site — there are no `hreflang` tags to
 * check and no second copy of anything — so adding them did not restate any
 * existing site's score.
 *
 * They are here rather than folded into the on-page rules because they answer a
 * different question. The on-page rules ask whether a page is well-formed;
 * these ask whether the *claims a page makes about its other language versions*
 * are true. A wrong `hreflang` does not look wrong from inside the page that
 * carries it — it is a promise about a different URL, and the only place to
 * check a promise like that is against the whole build.
 *
 * Contract: docs/specs/content-contract.md
 */
import { hreflangLinks, htmlLang, titleText } from '../html';
import type { BuiltPage, Rule, Violation } from '../types';

/** `https://x.example/en/a/` and `/en/a/` are the same page written two ways. */
function pathOf(href: string, siteOrigin: string) {
  try {
    const url = new URL(href, siteOrigin);
    return url.origin === new URL(siteOrigin).origin ? url.pathname : undefined;
  } catch {
    return undefined;
  }
}

function normalise(url: string) {
  if (url === '/') return '/';
  return url.endsWith('/') ? url : `${url}/`;
}

/**
 * The set of pages one page claims are itself in another language, as paths.
 * `x-default` is excluded: it names which of them to fall back to, and counting
 * it as a member would make every set look like it contains its default twice.
 */
export function alternatePaths(page: BuiltPage, siteOrigin: string) {
  return hreflangLinks(page.html)
    .filter((link) => link.hreflang !== 'x-default')
    .map((link) => ({ hreflang: link.hreflang, path: pathOf(link.href, siteOrigin) }));
}

export const localeRules: Rule[] = [
  {
    id: 'C-30',
    title: 'hreflang points at pages that exist, and points back',
    severity: 'error',
    needsBuild: true,
    /**
     * The three ways a translated site lies to a crawler, all of which build
     * green:
     *
     *   1. an alternate that was never built — the soft 404 the whole feature
     *      exists to avoid, and the one that costs rankings rather than just
     *      looking untidy;
     *   2. a set that does not include the page carrying it, which Google
     *      documents as required and treats as reason to ignore the whole set;
     *   3. a set that is not reciprocal — A claims B, B does not claim A — which
     *      is how a half-finished translation gets indexed as a duplicate of the
     *      page it was translated from.
     *
     * Also checked: `x-default` names a page in the set. An `x-default` pointing
     * somewhere else is a fallback that leaves the group.
     */
    run: ({ pages, siteOrigin }) => {
      const built = new Set(pages.map((page) => normalise(page.url)));
      const claimsOf = new Map<string, Set<string>>();
      for (const page of pages) {
        const paths = alternatePaths(page, siteOrigin)
          .map((alternate) => alternate.path)
          .filter((path): path is string => path !== undefined)
          .map(normalise);
        if (paths.length > 0) claimsOf.set(normalise(page.url), new Set(paths));
      }

      const out: Violation[] = [];
      for (const page of pages) {
        const self = normalise(page.url);
        const links = alternatePaths(page, siteOrigin);
        if (links.length === 0) continue;

        for (const { hreflang, path } of links) {
          if (path === undefined) {
            out.push({
              rule: 'C-30',
              severity: 'error',
              file: page.url,
              message: `hreflang="${hreflang}" points off this origin.`,
              fix: 'A translation of this page lives on this site. Cross-origin alternates hand the language pair to somebody else.',
            });
            continue;
          }
          if (!built.has(normalise(path))) {
            out.push({
              rule: 'C-30',
              severity: 'error',
              file: page.url,
              message: `hreflang="${hreflang}" points at ${path}, which this build did not produce.`,
              fix: 'Either write that translation, or stop advertising it. An hreflang pointing at a missing page is a soft 404 with a tag vouching for it — the single worst outcome of publishing in two languages.',
            });
            continue;
          }
          if (normalise(path) === self) continue;
          const back = claimsOf.get(normalise(path));
          if (!back || !back.has(self)) {
            out.push({
              rule: 'C-30',
              severity: 'error',
              file: page.url,
              message: `Claims ${path} as its ${hreflang} version, but that page does not claim this one back.`,
              fix: 'hreflang has to be reciprocal or search engines drop the whole set. Both pages come from the same `translationKey`, so this usually means one of the two files is missing it.',
            });
          }
        }

        const includesSelf = links.some((link) => link.path !== undefined && normalise(link.path) === self);
        if (!includesSelf) {
          out.push({
            rule: 'C-30',
            severity: 'error',
            file: page.url,
            message: 'Page lists alternates but not itself.',
            fix: 'A hreflang set must include a self-referential entry, or search engines ignore it. @lib/alternates builds the set including the current page.',
          });
        }

        const xDefault = hreflangLinks(page.html).find((link) => link.hreflang === 'x-default');
        if (xDefault) {
          const target = pathOf(xDefault.href, siteOrigin);
          const inSet = target !== undefined && links.some((link) => link.path !== undefined && normalise(link.path) === normalise(target));
          if (!inSet) {
            out.push({
              rule: 'C-30',
              severity: 'error',
              file: page.url,
              message: `x-default points at ${target ?? xDefault.href}, which is not one of this page's alternates.`,
              fix: 'x-default names which of the alternates to serve when no language matches. Pointing outside the set sends unmatched readers to a page that is not part of the group.',
            });
          }
        }
      }
      return out;
    },
  },

  {
    id: 'C-31',
    title: 'A translation says something different',
    severity: 'warn',
    needsBuild: true,
    /**
     * Two pages in a hreflang set, in different languages, with the same
     * `<title>` — which means the copy was never translated.
     *
     * This is the other half of the C-14 change. C-14 stopped calling
     * translations duplicate titles, because they are not: they are the same
     * page in two languages, and a rule that flags them is a rule that gets
     * switched off by the first person it annoys. But "not a duplicate" is not
     * the same as "fine", and the page that reaches an English reader with a
     * Chinese heading on it is a real defect — it is just a different one, at a
     * different severity, with a different fix.
     *
     * A warning rather than an error on purpose. Translating copy is work that
     * lands after the routing does, and a site should be able to publish an
     * English section before every string in it is English. What it should not
     * be able to do is forget.
     */
    run: ({ pages, siteOrigin }) => {
      const byPath = new Map(pages.map((page) => [normalise(page.url), page]));
      const reported = new Set<string>();
      const out: Violation[] = [];

      for (const page of pages) {
        const title = titleText(page.html);
        const lang = htmlLang(page.html);
        if (!title || !lang) continue;

        for (const { path } of alternatePaths(page, siteOrigin)) {
          if (path === undefined) continue;
          const other = byPath.get(normalise(path));
          if (!other || other.url === page.url) continue;
          const otherLang = htmlLang(other.html);
          if (!otherLang || otherLang === lang) continue;
          if (titleText(other.html) !== title) continue;

          const key = [page.url, other.url].sort().join(' ');
          if (reported.has(key)) continue;
          reported.add(key);

          out.push({
            rule: 'C-31',
            severity: 'warn',
            file: page.url,
            message: `Same title as its ${otherLang} version at ${other.url}: "${title}".`,
            fix: `Add an i18n: block for ${lang} to the copy this page reads — site/pages.yaml, site/taxonomy.yaml or site/site.yaml — or write the article in ${lang}. Until then this page is in ${lang} by declaration only.`,
          });
        }
      }
      return out;
    },
  },
];

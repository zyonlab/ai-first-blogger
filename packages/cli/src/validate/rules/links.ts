import { internalLinks } from '../html';
import type { Rule, Violation } from '../types';
import { enginePath } from '../url';

/** Built asset paths that are legitimate link targets but not HTML pages. */
const NON_PAGE_TARGETS = new Set(['/rss.xml', '/robots.txt', '/llms.txt', '/sitemap-index.xml']);

function normalise(url: string) {
  if (url === '/') return '/';
  return url.endsWith('/') ? url : `${url}/`;
}

export const linkRules: Rule[] = [
  {
    id: 'C-03',
    title: 'No dead internal links',
    severity: 'error',
    needsBuild: true,
    run: ({ pages, mount, localePrefixes }) => {
      const known = new Set(pages.map((page) => normalise(page.url)));
      const out: Violation[] = [];

      for (const page of pages) {
        for (const href of internalLinks(page.html)) {
          if (NON_PAGE_TARGETS.has(href)) continue;
          // Static assets under /content/, /favicon.svg etc. are not pages.
          if (/\.[a-z0-9]{2,5}$/i.test(href)) continue;
          if (known.has(normalise(href))) continue;

          /**
           * The one dead link a mounted site produces over and over: an article
           * that says `/writing/x/` because that is where the page was before
           * the engine moved. The engine does not rewrite links inside content —
           * on a mounted site most root-relative links belong to the host, and
           * guessing which are ours would break the others — so the rule that
           * catches it should also say what the link should have been.
           */
          const mounted = mount !== '' && known.has(normalise(`${mount}${href}`));

          /**
           * The other one, and it arrives the first time a site adds a
           * language: a link into `/en/projects/` because the site's own nav or
           * hero names `/projects/`, on a site where nothing under Projects has
           * been translated. The listing page for a language with nothing in it
           * is deliberately not built (see pages/[type]/index.astro), so this is
           * the engine reporting a link the *intent layer* asked for — and the
           * fix is in the intent layer, not in the markup.
           */
          const withoutMount = mount === '' ? href : href.slice(mount.length);
          const prefix = localePrefixes.find(
            (item) => withoutMount === `/${item}` || withoutMount.startsWith(`/${item}/`),
          );
          const inDefault =
            prefix !== undefined && known.has(normalise(`${mount}${withoutMount.slice(`/${prefix}`.length) || '/'}`));

          out.push({
            rule: 'C-03',
            severity: 'error',
            file: page.url,
            message: mounted
              ? `Links to "${href}", which is not a built page — but "${mount}${normalise(href)}" is.`
              : inDefault
                ? `Links to "${href}", which is not a built page — that section has nothing in /${prefix}/.`
                : `Links to "${href}", which is not a built page.`,
            fix: mounted
              ? `This engine is mounted at ${mount}/. Links written in content are real paths and carry the prefix: use "${mount}${normalise(href)}".`
              : inDefault
                ? `A listing page is only built for a language that has entries. Either publish one under content/**/${prefix}/, or give this href its own value for that locale with an i18n: block in site/site.yaml.`
                : 'Fix the href, or add the missing page. Trailing slashes matter — Astro builds directory-style URLs.',
          });
        }
      }
      return out;
    },
  },

  {
    id: 'C-04',
    title: 'No orphan pages',
    severity: 'error',
    needsBuild: true,
    run: ({ pages, mount, localePrefixes }) => {
      const inbound = new Map<string, number>();
      for (const page of pages) inbound.set(normalise(page.url), 0);

      for (const page of pages) {
        const from = normalise(page.url);
        for (const href of internalLinks(page.html)) {
          const to = normalise(href);
          if (to === from) continue; // self-links do not count
          if (!inbound.has(to)) continue;
          inbound.set(to, (inbound.get(to) ?? 0) + 1);
        }
      }

      const out: Violation[] = [];
      for (const [url, count] of inbound) {
        // The home page and the 404 page have no inbound links by design. Under
        // a mount the home page is the mount root — `/zh/blog/` — and the 404
        // belongs to the host, which this build does not contain. Every locale
        // has a root of its own and each one is exempt for the same reason;
        // they are not unreachable either, since the header's language switch
        // links them from every page.
        const own = enginePath(url, mount, localePrefixes);
        if (own === '/' || own.startsWith('/404') || count > 0) continue;
        out.push({
          rule: 'C-04',
          severity: 'error',
          file: url,
          message: 'No inbound internal links — the page is reachable only via the sitemap.',
          fix: 'Declare a `surfaces` entry for this content type so its pages are listed somewhere, or link the page from a list, topic or series page.',
        });
      }
      return out;
    },
  },
];

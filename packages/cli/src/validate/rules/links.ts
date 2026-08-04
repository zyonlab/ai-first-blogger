import { internalLinks } from '../html';
import type { Rule, Violation } from '../types';

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
    run: ({ pages }) => {
      const known = new Set(pages.map((page) => normalise(page.url)));
      const out: Violation[] = [];

      for (const page of pages) {
        for (const href of internalLinks(page.html)) {
          if (NON_PAGE_TARGETS.has(href)) continue;
          // Static assets under /content/, /favicon.svg etc. are not pages.
          if (/\.[a-z0-9]{2,5}$/i.test(href)) continue;
          if (known.has(normalise(href))) continue;

          out.push({
            rule: 'C-03',
            severity: 'error',
            file: page.url,
            message: `Links to "${href}", which is not a built page.`,
            fix: 'Fix the href, or add the missing page. Trailing slashes matter — Astro builds directory-style URLs.',
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
    run: ({ pages }) => {
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
        // The home page and the 404 page have no inbound links by design.
        if (url === '/' || url.startsWith('/404') || count > 0) continue;
        out.push({
          rule: 'C-04',
          severity: 'error',
          file: url,
          message: 'No inbound internal links — the page is reachable only via the sitemap.',
          fix: 'Declare a `surfaces` entry for the content type in packages/engine/content-types/, or link the page from a list, topic or series page.',
        });
      }
      return out;
    },
  },
];

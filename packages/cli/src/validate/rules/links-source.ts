/**
 * Internal links in *authored* content, resolved without a build.
 *
 * C-03 already catches dead links, but only in `dist/`, which means an agent
 * learns about them one build later and the message can only say "not a built
 * page". By then the article is written and the reason is not obvious: most of
 * these links are not typos, they point at a topic or series page that does not
 * exist *yet* because no published entry uses that category.
 *
 * This rule answers the same question against `content/`, in milliseconds, and
 * explains which of the three reasons applies. C-03 stays: it also covers links
 * emitted by templates, which never appear in any article's source.
 */
import { siteContentTypes } from 'aifb-engine/config/content-types';
import { topics, series } from 'aifb-engine/config/taxonomy';
import type { Rule, Violation } from '../types';

/** Pages the engine always renders, regardless of content. */
const STATIC_PAGES = new Set(['/', '/about/', '/uses/', '/newsletter/', '/work-with-me/', '/topics/', '/series/']);

const linkPattern = /\]\((\/[^)\s]*)\)/g;

function normalise(href: string) {
  const clean = href.split('#')[0]!.split('?')[0]!;
  if (clean === '' || clean === '/') return '/';
  return clean.endsWith('/') ? clean : `${clean}/`;
}

export const sourceLinkRules: Rule[] = [
  {
    id: 'C-25',
    title: 'Authored links resolve',
    severity: 'error',
    run: ({ entries, mount, localePrefixes }) => {
      const out: Violation[] = [];

      // What the site will actually render, derived the same way the pages are.
      const routes = new Map(Object.entries(siteContentTypes).map(([name, def]) => [def.route, name]));

      /**
       * Everything below is per language.
       *
       * A link is written inside an article that is itself in a language, and
       * it resolves against the pages built for that language. Pooling the
       * languages would pass a Chinese article linking `/en/writing/x/` when
       * no English article exists — and, worse, would pass an English article
       * linking `/en/topics/y/` because a Chinese article uses that topic,
       * which is precisely the page the build declines to produce.
       */
      const slugsByRoute = new Map<string, Set<string>>();
      const usedCategories = new Map<string, Set<string>>();
      const usedSeries = new Map<string, Set<string>>();

      const add = (table: Map<string, Set<string>>, key: string, value: string) => {
        if (!table.has(key)) table.set(key, new Set());
        table.get(key)!.add(value);
      };

      /** The language of a content file: its `locale`, else its directory. */
      const localeOf = (entry: (typeof entries)[number]) => {
        if (typeof entry.data.locale === 'string' && entry.data.locale.trim() !== '') {
          const declared = entry.data.locale as string;
          return localePrefixes.find((prefix) => declared.startsWith(`${prefix}-`) || declared === prefix) ?? '';
        }
        const parts = entry.file.split('/');
        const head = parts.length > 3 ? parts[2]! : undefined;
        return head !== undefined && localePrefixes.includes(head) ? head : '';
      };

      for (const entry of entries) {
        const route = siteContentTypes[entry.type]?.route;
        const slug = entry.data.slug as string | undefined;
        const prefix = localeOf(entry);
        if (route && slug) add(slugsByRoute, `${prefix}|${route}`, slug);
        if (typeof entry.data.category === 'string') add(usedCategories, prefix, entry.data.category);
        if (typeof entry.data.series === 'string') add(usedSeries, prefix, entry.data.series);
      }

      const listable = (kind: 'topics' | 'series', slug: string, prefix: string) =>
        kind === 'topics'
          ? Object.hasOwn(topics, slug) && topics[slug]!.listed !== false && (usedCategories.get(prefix)?.has(slug) ?? false)
          : Object.hasOwn(series, slug) && (usedSeries.get(prefix)?.has(slug) ?? false);

      for (const entry of entries) {
        for (const match of entry.body.matchAll(linkPattern)) {
          const written = normalise(match[1]!);

          // Assets are not pages.
          if (/\.[a-z0-9]{2,5}\/$/i.test(written)) continue;

          /**
           * A mounted engine shares the origin with a site this rule knows
           * nothing about. `/privacy/` on the host is a perfectly good link and
           * resolves against pages that are not in `content/`, so only links
           * inside the mount are ours to judge — the rest are C-03's, which
           * checks them against everything the build actually produced.
           */
          if (mount !== '' && !written.startsWith(`${mount}/`)) continue;
          const unmounted = mount === '' ? written : written.slice(mount.length);

          /**
           * The locale a link points *into*, which is not necessarily the one
           * the article is written in. Cross-language links are legitimate —
           * "the Chinese version of this" is a link an English article should
           * be able to make — so the prefix in the href decides which set of
           * pages the target has to be in, and the article's own language only
           * decides the default.
           */
          const linkHead = unmounted.split('/').filter(Boolean)[0];
          const linkPrefix = linkHead !== undefined && localePrefixes.includes(linkHead) ? linkHead : '';
          const href = linkPrefix === '' ? unmounted : unmounted.slice(`/${linkPrefix}`.length) || '/';

          if (STATIC_PAGES.has(href)) continue;

          const segments = href.split('/').filter(Boolean);
          const line = entry.body.slice(0, match.index).split('\n').length;
          const at = { rule: 'C-25', severity: 'error' as const, file: entry.file, line };

          if (segments.length === 1) {
            if (routes.has(segments[0]!)) continue;
            out.push({
              ...at,
              message: `Links to "${written}", which is not a section of this site.`,
              fix: `Sections are: ${[...routes.keys()].map((route) => `${mount}/${route}/`).join(', ')}, plus ${mount}/topics/ and ${mount}/series/.`,
            });
            continue;
          }

          if (segments.length === 2) {
            const [head, slug] = segments as [string, string];

            if (head === 'topics' || head === 'series') {
              if (listable(head, slug, linkPrefix)) continue;
              const declared = head === 'topics' ? Object.hasOwn(topics, slug) : Object.hasOwn(series, slug);
              out.push({
                ...at,
                message: declared
                  ? `Links to "${written}", which is declared but has no published entry${linkPrefix === '' ? '' : ` in /${linkPrefix}/`}, so no page is built.`
                  : `Links to "${written}", which is not in site/taxonomy.yaml.`,
                fix: declared
                  ? 'A topic or series page appears once an entry uses it. Publish one first, or link somewhere else — `pnpm context write` lists what exists today.'
                  : `Valid: ${(head === 'topics' ? Object.keys(topics) : Object.keys(series)).join(', ') || '(none)'}.`,
              });
              continue;
            }

            if (routes.has(head)) {
              if (slugsByRoute.get(`${linkPrefix}|${head}`)?.has(slug)) continue;
              out.push({
                ...at,
                message: `Links to "${written}", but no ${routes.get(head)} entry${linkPrefix === '' ? '' : ` in /${linkPrefix}/`} has the slug "${slug}".`,
                fix: 'Check the slug, or write that entry first. Drafts do not count — they are never built, and neither does a translation in another language.',
              });
              continue;
            }
          }

          out.push({
            ...at,
            message: `Links to "${written}", which does not match any route this site produces.`,
            fix: 'Run `pnpm context write` — it lists every page that exists and can be linked to.',
          });
        }
      }

      return out;
    },
  },
];

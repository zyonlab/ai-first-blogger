/**
 * Site-wide on-page SEO — the rules that are about the *set* of pages rather
 * than any one page.
 *
 * The rules in seo.ts ask "is this page well-formed". These ask the questions a
 * professional on-page audit asks: are two pages competing with the same title,
 * does every page state what it is with exactly one H1, can a crawler follow the
 * links and read the images, is the URL structure consistent, and does a listing
 * page say anything of its own or is it a stack of links.
 *
 * Thresholds live in site/policy.yaml. Contract: docs/specs/content-contract.md
 */
import { policy } from 'aifb-engine/config/policy';
import {
  displayWidth,
  h1Count,
  htmlLang,
  images,
  internalAnchors,
  isNoindex,
  metaContent,
  proseText,
  titleText,
  unfollowableAnchors,
} from '../html';
import type { BuiltPage, Rule, Violation } from '../types';
import { alternatePaths } from './locale';
import { engineSegments } from '../url';
import { isDetailPage, isListingPage } from '../page-kind';

/** Anchor text that transfers no meaning to the page it points at. */
const EMPTY_ANCHORS = [
  '点击这里', '点这里', '这里', '更多', '查看更多', '阅读更多', '详情', '了解更多',
  'click here', 'here', 'read more', 'more', 'link', 'this',
];

/**
 * Pages whose job is to be a hub, so a short intro is expected of them.
 *
 * Measured from the engine's root in its own language, not from the origin:
 * under `engine({ mount: '/zh/blog' })` the listing page is
 * `/zh/blog/writing/`, and on a bilingual site the English one is
 * `/en/writing/`. Counting from `/` would file either as a deeper page — so
 * C-21 and C-22 would stop checking listing pages altogether and report
 * nothing.
 */
/**
 * Whether two pages are the same page in two languages.
 *
 * The Chinese and the English version of an article are not two pages
 * competing for one query — they are one page, offered twice, to two sets of
 * readers, and search engines are told exactly that by the `hreflang` pair.
 * C-14 and C-15 have to know the difference or a bilingual site fails the gate
 * on every page it translates, and a rule that fails on correct work is a rule
 * that gets switched off by the first person it annoys.
 *
 * The signal is the `hreflang` set rather than a filename convention or a
 * frontmatter field, because it is the same claim the crawler reads: if these
 * two pages do not tell Google they are translations, they are duplicates, and
 * the rule should say so. C-30 separately proves the claim is true, and C-31
 * reports the pair whose copy was never actually translated — so "not a
 * duplicate" never quietly becomes "not checked".
 */
function areTranslations(a: BuiltPage, b: BuiltPage, siteOrigin: string) {
  const langA = htmlLang(a.html);
  const langB = htmlLang(b.html);
  if (!langA || !langB || langA === langB) return false;

  const normalise = (url: string) => (url === '/' || url.endsWith('/') ? url : `${url}/`);
  const claims = (page: BuiltPage, other: BuiltPage) =>
    alternatePaths(page, siteOrigin).some(
      (alternate) => alternate.path !== undefined && normalise(alternate.path) === normalise(other.url),
    );
  return claims(a, b) && claims(b, a);
}

export const onPageRules: Rule[] = [
  {
    id: 'C-14',
    title: 'Title uniqueness',
    severity: 'error',
    needsBuild: true,
    run: ({ pages, siteOrigin }) => {
      const seen = new Map<string, BuiltPage>();
      const out: Violation[] = [];
      for (const page of pages) {
        const title = titleText(page.html);
        if (!title) continue;
        const previous = seen.get(title);
        if (previous && areTranslations(page, previous, siteOrigin)) continue;
        if (previous) {
          out.push({
            rule: 'C-14',
            severity: 'error',
            file: page.url,
            message: `Title "${title}" is already used by ${previous.url}.`,
            fix: 'Two pages with one title compete for the same query and split the ranking. Give each its own.',
          });
        } else {
          seen.set(title, page);
        }
      }
      return out;
    },
  },

  {
    id: 'C-15',
    title: 'Description uniqueness',
    severity: 'error',
    needsBuild: true,
    run: ({ pages, siteOrigin }) => {
      const seen = new Map<string, BuiltPage>();
      const out: Violation[] = [];
      for (const page of pages) {
        const description = metaContent(page.html, 'name', 'description');
        if (!description) continue;
        const previous = seen.get(description);
        // Same exemption as C-14, for the same reason. See areTranslations().
        if (previous && areTranslations(page, previous, siteOrigin)) continue;
        if (previous) {
          out.push({
            rule: 'C-15',
            severity: 'error',
            file: page.url,
            message: `Meta description is identical to the one on ${previous.url}.`,
            fix: 'Duplicate descriptions are the most common on-page defect: the snippet stops describing the page. Write one per page.',
          });
        } else {
          seen.set(description, page);
        }
      }
      return out;
    },
  },

  {
    id: 'C-16',
    title: 'Exactly one H1',
    severity: 'error',
    needsBuild: true,
    run: ({ pages }) =>
      pages.flatMap((page) => {
        const count = h1Count(page.html);
        if (count === 1) return [];
        return [
          {
            rule: 'C-16',
            severity: 'error' as const,
            file: page.url,
            message: count === 0 ? 'No H1 on the page.' : `${count} H1 elements on the page.`,
            fix:
              count === 0
                ? 'Every page needs one H1 stating what it is. It comes from the layout title.'
                : 'Keep one H1 and demote the rest to H2 — more than one leaves the topic of the page ambiguous.',
          },
        ];
      }),
  },

  {
    id: 'C-17',
    title: 'Images carry alt text',
    severity: 'error',
    needsBuild: true,
    run: ({ pages }) =>
      pages.flatMap((page) =>
        images(page.html)
          .filter((image) => !image.hasAltAttr)
          .map((image) => ({
            rule: 'C-17',
            severity: 'error' as const,
            file: page.url,
            message: `<img src="${image.src}"> has no alt attribute.`,
            fix: 'Add alt="…" describing the image, or alt="" if it is purely decorative. A missing attribute is not the same as an empty one.',
          })),
      ),
  },

  {
    id: 'C-18',
    title: 'Anchor text carries meaning',
    severity: 'warn',
    needsBuild: true,
    run: ({ pages }) =>
      pages.flatMap((page) =>
        internalAnchors(page.html)
          .filter((anchor) => {
            const text = anchor.text.toLowerCase().replace(/[。．.,，!！?？\s]/g, '');
            return text.length > 0 && EMPTY_ANCHORS.includes(text);
          })
          .map((anchor) => ({
            rule: 'C-18',
            severity: 'warn' as const,
            file: page.url,
            message: `Link to ${anchor.href} is labelled "${anchor.text}".`,
            fix: 'Anchor text is how a crawler learns what the target is about. Use the target\'s subject as the link text.',
          })),
      ),
  },

  {
    id: 'C-19',
    title: 'URL structure',
    severity: 'error',
    needsBuild: true,
    run: ({ pages, mount, localePrefixes }) => {
      const out: Violation[] = [];
      const maxDepth = policy.seo.maxUrlDepth;
      for (const page of pages) {
        // Neither the mount nor the locale prefix is an authored slug or
        // depth this site chose per page. Judging either against
        // `seo.maxUrlDepth` would make the threshold mean something different
        // on every site that mounts the engine a level deeper or adds a second
        // language — and adding a language would then need every article's URL
        // to get shorter, which is not a thing anyone would do.
        const segments = engineSegments(page.url, mount, localePrefixes);
        for (const segment of segments) {
          // Files served at a path — /404.html, /rss.xml, /llms.txt — are not
          // directory-style URLs and are not authored slugs.
          if (/\.[a-z0-9]{2,5}$/i.test(segment)) continue;
          if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(segment)) {
            out.push({
              rule: 'C-19',
              severity: 'error',
              file: page.url,
              message: `URL segment "${segment}" is not lowercase kebab-case.`,
              fix: 'Use lowercase words joined by hyphens. Mixed case and underscores produce duplicate URLs on case-insensitive hosts.',
            });
          }
        }
        if (segments.length > maxDepth) {
          out.push({
            rule: 'C-19',
            severity: 'error',
            file: page.url,
            message: `URL is ${segments.length} levels deep (max ${maxDepth}).`,
            fix: `Flatten the route, or raise seo.maxUrlDepth in site/policy.yaml if this depth is intended.`,
          });
        }
      }
      return out;
    },
  },

  {
    id: 'C-20',
    title: 'Noindex pages stay out of the sitemap',
    severity: 'error',
    needsBuild: true,
    run: ({ pages }) => {
      const sitemaps = pages.filter((page) => page.file.endsWith('.xml'));
      const listed = new Set<string>();
      for (const map of sitemaps) {
        for (const match of map.html.matchAll(/<loc>([^<]+)<\/loc>/gi)) {
          try {
            listed.add(new URL(match[1]!).pathname);
          } catch {
            /* a malformed loc is the sitemap generator's problem */
          }
        }
      }
      if (listed.size === 0) return [];

      return pages
        .filter((page) => isNoindex(page.html) && listed.has(page.url))
        .map((page) => ({
          rule: 'C-20',
          severity: 'error' as const,
          file: page.url,
          message: 'Page is noindex but appears in the sitemap.',
          fix: 'A sitemap says "index this" and the meta tag says "do not". Remove one — usually exclude the page from the sitemap.',
        }));
    },
  },

  {
    id: 'C-21',
    title: 'Listing pages introduce their subject',
    severity: 'warn',
    needsBuild: true,
    run: ({ pages, mount, localePrefixes }) =>
      pages
        .filter((page) => isListingPage(page, mount, localePrefixes))
        .flatMap((page) => {
          const width = displayWidth(proseText(page.html));
          if (width >= policy.seo.listingIntroMinWidth) return [];
          return [
            {
              rule: 'C-21',
              severity: 'warn' as const,
              file: page.url,
              message: `Listing page has ${width} columns of prose outside the card list (want ${policy.seo.listingIntroMinWidth}).`,
              fix: 'A page that is only a stack of links is thin content competing with the entries it links to. Add a sentence or two saying what this collection is for and who it is for.',
            },
          ];
        }),
  },

  {
    id: 'C-22',
    title: 'ItemList matches the page',
    severity: 'error',
    needsBuild: true,
    run: ({ pages, mount, localePrefixes }) => {
      const out: Violation[] = [];
      for (const page of pages) {
        if (!isListingPage(page, mount, localePrefixes)) continue;
        const blocks = [...page.html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)]
          .flatMap((match) => {
            try {
              const parsed = JSON.parse(match[1]!);
              return Array.isArray(parsed) ? parsed : [parsed];
            } catch {
              return [];
            }
          })
          .filter((block: any) => block['@type'] === 'ItemList');

        for (const block of blocks as any[]) {
          const declared = Array.isArray(block.itemListElement) ? block.itemListElement.length : 0;
          // Count the cards inside the section the ItemList describes, not
          // every <article> on the page. A topic page legitimately renders a
          // featured-series block beside its entries, and counting those made
          // this rule report a mismatch on a perfectly correct page.
          const region = /<section\b[^>]*\bdata-item-list\b[^>]*>([\s\S]*?)<\/section>/i.exec(page.html)?.[1] ?? '';
          const rendered = [...region.matchAll(/<article\b/gi)].length;
          if (declared !== rendered) {
            out.push({
              rule: 'C-22',
              severity: 'error',
              file: page.url,
              message: `ItemList declares ${declared} item(s) but the page renders ${rendered}.`,
              fix: 'Structured data must describe what is on the page. Build the ItemList from the same list the page renders.',
            });
          }
        }
      }
      return out;
    },
  },

  {
    id: 'C-23',
    title: 'Detail pages declare their type',
    severity: 'error',
    needsBuild: true,
    run: ({ pages, mount, localePrefixes }) =>
      pages
        .filter((page) => isDetailPage(page, mount, localePrefixes) && !page.file.endsWith('.xml'))
        .flatMap((page) => {
          const types = [...page.html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)]
            .flatMap((match) => {
              try {
                const parsed = JSON.parse(match[1]!);
                return (Array.isArray(parsed) ? parsed : [parsed]).map((block: any) => block['@type']);
              } catch {
                return [];
              }
            })
            .filter((type) => type && type !== 'BreadcrumbList');

          if (types.length > 0) return [];
          return [
            {
              rule: 'C-23',
              severity: 'error' as const,
              file: page.url,
              message: 'Detail page has no JSON-LD beyond the breadcrumb trail.',
              fix: 'Declare what this page is via the content type\'s `jsonLd` hook — Article, VideoObject, CreativeWork. Without it a crawler sees an untyped document.',
            },
          ];
        }),
  },

  {
    id: 'C-28',
    title: 'Every anchor is followable',
    severity: 'error',
    needsBuild: true,
    run: ({ pages }) =>
      pages.flatMap((page) =>
        unfollowableAnchors(page.html).map((anchor) => ({
          rule: 'C-28',
          severity: 'error' as const,
          file: page.url,
          message: `Link labelled "${anchor.text || '(no text)'}" has ${
            anchor.hasHrefAttr ? `href="${anchor.href}"` : 'no href'
          }.`,
          fix: 'A crawler cannot follow it and a keyboard cannot reach it. If the destination is optional config, render the anchor only when it has a value — do not pass an empty or undefined href.',
        })),
      ),
  },

  {
    id: 'C-29',
    title: 'Rendered heading order',
    severity: 'error',
    needsBuild: true,
    run: ({ pages }) =>
      pages
        .filter((page) => !page.file.endsWith('.xml') && !page.file.endsWith('.txt'))
        .flatMap((page) => {
          const levels = [...page.html.matchAll(/<h([1-6])\b/gi)].map((match) => Number(match[1]));
          let previous = 0;
          const out: Violation[] = [];
          for (const level of levels) {
            if (previous !== 0 && level > previous + 1) {
              out.push({
                rule: 'C-29',
                severity: 'error' as const,
                file: page.url,
                message: `Rendered heading level jumps from H${previous} to H${level}.`,
                fix: 'A screen reader announces the outline from these levels, so a skipped one reads as a missing section. Give the component the level its context needs — the cards take a `headingLevel` prop for exactly this.',
              });
              break; // one report per page; the outline is the finding, not each jump
            }
            previous = level;
          }
          return out;
        }),
  },
];

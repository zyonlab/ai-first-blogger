import { policy } from 'aifb-engine/config/policy';
import { canonicalHref, displayWidth, hasVisibleBreadcrumb, jsonLdBlocks, metaContent, titleText } from '../html';
import type { Rule, Violation } from '../types';
import { engineSegments } from '../url';

/**
 * SERP truncation limits, measured in display columns (CJK counts as 2).
 *
 * The ceiling is the bound that matters — Google truncates past it.
 *
 * The floor has been lowered twice, both times because it was flagging good
 * writing. At 110 columns it pushed authors to pad sentences with filler; at
 * 70 it flagged eighteen hand-written descriptions of 21–34 Chinese
 * characters, every one of them a complete sentence. Length is a weak proxy
 * for quality: it can catch a stub ("文章列表"), and that is all it should try
 * to do. 36 columns (~18 CJK characters) is where a description stops being a
 * sentence. Anything above that is an editorial call, not a rule.
 */
const TITLE_MAX_WIDTH = policy.seo.titleMaxWidth;
const DESCRIPTION_MIN_WIDTH = policy.seo.descriptionMinWidth;
const DESCRIPTION_MAX_WIDTH = policy.seo.descriptionMaxWidth;

const RASTER = /\.(png|jpe?g|webp)(\?|$)/i;

export const seoRules: Rule[] = [
  {
    id: 'C-01',
    title: 'Usable Open Graph image',
    severity: 'error',
    needsBuild: true,
    run: ({ pages }) =>
      pages.flatMap((page) => {
        const image = metaContent(page.html, 'property', 'og:image');
        if (!image) {
          return [
            {
              rule: 'C-01',
              severity: 'error' as const,
              file: page.url,
              message: 'No og:image.',
              fix: 'Set site.og.default in site/site.yaml, or pass `image` to the layout.',
            },
          ];
        }
        if (!RASTER.test(image)) {
          return [
            {
              rule: 'C-01',
              severity: 'error' as const,
              file: page.url,
              message: `og:image "${image}" is not a raster image.`,
              fix: 'Social platforms do not render SVG. Use a PNG/JPG/WebP at 1200x630 — run `pnpm og:default` for a placeholder.',
            },
          ];
        }
        return [];
      }),
  },

  {
    id: 'C-05',
    title: 'Title length',
    severity: 'warn',
    needsBuild: true,
    run: ({ pages }) =>
      pages.flatMap((page) => {
        const title = titleText(page.html);
        if (!title) {
          return [
            {
              rule: 'C-05',
              severity: 'warn' as const,
              file: page.url,
              message: 'No <title>.',
              fix: 'Pass `title` to the layout.',
            },
          ];
        }
        const width = displayWidth(title);
        if (width <= TITLE_MAX_WIDTH) return [];
        return [
          {
            rule: 'C-05',
            severity: 'warn' as const,
            file: page.url,
            message: `Title is ${width} columns wide (max ${TITLE_MAX_WIDTH}): "${title}"`,
            fix: 'Shorten the title, or shorten site.name — the suffix counts toward the limit.',
          },
        ];
      }),
  },

  {
    id: 'C-06',
    title: 'Description length',
    severity: 'warn',
    needsBuild: true,
    run: ({ pages }) =>
      pages.flatMap((page) => {
        const description = metaContent(page.html, 'name', 'description');
        if (!description) {
          return [
            {
              rule: 'C-06',
              severity: 'warn' as const,
              file: page.url,
              message: 'No meta description.',
              fix: 'Pass `description` to the layout.',
            },
          ];
        }
        const width = displayWidth(description);
        if (width >= DESCRIPTION_MIN_WIDTH && width <= DESCRIPTION_MAX_WIDTH) return [];
        return [
          {
            rule: 'C-06',
            severity: 'warn' as const,
            file: page.url,
            message: `Description is ${width} columns wide (want ${DESCRIPTION_MIN_WIDTH}-${DESCRIPTION_MAX_WIDTH}).`,
            fix:
              width < DESCRIPTION_MIN_WIDTH
                ? 'Too short to fill a search snippet — add the concrete outcome or scope.'
                : 'Will be truncated in search results — tighten it.',
          },
        ];
      }),
  },

  {
    id: 'C-07',
    title: 'Same-origin canonical',
    severity: 'error',
    needsBuild: true,
    run: ({ pages, siteOrigin }) =>
      pages.flatMap((page) => {
        const href = canonicalHref(page.html);
        if (!href) {
          return [
            {
              rule: 'C-07',
              severity: 'error' as const,
              file: page.url,
              message: 'No canonical link.',
              fix: 'BaseLayout emits one automatically — check the page is not bypassing the layout.',
            },
          ];
        }
        let origin: string;
        try {
          origin = new URL(href).origin;
        } catch {
          return [
            {
              rule: 'C-07',
              severity: 'error' as const,
              file: page.url,
              message: `Canonical "${href}" is not an absolute URL.`,
              fix: 'Canonical URLs must be absolute.',
            },
          ];
        }
        if (origin === siteOrigin) return [];
        return [
          {
            rule: 'C-07',
            severity: 'error' as const,
            file: page.url,
            message: `Canonical points at ${origin}, not ${siteOrigin}.`,
            fix: 'A cross-origin canonical donates this page\'s ranking to another site. Remove the frontmatter `canonical`, or set PUBLIC_SITE_URL to your real domain.',
          },
        ];
      }),
  },

  {
    id: 'C-10',
    title: 'Breadcrumb schema matches the page',
    severity: 'error',
    needsBuild: true,
    run: ({ pages, mount, localePrefixes }) => {
      const out: Violation[] = [];
      for (const page of pages) {
        const hasSchema = jsonLdBlocks(page.html).some(
          (block) => (block as { '@type'?: string })['@type'] === 'BreadcrumbList',
        );
        const hasMarkup = hasVisibleBreadcrumb(page.html);

        // Listing and root pages carry breadcrumb schema without rendering a
        // trail; only flag detail pages, which is where the mismatch misleads.
        // Depth is counted from the engine's root in its own language: a
        // mounted `/zh/blog/writing/` and a translated `/en/writing/` are both
        // still listing pages, and counting from the origin would report every
        // one of them.
        const isDetail = engineSegments(page.url, mount, localePrefixes).length >= 2;
        if (hasSchema && !hasMarkup && isDetail) {
          out.push({
            rule: 'C-10',
            severity: 'error',
            file: page.url,
            message: 'BreadcrumbList schema is present but no breadcrumb is rendered.',
            fix: 'Render <Breadcrumbs /> in the detail component, or drop the schema. Structured data must describe what is on the page.',
          });
        }
      }
      return out;
    },
  },
];

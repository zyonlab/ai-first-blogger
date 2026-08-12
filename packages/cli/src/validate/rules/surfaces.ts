/**
 * A frontmatter field that reaches no surface a reader can perceive.
 *
 * This is a defect *class*, not a bug. Twice now a field has been added to a
 * content type's schema, wired into JSON-LD, and rendered by no template:
 * `heroImage` (#22) and `posts.author` (#23 §5). Both validate, both build,
 * both appear in the structured data — and a reader who fills them in sees
 * nothing change. The frontmatter says the field is part of the content model;
 * the page says it is not, and the page is right.
 *
 * The failure survives because nothing can see it. `astro check` types the
 * field, the schema accepts it, and every other rule here is asking about the
 * page rather than about the gap between the page and the file that produced
 * it. So this rule asks the one question that closes it: for each value an
 * author wrote, is any trace of it in what the page shows?
 *
 * ## What counts as a surface
 *
 * The rendered body, with `<head>`, `<script>` and `<style>` removed.
 *
 * Structured data is deliberately *not* a surface. That is the whole point:
 * `author` is in the Article JSON-LD of every post and is on screen nowhere,
 * and `heroImage` is the `og:image` of a page that never shows the image. A
 * check that accepted either would have passed both defects this rule exists
 * to catch. Machine-readable output is a surface for a machine; the scope this
 * engine committed to (ADR 0007) is the content model a *reader* can perceive.
 *
 * ## Why the exemptions are a list and not a judgement
 *
 * Some frontmatter is addressing, not content — `slug` is the URL, `draft` is
 * whether there is a page at all. Those are named below with the reason each
 * one is not something to render. A field that is neither content nor
 * addressing does not belong in the schema, which is the argument this rule
 * makes on every field not in the list.
 */
import { siteContentTypes } from 'aifb-engine/config/content-types';
import { policy } from 'aifb-engine/config/policy';
import { series, topics } from 'aifb-engine/config/taxonomy';
import { displayWidth } from '../html';
import type { Rule, SourceEntry, Violation } from '../types';

/**
 * Frontmatter that is addressing, configuration or provenance — not something
 * a page could show even in principle. Each one needs a reason, because "the
 * rule complained" is not one.
 */
const NOT_CONTENT: Record<string, string> = {
  slug: 'is the URL, which the page is at rather than displays',
  draft: 'decides whether a page exists; a rendered page has already answered it',
  locale: 'is the language, carried by <html lang> and the URL',
  translationKey: 'pairs two files across languages; it names nothing on either page',
  legacySlug: 'is where this entry used to live — provenance for redirects, not content',
  canonical: 'is a <link rel="canonical">, which is addressing',
  noindex: 'is an instruction to crawlers',
  seriesOrder: 'is a sort key; the order it produces is the visible part',
  metaTitle: 'exists to differ from the on-page title — that is what it is for',
  metaDescription: 'exists to differ from the on-page description',
  ogTitle: 'is written for a social card, not for the page',
  ogDescription: 'is written for a social card, not for the page',
  ogImage: 'is the social card image, which the page is not obliged to show',
  twitterTitle: 'is written for a social card, not for the page',
  twitterDescription: 'is written for a social card, not for the page',
  twitterImage: 'is the social card image, which the page is not obliged to show',
  featured: 'pins the entry in listings; the position it produces is the visible part',
};

/**
 * `<head>`, scripts and styles are not surfaces. See the header comment.
 *
 * The head-only elements are stripped by name as well as by taking `<body>`,
 * because the synthetic pages the self-test builds carry a `<title>` and a
 * `<meta>` with no document around them. Both passes agree on real output, and
 * a rule whose verdict depended on the page having a `<body>` tag would be
 * checked by a fixture it cannot actually be run against.
 */
function renderedBody(html: string) {
  return (/<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html)
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<title[\s\S]*?<\/title>/gi, '')
    .replace(/<(?:meta|link)\b[^>]*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

/**
 * Every string worth looking for in the page, for one frontmatter value.
 *
 * A value is not always shown as itself. A category is stored as a slug and
 * displayed as its title; a date is stored as a date and displayed in the
 * reader's language, with the ISO form surviving in the `datetime` attribute.
 * Both translations come from data the gate already reads — site/taxonomy.yaml
 * and the date itself — so neither is a guess about what a template might do.
 */
function needles(key: string, value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.flatMap((item) => needles(key, item));
  if (value instanceof Date) return [value.toISOString().slice(0, 10)];
  if (typeof value === 'boolean') return [];
  if (typeof value === 'number') return [String(value)];
  if (typeof value !== 'string' || value.trim() === '') return [];

  const raw = value.trim();
  if (key === 'category') return [raw, topics[raw]?.title].filter((item): item is string => typeof item === 'string');
  if (key === 'series') return [raw, series[raw]?.title].filter((item): item is string => typeof item === 'string');
  return [raw];
}

/** Which locale prefix a content file is in, from its `locale` or its directory. */
function localeSegmentOf(entry: SourceEntry, localePrefixes: readonly string[]) {
  const declared = typeof entry.data.locale === 'string' ? entry.data.locale.trim() : '';
  if (declared !== '') {
    return localePrefixes.find((prefix) => declared === prefix || declared.startsWith(`${prefix}-`)) ?? '';
  }
  const parts = entry.file.split('/');
  const head = parts.length > 3 ? parts[2]! : undefined;
  return head !== undefined && localePrefixes.includes(head) ? head : '';
}

export const surfaceRules: Rule[] = [
  {
    id: 'C-32',
    title: 'Frontmatter reaches a surface',
    severity: 'error',
    needsBuild: true,
    run: ({ entries, pages, mount, localePrefixes }) => {
      const out: Violation[] = [];
      const byUrl = new Map(pages.map((page) => [page.url, page]));

      for (const entry of entries) {
        const route = siteContentTypes[entry.type]?.route;
        const slug = typeof entry.data.slug === 'string' ? entry.data.slug : undefined;
        if (!route || !slug) continue;

        const prefix = localeSegmentOf(entry, localePrefixes);
        const url = `${mount}${prefix === '' ? '' : `/${prefix}`}/${route}/${slug}/`;
        const page = byUrl.get(url);
        // A missing page is C-08's and C-25's business, not this rule's.
        if (!page) continue;

        const body = renderedBody(page.html);

        for (const [key, value] of Object.entries(entry.data)) {
          if (Object.hasOwn(NOT_CONTENT, key)) continue;
          const wanted = needles(key, value);
          if (wanted.length === 0) continue;
          if (wanted.some((needle) => body.includes(needle))) continue;

          out.push({
            rule: 'C-32',
            severity: 'error',
            file: entry.file,
            line: entry.frontmatterLines[key],
            message: `"${key}" is accepted by the schema but nothing on ${url} shows it.`,
            fix:
              `Render "${key}" in the template for this content type — a component under ` +
              'site/templates/components/ overrides the engine\'s. If it is not meant to be seen, ' +
              'either drop it from the schema or add it to NOT_CONTENT in ' +
              'packages/cli/src/validate/rules/surfaces.ts with the reason it is addressing rather ' +
              'than content. Structured data does not count: a field only in JSON-LD or a meta tag ' +
              'is a field the reader who wrote it will never see.',
          });
        }
      }

      return out;
    },
  },

  {
    id: 'C-33',
    title: 'Meta title fits a search result',
    severity: 'warn',
    run: ({ entries }) => {
      const out: Violation[] = [];
      const max = policy.seo.titleMaxWidth;

      for (const entry of entries) {
        const value = entry.data.metaTitle;
        if (typeof value !== 'string' || value.trim() === '') continue;
        const width = displayWidth(value);
        if (width <= max) continue;

        // C-05 measures the rendered <title>, which is the same string plus the
        // site's titleTemplate — so it catches this too, one build later and
        // pointing at a URL. Saying it here points at the line that wrote it.
        out.push({
          rule: 'C-33',
          severity: 'warn',
          file: entry.file,
          line: entry.frontmatterLines.metaTitle,
          message: `"metaTitle" is ${width} display columns (max ${max}).`,
          fix:
            `Shorten it to ${max} columns or fewer — a CJK character is two. metaTitle exists to be ` +
            'shorter than the headline; one that is longer is being truncated in the result it was ' +
            'written for. Adjust seo.titleMaxWidth in site/policy.yaml if the ceiling is wrong.',
        });
      }

      return out;
    },
  },

  {
    id: 'C-34',
    title: 'Hero image has alt text',
    severity: 'warn',
    run: ({ entries }) => {
      const out: Violation[] = [];

      for (const entry of entries) {
        const image = entry.data.heroImage;
        if (typeof image !== 'string' || image.trim() === '') continue;
        if (typeof entry.data.heroImageAlt === 'string') continue;

        // C-17 catches `<img>` with no alt in built HTML; this catches the
        // frontmatter that produced it, which is where the fix goes. It is
        // also the one Ghost field a migration is most likely to drop
        // silently — feature_image_alt exists in the export and had nowhere
        // to land until now.
        out.push({
          rule: 'C-34',
          severity: 'warn',
          file: entry.file,
          line: entry.frontmatterLines.heroImage,
          message: 'heroImage has no "heroImageAlt".',
          fix:
            'Add heroImageAlt: describing what the image shows. If it is decorative and adds nothing ' +
            'a reader would miss, say so explicitly with an empty string — heroImageAlt: \'\' — which ' +
            'tells a screen reader to skip it. Leaving it out is not the same answer as giving it.',
        });
      }

      return out;
    },
  },
];

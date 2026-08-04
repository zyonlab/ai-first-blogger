import path from 'node:path';
import { policy } from 'aifb-engine/config/policy';
import type { Rule, Violation } from '../types';

/** Minimum site-internal links per content entry. From site/policy.yaml. */
const MIN_INTERNAL_LINKS = policy.content.minInternalLinks;

const linkPattern = /\]\((\/[^)\s]*)\)/g;

export const contentRules: Rule[] = [
  {
    id: 'C-02',
    title: 'Internal link floor',
    severity: 'error',
    run: ({ entries }) =>
      entries.flatMap((entry) => {
        const links = [...entry.body.matchAll(linkPattern)].map((match) => match[1]!);
        const unique = new Set(links);
        if (unique.size >= MIN_INTERNAL_LINKS) return [];
        return [
          {
            rule: 'C-02',
            severity: 'error' as const,
            file: entry.file,
            message: `${unique.size} internal link(s); at least ${MIN_INTERNAL_LINKS} required.`,
            fix: 'Link to a related post, topic or series page from the body, e.g. [text](/topics/<slug>/).',
          },
        ];
      }),
  },

  {
    id: 'C-08',
    title: 'Slug uniqueness and filename match',
    severity: 'error',
    /**
     * Uniqueness is per language, not per site.
     *
     * The same slug in two languages is the *point* — `/writing/x/` and
     * `/en/writing/x/` are two URLs, and a translation that keeps its slug is
     * the case worth making easy. Judging the pair as a collision would make
     * the cheapest correct thing an author can do the one thing the gate stops
     * them doing, and the workaround — renaming one of them — is a worse site.
     *
     * `translationKey` is checked on the same terms and for the opposite
     * reason: it is what pairs two files across languages, so two files
     * claiming it inside *one* language means the pairing has no single answer
     * and the hreflang set is whichever the loader read last.
     */
    run: ({ entries, defaultLocale, localePrefixes }) => {
      const out: Violation[] = [];
      const seen = new Map<string, string>();
      const seenTranslationKey = new Map<string, string>();

      /** The language of a content file: its `locale`, else its directory. */
      const localeOf = (entry: (typeof entries)[number]) => {
        if (typeof entry.data.locale === 'string' && entry.data.locale.trim() !== '') return entry.data.locale;
        const parts = entry.file.split('/');
        // content/<type>/<maybe-prefix>/<file>
        const head = parts.length > 3 ? parts[2]! : undefined;
        return head !== undefined && localePrefixes.includes(head) ? head : defaultLocale;
      };

      for (const entry of entries) {
        const slug = entry.data.slug as string | undefined;
        if (!slug) continue;
        const locale = localeOf(entry);

        const translationKey =
          typeof entry.data.translationKey === 'string' && entry.data.translationKey.trim() !== ''
            ? entry.data.translationKey
            : slug;
        const translationSeenAt = seenTranslationKey.get(`${entry.type}/${locale}/${translationKey}`);
        if (translationSeenAt) {
          out.push({
            rule: 'C-08',
            severity: 'error',
            file: entry.file,
            line: entry.frontmatterLines.translationKey ?? entry.frontmatterLines.slug,
            message: `Two ${entry.type} entries in ${locale} share translationKey "${translationKey}"; the other is ${translationSeenAt}.`,
            fix: 'A translationKey names one article per language — it is what pairs the translations for hreflang. Give one of them its own key.',
          });
        }
        seenTranslationKey.set(`${entry.type}/${locale}/${translationKey}`, entry.file);

        const key = `${entry.type}/${locale}/${slug}`;
        const previous = seen.get(key);
        if (previous) {
          out.push({
            rule: 'C-08',
            severity: 'error',
            file: entry.file,
            line: entry.frontmatterLines.slug,
            message: `Duplicate slug "${slug}" in ${entry.type} (${locale}); already used by ${previous}.`,
            fix: 'Slugs must be unique within a content type and language — rename one of them. The same slug in another language is fine and is how a translation keeps its URL.',
          });
        }
        seen.set(key, entry.file);

        const basename = path.basename(entry.file).replace(/\.mdx?$/, '');
        if (basename !== slug) {
          out.push({
            rule: 'C-08',
            severity: 'error',
            file: entry.file,
            line: entry.frontmatterLines.slug,
            message: `Filename "${basename}" does not match slug "${slug}".`,
            fix: `Rename the file to ${slug}.mdx, or change the slug to "${basename}".`,
          });
        }
      }
      return out;
    },
  },

  {
    id: 'C-09',
    title: 'Heading hierarchy',
    severity: 'error',
    run: ({ entries }) => {
      const out: Violation[] = [];

      for (const entry of entries) {
        const lines = entry.body.split('\n');
        let previous = 1; // the page H1 comes from the title
        let inFence = false;

        lines.forEach((line, index) => {
          if (/^\s*```/.test(line)) inFence = !inFence;
          if (inFence) return;

          const match = /^(#{1,6})\s+\S/.exec(line);
          if (!match) return;
          const depth = match[1]!.length;

          if (depth === 1) {
            out.push({
              rule: 'C-09',
              severity: 'error',
              file: entry.file,
              line: index + 1,
              message: 'Body contains an H1; the page H1 is rendered from the title.',
              fix: 'Demote this heading to H2.',
            });
          } else if (depth > previous + 1) {
            out.push({
              rule: 'C-09',
              severity: 'error',
              file: entry.file,
              line: index + 1,
              message: `Heading level jumps from H${previous} to H${depth}.`,
              fix: `Use H${previous + 1} here, or add the missing intermediate heading.`,
            });
          }
          previous = depth;
        });
      }
      return out;
    },
  },

  {
    id: 'C-11',
    title: 'Required base fields',
    severity: 'error',
    run: ({ entries }) =>
      entries.flatMap((entry) =>
        (['title', 'description', 'slug'] as const)
          .filter((field) => typeof entry.data[field] !== 'string' || !entry.data[field].trim())
          .map((field) => ({
            rule: 'C-11',
            severity: 'error' as const,
            file: entry.file,
            line: entry.frontmatterLines[field],
            message: `Missing required frontmatter field "${field}".`,
            fix: `Add "${field}" to the frontmatter. Every content type requires title, description and slug.`,
          })),
      ),
  },
];

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
    run: ({ entries }) => {
      const out: Violation[] = [];
      const seen = new Map<string, string>();

      for (const entry of entries) {
        const slug = entry.data.slug as string | undefined;
        if (!slug) continue;

        const key = `${entry.type}/${slug}`;
        const previous = seen.get(key);
        if (previous) {
          out.push({
            rule: 'C-08',
            severity: 'error',
            file: entry.file,
            line: entry.frontmatterLines.slug,
            message: `Duplicate slug "${slug}" in ${entry.type}; already used by ${previous}.`,
            fix: 'Slugs must be unique within a content type — rename one of them.',
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

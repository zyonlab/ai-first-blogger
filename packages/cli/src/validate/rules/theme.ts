import fs from 'node:fs/promises';
import path from 'node:path';
import type { Rule, Violation } from '../types';

const THEME_DIR = 'site/themes';
const REFERENCE = 'default.css';

/** Colours written directly in structural CSS instead of going through a token. */
const HARDCODED_COLOUR = /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/;

const tokensIn = (block: string) =>
  new Set([...block.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gim)].map((match) => match[1]!));

/**
 * A theme's two blocks, read separately.
 *
 * Per-block matters. Checking the file as a whole passes a theme that defines a
 * mode-dependent token only in `:root` — and that mode then inherits the *other*
 * mode's colour, which is exactly the bug a token contract exists to prevent.
 * The 18 layout tokens that legitimately live in `:root` alone are handled by
 * comparing each block against the same block of the reference.
 */
async function readThemeBlocks(file: string) {
  const text = await fs.readFile(file, 'utf8');
  const blocks = text.split(/(?=^:root)/m).filter((block) => block.startsWith(':root'));
  return {
    base: tokensIn(blocks.find((block) => !/^:root\[/.test(block)) ?? ''),
    alternate: tokensIn(blocks.find((block) => /^:root\[data-theme/.test(block)) ?? ''),
  };
}

export const themeRules: Rule[] = [
  {
    id: 'C-12',
    title: 'Theme token completeness',
    severity: 'error',
    run: async () => {
      const dir = path.join(process.cwd(), THEME_DIR);
      let files: string[];
      try {
        files = (await fs.readdir(dir)).filter((file) => file.endsWith('.css'));
      } catch {
        return [];
      }

      const referencePath = path.join(dir, REFERENCE);
      let reference: { base: Set<string>; alternate: Set<string> };
      try {
        reference = await readThemeBlocks(referencePath);
      } catch {
        return [
          {
            rule: 'C-12',
            severity: 'error' as const,
            file: `${THEME_DIR}/${REFERENCE}`,
            message: 'Reference theme is missing.',
            fix: `Every theme is checked against ${THEME_DIR}/${REFERENCE}; it must exist.`,
          },
        ];
      }

      const out: Violation[] = [];
      for (const file of files) {
        if (file === REFERENCE) continue;
        const theme = await readThemeBlocks(path.join(dir, file));

        for (const [block, label, fix] of [
          [
            'base',
            ':root',
            `Every theme must define the full :root token set from ${REFERENCE}, or components fall back to unstyled defaults.`,
          ],
          [
            'alternate',
            ":root[data-theme='…']",
            `The alternate-mode block must override every token ${REFERENCE} overrides. A token missing here inherits the other mode's value — a dark colour shown in light mode.`,
          ],
        ] as const) {
          const missing = [...reference[block]].filter((token) => !theme[block].has(token));
          if (missing.length === 0) continue;
          out.push({
            rule: 'C-12',
            severity: 'error',
            file: `${THEME_DIR}/${file}`,
            message: `${label} is missing ${missing.length} token(s): ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '…' : ''}`,
            fix,
          });
        }
      }
      return out;
    },
  },

  {
    id: 'C-13',
    title: 'No hardcoded colours outside themes',
    severity: 'error',
    run: async () => {
      const out: Violation[] = [];

      /**
       * Structural CSS and component code both, not just global.css.
       *
       * Scanning one stylesheet let twenty hex literals sit inside
       * MermaidRenderer.astro for the life of the project: a site that authored
       * its own theme got prose in its colours and diagrams in someone else's,
       * and the rule that exists to prevent exactly that could not see them.
       */
      const targets = [
        { file: 'packages/engine/styles/global.css', kind: 'css' as const },
        ...(await listComponents()),
      ];

      for (const target of targets) {
        let text: string;
        try {
          text = await fs.readFile(path.join(process.cwd(), target.file), 'utf8');
        } catch {
          continue;
        }

        text.split('\n').forEach((line, index) => {
          // Strip comments and attribute selectors: `span[style*="color:#79B8FF"]`
          // matches colours a third-party highlighter emits, which we can only
          // target by value — a match target, not a themeable declaration.
          const code = (line.split('/*')[0] ?? '').split('//')[0]!.replace(/\[[^\]]*\]/g, '');
          if (!HARDCODED_COLOUR.test(code)) return;
          // A fallback beside a token read is the value used when the theme does
          // not define it — the opposite of bypassing the token.
          if (/getPropertyValue|cssToken\(|var\(--/.test(code)) return;

          out.push({
            rule: 'C-13',
            severity: 'error',
            file: target.file,
            line: index + 1,
            message: `Hardcoded colour: ${code.trim().slice(0, 80)}`,
            fix:
              target.kind === 'css'
                ? `Move the value into ${THEME_DIR}/${REFERENCE} as a token and reference it with var(--token).`
                : 'Read the theme token instead — getComputedStyle(document.documentElement).getPropertyValue("--token") — so the component follows whatever theme the site chose.',
          });
        });
      }
      return out;
    },
  },
];

/** Every component and layout the engine renders. */
async function listComponents() {
  const roots = ['packages/engine/components', 'packages/engine/layouts'];
  const out: { file: string; kind: 'component' }[] = [];

  const walk = async (dir: string) => {
    let items: import('node:fs').Dirent[];
    try {
      items = await fs.readdir(path.join(process.cwd(), dir), { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of items) {
      const relative = `${dir}/${item.name}`;
      if (item.isDirectory()) await walk(relative);
      else if (item.name.endsWith('.astro')) out.push({ file: relative, kind: 'component' });
    }
  };

  for (const root of roots) await walk(root);
  return out;
}

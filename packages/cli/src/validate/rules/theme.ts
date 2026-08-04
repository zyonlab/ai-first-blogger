import fs from 'node:fs/promises';
import path from 'node:path';
import { root } from 'aifb-engine/config/load';
import { displayPath, enginePath, engineRoot } from '../../paths';
import type { Rule, Violation } from '../types';

/**
 * The two site-plane directories these rules read, at their default locations.
 *
 * Both are `EngineOptions` fields, so a site can move either one in
 * `astro.config.mjs`. The gate is a plain node process that never loads the
 * Astro config, and inventing a second channel to declare the same thing would
 * be a worse answer than looking where the default points. What matters is that
 * looking in the wrong place is no longer silent: a moved themes directory
 * makes C-12 report that it could not read its input, naming the override as
 * the likely reason, instead of passing on zero themes.
 */
const THEME_DIR = 'site/themes';
const TEMPLATES_DIR = 'site/templates';
const REFERENCE = 'default.css';

/** Colours written directly in structural CSS instead of going through a token. */
const HARDCODED_COLOUR = /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/;

const tokensIn = (block: string) =>
  new Set([...block.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gim)].map((match) => match[1]!));

type ThemeBlocks = { base: Set<string>; alternate: Set<string> };

/**
 * A theme's two blocks, read separately.
 *
 * Per-block matters. Checking the file as a whole passes a theme that defines a
 * mode-dependent token only in `:root` — and that mode then inherits the *other*
 * mode's colour, which is exactly the bug a token contract exists to prevent.
 * The 18 layout tokens that legitimately live in `:root` alone are handled by
 * comparing each block against the same block of the reference.
 */
async function readThemeBlocks(file: string): Promise<ThemeBlocks> {
  const text = await fs.readFile(file, 'utf8');
  const blocks = text.split(/(?=^:root)/m).filter((block) => block.startsWith(':root'));
  return {
    base: tokensIn(blocks.find((block) => !/^:root\[/.test(block)) ?? ''),
    alternate: tokensIn(blocks.find((block) => /^:root\[data-theme/.test(block)) ?? ''),
  };
}

const BLOCKS = [
  {
    key: 'base',
    label: ':root',
    fix: `Every theme must define the full :root token set from ${REFERENCE}, or components fall back to unstyled defaults.`,
  },
  {
    key: 'alternate',
    label: ":root[data-theme='…']",
    fix: `The alternate-mode block must override every token ${REFERENCE} overrides. A token missing here inherits the other mode's value — a dark colour shown in light mode.`,
  },
] as const;

/**
 * The theme files C-12 compares, and the gaps it compares them for.
 *
 * Both are separate from the rule body so the self-test can exercise the
 * decision directly: C-12 reads the real theme directory, so running it there
 * can only ever prove the repository is clean — never that the comparison would
 * notice a missing token if there were one.
 */
export async function themeFiles() {
  return (await fs.readdir(path.join(root, THEME_DIR))).filter((file) => file.endsWith('.css'));
}

export function missingTokens(reference: ThemeBlocks, theme: ThemeBlocks) {
  return BLOCKS.map((block) => ({
    ...block,
    missing: [...reference[block.key]].filter((token) => !theme[block.key].has(token)),
  })).filter((entry) => entry.missing.length > 0);
}

export const themeRules: Rule[] = [
  {
    id: 'C-12',
    title: 'Theme token completeness',
    severity: 'error',
    run: async () => {
      let files: string[];
      try {
        files = await themeFiles();
      } catch (error) {
        return [
          {
            rule: 'C-12',
            severity: 'error' as const,
            file: THEME_DIR,
            message: `Could not read the theme directory, so no theme was checked: ${(error as Error).message}`,
            fix: `A run that reads no theme proves nothing, so it fails instead of passing. Create ${THEME_DIR}, or move the themes back to it if astro.config.mjs points \`themesDir\` elsewhere — the gate does not load the Astro config and cannot follow that override.`,
          },
        ];
      }

      const referencePath = path.join(root, THEME_DIR, REFERENCE);
      let reference: ThemeBlocks;
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
        const theme = await readThemeBlocks(path.join(root, THEME_DIR, file));

        for (const gap of missingTokens(reference, theme)) {
          out.push({
            rule: 'C-12',
            severity: 'error',
            file: `${THEME_DIR}/${file}`,
            message: `${gap.label} is missing ${gap.missing.length} token(s): ${gap.missing.slice(0, 8).join(', ')}${gap.missing.length > 8 ? '…' : ''}`,
            fix: gap.fix,
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
      const { targets, failures } = await colourScanTargets();
      const out: Violation[] = [...failures];

      for (const target of targets) {
        let text: string;
        try {
          text = await fs.readFile(target.absolute, 'utf8');
        } catch (error) {
          out.push(
            blindSpot(
              target.file,
              `Could not read a file this rule has to scan: ${(error as Error).message}`,
              'C-13 is only worth its pass if it sees every stylesheet and component. Restore the file, or reinstall dependencies if it belongs to the engine.',
            ),
          );
          continue;
        }
        out.push(...hardcodedColours(text, target));
      }
      return out;
    },
  },
];

export type ScanTarget = { file: string; absolute: string; kind: 'css' | 'component' };

/**
 * A file the rule had to read and could not, reported instead of skipped.
 *
 * The skip is what made this rule worthless the moment the engine became a
 * package: every read was wrapped in `catch { continue }`, so paths that exist
 * only in this repository's layout produced no files, no violations and a green
 * gate. Nothing that reduces the scan to zero may be quiet.
 */
function blindSpot(file: string, message: string, fix: string): Violation {
  return { rule: 'C-13', severity: 'error', file, message, fix };
}

/**
 * Everything C-13 scans.
 *
 * Structural CSS and component code both, not just global.css. Scanning one
 * stylesheet let twenty hex literals sit inside MermaidRenderer.astro for the
 * life of the project: a site that authored its own theme got prose in its
 * colours and diagrams in someone else's, and the rule that exists to prevent
 * exactly that could not see them.
 *
 * The site's template overrides are in the set for the same reason, one plane
 * up. An override is a copy of an engine component with the site's edits on top
 * — the likeliest place in the whole tree for a colour to be typed by hand —
 * and scanning only the engine meant "you can replace anything; you cannot
 * quietly break the contract" held for every rule except the one about colour.
 *
 * Exported so the self-test can assert the list is not empty. A rule whose
 * inputs are read off the filesystem cannot prove anything by finding no
 * violations; it has to show what it looked at.
 */
export async function colourScanTargets(): Promise<{ targets: ScanTarget[]; failures: Violation[] }> {
  const failures: Violation[] = [];
  const targets: ScanTarget[] = [];

  try {
    engineRoot();
  } catch (error) {
    return {
      targets: [],
      failures: [
        blindSpot(
          'aifb-engine',
          `The engine package could not be located, so nothing was scanned: ${(error as Error).message}`,
          'C-13 finds the engine through module resolution, which works whether it sits in packages/ or node_modules/. Until `aifb-engine` resolves there is nothing to check — reinstall dependencies and run the gate again.',
        ),
      ],
    };
  }

  const stylesheet = enginePath('styles', 'global.css');
  targets.push({ file: displayPath(stylesheet), absolute: stylesheet, kind: 'css' });

  const trees = [
    {
      dir: enginePath('components'),
      what: "the engine's components",
      required: true,
      fix: 'Reinstall dependencies: `aifb-engine` resolved, but the components it ships are not there, so C-13 cannot see the code it exists to check.',
    },
    {
      dir: enginePath('layouts'),
      what: "the engine's layouts",
      required: true,
      fix: 'Reinstall dependencies: `aifb-engine` resolved, but the layouts it ships are not there, so C-13 cannot see the code it exists to check.',
    },
    {
      dir: path.join(root, TEMPLATES_DIR),
      what: `the site's template overrides (${TEMPLATES_DIR})`,
      required: false,
      fix: `${TEMPLATES_DIR} exists but could not be read. An override is engine markup the site has edited, which is where a hardcoded colour is most likely — a scan that cannot open it is not a pass.`,
    },
  ];

  for (const tree of trees) {
    const before = targets.length;
    try {
      await walk(tree.dir, targets);
    } catch (error) {
      // Overrides are optional by contract: most sites render the engine's
      // templates unchanged and never create the directory. That absence is the
      // normal case, not a blind spot — a directory that exists and cannot be
      // read is.
      if (!tree.required && (error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      failures.push(
        blindSpot(displayPath(tree.dir), `Could not read ${tree.what}: ${(error as Error).message}`, tree.fix),
      );
      continue;
    }

    if (tree.required && targets.length === before) {
      failures.push(
        blindSpot(
          displayPath(tree.dir),
          `Nothing to scan in ${tree.what} — the directory holds no stylesheet or component this rule can read.`,
          tree.fix,
        ),
      );
    }
  }

  return { targets, failures };
}

/** Exported for the self-test: the decision itself, applied to one file's text. */
export function hardcodedColours(text: string, target: ScanTarget): Violation[] {
  const out: Violation[] = [];

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

  return out;
}

/** Every stylesheet and component under a directory, wherever that directory is. */
async function walk(dir: string, out: ScanTarget[]) {
  for (const item of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      await walk(full, out);
      continue;
    }
    const kind = item.name.endsWith('.astro') ? 'component' : item.name.endsWith('.css') ? 'css' : undefined;
    if (kind) out.push({ file: displayPath(full), absolute: full, kind });
  }
}

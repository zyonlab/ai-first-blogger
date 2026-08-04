/**
 * Chinese typography — punctuation, full/half width, and spacing between CJK
 * and Latin text.
 *
 * This is the one check the framework does not implement itself. `zhlint` is a
 * mature, deterministic, offline linter for exactly this problem, and writing a
 * worse version of it would be the wrong kind of ambition. It fits the pipeline
 * because it is a *rule*, not a judgement: same input, same output, no network,
 * milliseconds.
 *
 * It is orthogonal to `pnpm analyze`: zhlint checks whether the text follows
 * typographic convention, `site/voice.md` checks whether it reads like a
 * template. Neither can do the other's job.
 *
 * Severity is `warn` by default — a missing space between 中文 and English is
 * worth fixing, not worth blocking a deploy over. Raise it in site/policy.yaml.
 */
import { policy } from 'aifb-engine/config/policy';
import { site } from 'aifb-engine/config/site';
import type { Rule, Violation } from '../types';

type ZhlintValidation = { index: number; length: number; message: string };

/**
 * Prose lines worth checking, each with its real line number.
 *
 * Linting line by line rather than whole-document is deliberate. Removing code,
 * JSX and links from a document leaves seams — a dangling `[`, a doubled space,
 * a trailing run of blanks — and zhlint correctly reports every one of them as
 * an error the author never wrote. Per-line, each fragment is trimmed and
 * judged on its own, and the line number needs no offset arithmetic at all.
 *
 * The cost is that rules spanning a line break are not checked. For punctuation
 * and CJK/Latin spacing, which is what this rule is for, that costs nothing —
 * and a rule that cries wolf on correct writing is worse than one with a small
 * blind spot.
 */
function proseLines(body: string) {
  const out: { line: number; text: string }[] = [];
  let inFence = false;

  body.split('\n').forEach((raw, index) => {
    if (/^\s*```/.test(raw)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;

    const text = raw
      .replace(/`[^`]*`/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      // Keep the link label, drop the brackets and URL. Blanking the whole
      // link leaves a gap before the following punctuation, which zhlint
      // correctly reports as a space the author never typed.
      .replace(/!?\[([^\]]*)\]\([^)\s]*\)/g, '$1')
      .replace(/^\s*[#>-]+\s*/, '')
      .trim();

    // Only lines that actually contain CJK are this rule's business.
    if (text.length > 1 && /[一-鿿]/.test(text)) out.push({ line: index + 1, text });
  });

  return out;
}

/** Enabled for Chinese locales unless the policy says otherwise. */
function enabled() {
  const setting = policy.content.typography;
  if (setting === 'off') return false;
  if (setting === 'on') return true;
  return site.locale.toLowerCase().startsWith('zh');
}

export const typographyRules: Rule[] = [
  {
    id: 'C-24',
    title: 'Chinese typography',
    severity: policy.content.typographySeverity,
    run: async ({ entries }) => {
      if (!enabled()) return [];

      // Imported lazily so a site that has switched this off never pays for it.
      const { run } = (await import('zhlint')) as {
        run: (text: string, options: unknown) => { validations: ZhlintValidation[]; result: string };
      };

      const out: Violation[] = [];
      for (const entry of entries) {
        let found = 0;
        for (const { line, text } of proseLines(entry.body)) {
          if (found >= policy.content.typographyMaxPerFile) break;

          let report: { validations: ZhlintValidation[] };
          try {
            report = run(text, { rules: policy.content.typographyRules });
          } catch {
            // A fragment zhlint cannot parse is not a typography failure.
            continue;
          }

          for (const item of report.validations) {
            if (found >= policy.content.typographyMaxPerFile) break;
            found += 1;
            const excerpt = text.slice(Math.max(0, item.index - 10), item.index + item.length + 10).trim();
            out.push({
              rule: 'C-24',
              severity: policy.content.typographySeverity,
              file: entry.file,
              line,
              message: `${item.message} — …${excerpt}…`,
              fix: 'Follow Chinese typographic convention: full-width punctuation, and a space between CJK and Latin text. `pnpm exec zhlint --fix <file>` rewrites the file.',
            });
          }
        }
      }
      return out;
    },
  },
];

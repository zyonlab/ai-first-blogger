/**
 * Article-level content quality — the dimension the gate was missing.
 *
 * Everything else in the gate is structural: does the page have one H1, does
 * the canonical point home, do the links resolve. All of it can be true of an
 * article that says nothing. Until these two rules existed a hundred-word stub
 * with two internal links passed all twenty-five checks and shipped.
 *
 * Both thresholds are policy, and both default low on purpose. The lesson from
 * C-06 — a description floor that had to be lowered twice because it kept
 * flagging good, short writing — applies here exactly: a floor should catch a
 * stub, not enforce a length. Judging whether an article is *good* is not
 * something either of these can do.
 */
import { policy } from 'aifb-engine/config/policy';
import { analyseArticle, displayWidth, splitCode } from '../../style/score';
import type { Rule, Violation } from '../types';

export const qualityRules: Rule[] = [
  {
    id: 'C-26',
    title: 'Article has substance',
    severity: 'error',
    run: ({ entries }) => {
      const floor = policy.content.minBodyWidth;
      if (floor <= 0) return [];

      return entries.flatMap((entry) => {
        // Code is not prose. An article that is mostly a listing has not
        // explained anything, and padding the floor with a long snippet is the
        // easiest way to defeat a rule that counts everything.
        const { prose } = splitCode(entry.body);
        const width = displayWidth(prose.replace(/^\s*[#>|-].*$/gm, '').trim());
        if (width >= floor) return [];

        return [
          {
            rule: 'C-26',
            severity: 'error' as const,
            file: entry.file,
            message: `${width} display columns of prose (floor ${floor}).`,
            fix:
              'Thin pages compete with the real ones for the same queries and win nothing. ' +
              'Say what happened, what it cost, and what you would do differently — or keep it as `draft: true` until it does.',
          },
        ];
      });
    },
  },

  {
    id: 'C-27',
    title: 'Writing style floor',
    severity: 'warn',
    // No floor set is the shipped default: a style score is a pointer at
    // paragraphs worth rewriting, and turning it into a gate before it has been
    // calibrated against real articles produces exactly the kind of rule people
    // learn to ignore. Setting one number in site/policy.yaml arms it.
    run: ({ entries }) => styleFloorViolations(entries, policy.style.minScore, policy.style.severity),
  },
];

/**
 * The C-27 decision, callable with an explicit floor.
 *
 * Split out because the rule is off by default, and a rule the self-test cannot
 * trip is a rule nobody has checked. The harness calls this with a floor set;
 * `run` calls it with whatever the site configured.
 */
export function styleFloorViolations(
  entries: { file: string; body: string }[],
  floor: number | null,
  severity: 'warn' | 'error',
) {
  if (floor === null) return [];

  const out: Violation[] = [];
  for (const entry of entries) {
    const scored = analyseArticle(entry.file, `---\n---\n${entry.body}`);
    if (scored.score >= floor) continue;

    const worst = [...scored.findings]
      .filter((finding) => finding.penalty > 0)
      .sort((a, b) => b.penalty - a.penalty)
      .slice(0, 3);

    out.push({
      rule: 'C-27',
      severity,
      file: entry.file,
      line: worst[0]?.line,
      message: `Style score ${scored.score} is below the floor of ${floor}. Worst: ${worst
        .map((finding) => finding.message)
        .join(' · ')}`,
      fix: `Run \`pnpm analyze ${entry.file}\` for every finding with its line, or lower style.minScore in site/policy.yaml if the floor is wrong.`,
    });
  }
  return out;
}

/**
 * site/voice.md → writing style.
 *
 * One file, two readers. The frontmatter `signals` block is machine-readable
 * and drives `pnpm analyze`; the Markdown body is prose the writing agent
 * reads. They are a division of labour, not a duplication: a phrase table can
 * never judge whether a paragraph carries information, and prose can never
 * become an exit code.
 *
 * Which file is used comes from `style.voice` in site/policy.yaml, so a site
 * can keep several voices and switch between them.
 */
import matter from 'gray-matter';
import { fail, readText } from './load';
import { policy } from './policy';

export type AvoidRule = {
  weight: number;
  why?: string;
  /** Any hit costs `weight`. */
  phrases?: string[];
  /** Only fires when at least `min` of these co-occur. */
  combo?: string[];
  min?: number;
  /** Upper bound on the total penalty from this rule. */
  cap?: number;
};

export type ExpectRule = {
  weight: number;
  why?: string;
  phrases: string[];
};

export type VoiceThresholds = {
  nounListMarks: number;
  nounListWeight: number;
  nounListCap: number;
  codeRatio: number;
  openerWidth: number;
  openerWeight: number;
  /**
   * The shape of an article: how long, how many sections, how much of it is
   * lists. These start **off** — `null` means "this voice has no opinion".
   *
   * They exist because a voice file said "一千五到两千字，六到十个小标题，几乎不用列表"
   * in its prose and the pipeline scored five articles at 100 that were all
   * below the floor, the shortest by 40%. The prose half is read by the writing
   * agent and the frontmatter by the scorer, which is the right division — but
   * length, section count and list density are *decidable*, so leaving them in
   * the undecidable half meant the site's own stated shape went unenforced.
   *
   * Widths are display columns (a CJK character is two), the same unit C-05,
   * C-06 and C-26 use, so one number reads the same in any language.
   */
  minBodyWidth: number | null;
  bodyWidthWeight: number;
  minHeadings: number | null;
  maxHeadings: number | null;
  headingWeight: number;
  /** Fraction of prose lines that are list items, 0–1. */
  maxListRatio: number | null;
  listWeight: number;
};

const DEFAULT_THRESHOLDS: VoiceThresholds = {
  nounListMarks: 4,
  nounListWeight: 5,
  nounListCap: 15,
  codeRatio: 0.5,
  openerWidth: 400,
  openerWeight: 5,
  // Inert by default. A scoring dimension that fires out of the box would
  // silently restate every existing site's score, and a voice that has not
  // stated a length has not agreed to one.
  minBodyWidth: null,
  bodyWidthWeight: 10,
  minHeadings: null,
  maxHeadings: null,
  headingWeight: 5,
  maxListRatio: null,
  listWeight: 5,
};

const file = policy.style.voice;
const parsed = matter(readText(file));
const data = parsed.data as Record<string, any>;
const signals = (data.signals ?? {}) as Record<string, any>;

const problems: string[] = [];
if (typeof data.name !== 'string') problems.push('frontmatter needs a `name`.');
for (const rule of (signals.avoid ?? []) as AvoidRule[]) {
  if (typeof rule.weight !== 'number') problems.push('every `avoid` rule needs a numeric `weight`.');
  if (!rule.phrases && !rule.combo) problems.push('every `avoid` rule needs `phrases` or `combo`.');
}
for (const rule of (signals.expect ?? []) as ExpectRule[]) {
  if (!Array.isArray(rule.phrases)) problems.push('every `expect` rule needs `phrases`.');
}
if (problems.length > 0) fail(`site/${file}`, problems);

export const voice = {
  name: data.name as string,
  description: (data.description as string) ?? '',
  locale: (data.locale as string) ?? '',
  file,
  avoid: ((signals.avoid ?? []) as AvoidRule[]),
  expect: ((signals.expect ?? []) as ExpectRule[]),
  thresholds: { ...DEFAULT_THRESHOLDS, ...((signals.thresholds ?? {}) as Partial<VoiceThresholds>) },
  /** The prose half — what an agent should read before writing. */
  guidance: parsed.content.trim(),
};

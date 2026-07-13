import matter from 'gray-matter';
import type { z } from 'zod';
import type { authorStyleSchema } from './schemas';

export type EditorialFinding = {
  rule: string;
  severity: 'info' | 'warning';
  line: number;
  message: string;
  reviewQuestion: string;
};

type AuthorStyle = z.infer<typeof authorStyleSchema>;

const baselinePatterns = [
  '众所周知',
  '不难发现',
  '值得注意的是',
  '在当今快速发展的',
  '赋能',
  '一站式',
  '深度解析',
  '综上所述',
];
const unsupportedConclusionPattern = /(显著提升|大幅降低|最佳实践|完全解决|必然|一定能够|证明了)/;
const evidencePattern = /(```|\|\s*---|https?:\/\/|\[[^\]]+\]\([^)]+\)|mermaid|数据|测量|日志|基准)/i;
const promisePattern = /(实战|教程|指南|完整|性能|对比|benchmark|case study)/i;

function lineNumber(source: string, index: number) {
  return source.slice(0, index).split('\n').length;
}

export function auditEditorialSource(source: string, authorStyle: AuthorStyle) {
  const parsed = matter(source);
  const body = parsed.content;
  const findings: EditorialFinding[] = [];
  const patterns = [
    ...baselinePatterns,
    ...(authorStyle.enabled ? authorStyle.avoidPatterns : []),
  ];

  for (const pattern of patterns) {
    let start = 0;
    while (true) {
      const index = body.indexOf(pattern, start);
      if (index < 0) break;
      findings.push({
        rule: 'generic-or-avoided-phrase',
        severity: 'warning',
        line: lineNumber(body, index),
        message: `Review generic or explicitly avoided phrase: ${pattern}`,
        reviewQuestion: 'Can this sentence be replaced with a concrete condition, observation, or decision?',
      });
      start = index + pattern.length;
    }
  }

  const paragraphs = body.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter((paragraph) => paragraph && !paragraph.startsWith('#') && !paragraph.startsWith('```'));
  const starters = new Map<string, number[]>();
  for (const paragraph of paragraphs) {
    const index = body.indexOf(paragraph);
    const starter = paragraph.replace(/^[-*>\d.\s]+/, '').slice(0, 12).toLowerCase();
    if (starter.length < 6) continue;
    const lines = starters.get(starter) ?? [];
    lines.push(lineNumber(body, index));
    starters.set(starter, lines);
  }
  for (const [starter, lines] of starters) {
    if (lines.length < 3) continue;
    findings.push({
      rule: 'repeated-paragraph-formula',
      severity: 'warning',
      line: lines[0],
      message: `Three or more paragraphs start with a similar formula: ${starter}`,
      reviewQuestion: 'Do these paragraphs perform distinct jobs, or are they repeating a generated template?',
    });
  }

  for (const match of body.matchAll(new RegExp(unsupportedConclusionPattern.source, 'g'))) {
    const paragraphStart = body.lastIndexOf('\n\n', match.index) + 2;
    const paragraphEnd = body.indexOf('\n\n', match.index);
    const paragraph = body.slice(paragraphStart, paragraphEnd < 0 ? body.length : paragraphEnd);
    if (evidencePattern.test(paragraph)) continue;
    findings.push({
      rule: 'unsupported-conclusion',
      severity: 'warning',
      line: lineNumber(body, match.index ?? 0),
      message: `Strong conclusion lacks nearby evidence: ${match[0]}`,
      reviewQuestion: 'What measurement, source, author evidence, or boundary supports this conclusion?',
    });
  }

  const title = String(parsed.data.title ?? '');
  if (promisePattern.test(title) && !evidencePattern.test(body)) {
    findings.push({
      rule: 'title-promise-evidence-gap',
      severity: 'warning',
      line: 1,
      message: 'The title promises practical, comparative, or performance evidence, but the body has no detectable example, source, table, code, diagram, or measurement.',
      reviewQuestion: 'What concrete artifact proves the promise made by the title?',
    });
  }

  return findings;
}

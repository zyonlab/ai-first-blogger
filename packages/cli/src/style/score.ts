/**
 * Article style scoring — the one implementation.
 *
 * Both `pnpm analyze` and the gate need this: the analyser to report every
 * finding, rule C-27 to decide whether a score is below the site's floor.
 * Computing it twice would let the report and the gate disagree about the same
 * article, which is the failure mode the report exists to prevent.
 *
 * Every signal comes from the site's voice file. This module knows how to
 * count; `site/voice.md` knows what to count.
 */
import matter from 'gray-matter';
import { voice } from 'aifb-engine/config/voice';

const { avoid, expect: expected, thresholds } = voice;

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function displayWidth(text: string) {
  let width = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    const wide =
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60);
    width += wide ? 2 : 1;
  }
  return width;
}

/** Line number of the first occurrence, so a hit can be pointed at. */
function lineOf(text: string, needle: string) {
  const index = text.indexOf(needle);
  if (index === -1) return undefined;
  return text.slice(0, index).split('\n').length;
}

/** Split body into fenced code blocks and prose. */
function splitCode(body: string) {
  const code: string[] = [];
  const prose = body.replace(/```[\s\S]*?```/g, (block) => {
    code.push(block);
    return '\n';
  });
  return { code: code.join('\n'), prose };
}


/**
 * A finding carries the same fields as a validation violation — file, line,
 * message, fix — so the two reports can be acted on the same way. A score with
 * no location is a complaint; a score with `file:line` and an instruction is
 * something an agent can fix.
 */
type Finding = {
  kind: 'avoid' | 'combo' | 'nounList' | 'missing' | 'codeRatio' | 'opener' | 'bodyWidth' | 'headings' | 'listRatio';
  line?: number;
  penalty: number;
  message: string;
  fix: string;
};

/* ------------------------------------------------------------------ *
 * Analysis
 * ------------------------------------------------------------------ */

function analyse(file: string, raw: string) {
  const parsed = matter(raw);
  const body = parsed.content;
  const { code, prose } = splitCode(body);

  const proseWidth = displayWidth(prose);
  const codeWidth = displayWidth(code);
  const totalWidth = proseWidth + codeWidth;

  const paragraphs = prose
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p && !p.startsWith('#') && !p.startsWith('|') && !p.startsWith('-') && !p.startsWith('>'));

  const paraWidths = paragraphs.map((p) => displayWidth(p));
  const headings = [...body.matchAll(/^(#{1,6})\s+(.+)$/gm)].map((m) => ({ depth: m[1]!.length }));
  const internalLinks = new Set([...prose.matchAll(/\]\((\/[^)\s]*)\)/g)].map((m) => m[1]!));

  const findings: Finding[] = [];

  /* --- avoid: phrases and combos ------------------------------------ */
  for (const rule of avoid) {
    let penalty = 0;
    if (rule.phrases) {
      for (const phrase of rule.phrases) {
        if (!body.includes(phrase)) continue;
        penalty += rule.weight;
        findings.push({
          kind: 'avoid',
          line: lineOf(body, phrase),
          penalty: rule.weight,
          message: `「${phrase}」${rule.why ? ` — ${rule.why}` : ''}`,
          fix: '删掉这句，或者换成只有你能写出来的具体内容。',
        });
      }
    }
    if (rule.combo) {
      const present = rule.combo.filter((part) => body.includes(part));
      if (present.length >= (rule.min ?? rule.combo.length)) {
        penalty += rule.weight;
        findings.push({
          kind: 'combo',
          line: lineOf(body, present[0]!),
          penalty: rule.weight,
          message: `模板结构：${present.join(' / ')}${rule.why ? ` — ${rule.why}` : ''}`,
          fix: '按内容本身的逻辑重新分段，而不是套用固定骨架。',
        });
      }
    }
    if (rule.cap !== undefined && penalty > rule.cap) {
      // Trim the excess off the last findings of this rule.
      let excess = penalty - rule.cap;
      for (let i = findings.length - 1; i >= 0 && excess > 0; i -= 1) {
        const take = Math.min(findings[i]!.penalty, excess);
        findings[i]!.penalty -= take;
        excess -= take;
      }
    }
  }

  /* --- expect: groups with zero hits --------------------------------- */
  for (const rule of expected) {
    const hits = rule.phrases.filter((phrase) => prose.includes(phrase));
    if (hits.length === 0) {
      findings.push({
        kind: 'missing',
        penalty: rule.weight,
        message: `缺少${rule.why ? rule.why : '预期信号'}`,
        fix: `加入一段真实的具体内容，例如包含「${rule.phrases.slice(0, 3).join('」「')}」这类表达的段落。`,
      });
    }
  }

  /* --- noun lists ---------------------------------------------------- */
  const nounLists = prose
    .split(/[。！？\n]/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => (sentence.match(/、/g) ?? []).length >= thresholds.nounListMarks);

  let nounPenalty = 0;
  for (const sentence of nounLists) {
    const penalty = Math.min(thresholds.nounListWeight, Math.max(0, thresholds.nounListCap - nounPenalty));
    if (penalty <= 0) break;
    nounPenalty += penalty;
    findings.push({
      kind: 'nounList',
      line: lineOf(body, sentence.slice(0, 20)),
      penalty,
      message: `名词罗列：${sentence.slice(0, 40)}…`,
      fix: '挑一两个真正想说的，对它们说出判断；其余删掉。',
    });
  }

  /* --- structure ----------------------------------------------------- */
  const codeRatio = totalWidth ? Number((codeWidth / totalWidth).toFixed(3)) : 0;
  if (codeRatio > thresholds.codeRatio) {
    findings.push({
      kind: 'codeRatio',
      penalty: Math.round((codeRatio - thresholds.codeRatio) * 100),
      message: `代码占比 ${(codeRatio * 100).toFixed(0)}%`,
      fix: '删掉能被一句话概括的代码块，或者补上解释代码为什么这么写的散文。',
    });
  }

  const opener = paragraphs[0] ?? '';
  const openerWidth = displayWidth(opener);
  if (openerWidth > thresholds.openerWidth) {
    findings.push({
      kind: 'opener',
      line: 1,
      penalty: thresholds.openerWeight,
      message: `首段 ${openerWidth} 列，结论没有前置`,
      fix: '把结论提到第一句，铺垫放到后面或者删掉。',
    });
  }

  /* --- the shape the voice asked for --------------------------------- *
   * All three are off unless the voice states a number. Each message quotes
   * the threshold, because the finding is "you disagree with your own voice
   * file", and that only reads as an instruction if both numbers are visible.
   */
  if (thresholds.minBodyWidth !== null && proseWidth < thresholds.minBodyWidth) {
    findings.push({
      kind: 'bodyWidth',
      penalty: thresholds.bodyWidthWeight,
      message: `正文 ${proseWidth} 列，低于这份 voice 声明的 ${thresholds.minBodyWidth}`,
      fix: '不是加字数——补上被略过的那一段：当时试过什么没成、代价具体是多少、什么场景下不该这么做。',
    });
  }

  const headingCount = headings.length;
  if (thresholds.minHeadings !== null && headingCount < thresholds.minHeadings) {
    findings.push({
      kind: 'headings',
      penalty: thresholds.headingWeight,
      message: `${headingCount} 个小标题，低于声明的 ${thresholds.minHeadings}`,
      fix: '把长段落切开，每段给一个句子式的小标题。连起来读应该等于这篇的摘要。',
    });
  }
  if (thresholds.maxHeadings !== null && headingCount > thresholds.maxHeadings) {
    findings.push({
      kind: 'headings',
      penalty: thresholds.headingWeight,
      message: `${headingCount} 个小标题，高于声明的 ${thresholds.maxHeadings}`,
      fix: '合并只有一两句的小节——它们是提纲的残留，不是结构。',
    });
  }

  if (thresholds.maxListRatio !== null) {
    const proseLines = prose.split('\n').filter((line) => line.trim() !== '');
    const listLines = proseLines.filter((line) => /^\s*([-*+]|\d+[.)])\s+/.test(line));
    const listRatio = proseLines.length ? listLines.length / proseLines.length : 0;
    if (listRatio > thresholds.maxListRatio) {
      findings.push({
        kind: 'listRatio',
        penalty: thresholds.listWeight,
        message: `列表占正文 ${(listRatio * 100).toFixed(0)}%，高于声明的 ${(thresholds.maxListRatio * 100).toFixed(0)}%`,
        fix: '把列表改写成句子。列表是在回避「这几条之间是什么关系」这个问题。',
      });
    }
  }

  const score = Math.max(0, 100 - findings.reduce((sum, item) => sum + item.penalty, 0));

  return {
    file,
    title: (parsed.data.title as string) ?? '',
    draft: parsed.data.draft === true,
    score,
    size: { totalWidth, proseWidth, codeWidth, codeRatio },
    structure: {
      headings: headings.length,
      maxDepth: headings.length ? Math.max(...headings.map((h) => h.depth)) : 0,
      paragraphs: paragraphs.length,
      avgParagraphWidth: paraWidths.length
        ? Math.round(paraWidths.reduce((a, b) => a + b, 0) / paraWidths.length)
        : 0,
      internalLinks: internalLinks.size,
      openerWidth,
    },
    findings,
  };
}
/** One scored article: the score, the size and structure profile, and every finding. */
export type ScoredArticle = ReturnType<typeof analyse>;

export { analyse as analyseArticle, displayWidth, splitCode, lineOf };
export type { Finding };

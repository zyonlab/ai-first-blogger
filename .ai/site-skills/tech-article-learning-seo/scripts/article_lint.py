#!/usr/bin/env python3
"""Editorial linter for Markdown technical articles.

The checker validates Markdown structure, cognitive-budget metadata, rough
reading-load signals, citation-number integrity, and declared validation
artifacts. It cannot determine technical truth, semantic entailment between a
claim and a source, or whether target readers actually understood the text.
"""

from __future__ import annotations

import argparse
import ast
import json
import math
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Iterable


READER_LEVELS = {
    "absolute_beginner",
    "beginner_engineer",
    "intermediate",
    "expert",
}
MATH_BUDGETS = {"none", "intuitive", "light", "formal"}
CODE_BUDGETS = {"none", "pseudocode", "minimal", "production"}
EVIDENCE_TIERS = {"light", "standard", "rigorous"}
EVIDENCE_STATUSES = {"not_started", "draft", "source_checked", "peer_reviewed"}
READER_TEST_STATUSES = {
    "not_run",
    "self_check_only",
    "pilot_run",
    "target_reader_passed",
    "needs_revision",
}


@dataclass
class Finding:
    severity: str
    code: str
    message: str
    line: int | None = None


@dataclass
class Metrics:
    cjk_characters: int
    latin_words: int
    estimated_reading_minutes: float
    headings_h2: int
    headings_h3: int
    sentences: int
    long_sentences: int
    checkpoints: int
    declared_new_terms: int
    code_blocks: int
    formula_markers: int
    numeric_citations: int
    numbered_references: int


def scalar(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value).strip()


def as_list(value: Any) -> list[str]:
    if value is None or value == "":
        return []
    if isinstance(value, list):
        return [scalar(item) for item in value if scalar(item)]
    return [scalar(value)]


def parse_scalar(raw: str) -> Any:
    raw = raw.strip()
    if not raw:
        return ""
    lowered = raw.lower()
    if lowered in {"null", "none", "~"}:
        return None
    if lowered in {"true", "false"}:
        return lowered == "true"
    if re.fullmatch(r"-?\d+", raw):
        try:
            return int(raw)
        except ValueError:
            pass
    if re.fullmatch(r"-?\d+\.\d+", raw):
        try:
            return float(raw)
        except ValueError:
            pass
    if raw.startswith("[") and raw.endswith("]"):
        try:
            value = ast.literal_eval(raw)
            if isinstance(value, (list, tuple)):
                return list(value)
        except (SyntaxError, ValueError):
            inner = raw[1:-1].strip()
            return [item.strip().strip("'\"") for item in inner.split(",") if item.strip()]
    if (raw.startswith('"') and raw.endswith('"')) or (
        raw.startswith("'") and raw.endswith("'")
    ):
        try:
            return ast.literal_eval(raw)
        except (SyntaxError, ValueError):
            return raw[1:-1]
    return raw


def parse_frontmatter(lines: list[str]) -> tuple[dict[str, Any], int]:
    if not lines or lines[0].strip() != "---":
        return {}, 0

    meta: dict[str, Any] = {}
    current_list_key: str | None = None
    end = 0
    for index in range(1, len(lines)):
        raw = lines[index]
        if raw.strip() == "---":
            end = index + 1
            break
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        stripped = raw.strip()
        if stripped.startswith("-") and current_list_key:
            meta.setdefault(current_list_key, []).append(parse_scalar(stripped[1:].strip()))
            continue

        match = re.match(r"^([A-Za-z0-9_-]+):\s*(.*)$", raw)
        if not match:
            current_list_key = None
            continue
        key, raw_value = match.groups()
        if raw_value.strip() == "":
            meta[key] = []
            current_list_key = key
        else:
            meta[key] = parse_scalar(raw_value)
            current_list_key = None
    return meta, end


def iter_visible_lines(lines: list[str], start: int = 0) -> Iterable[tuple[int, str]]:
    in_fence = False
    fence_marker = ""
    for index, raw in enumerate(lines[start:], start=start + 1):
        stripped = raw.lstrip()
        fence = re.match(r"^(```+|~~~+)", stripped)
        if fence:
            marker = fence.group(1)[0]
            if not in_fence:
                in_fence = True
                fence_marker = marker
            elif marker == fence_marker:
                in_fence = False
                fence_marker = ""
            continue
        if not in_fence:
            yield index, raw


def normalize_heading(text: str) -> str:
    return re.sub(r"[\s`*_~:：,，。.!！?？()（）\[\]【】]+", "", text).lower()


def normalize_enum(value: Any) -> str:
    return scalar(value).strip().casefold().replace("-", "_")


def parse_duration_range(value: Any) -> tuple[float, float] | None:
    text = scalar(value).casefold()
    numbers = [float(item) for item in re.findall(r"\d+(?:\.\d+)?", text)]
    if not numbers:
        return None
    if len(numbers) == 1:
        target = numbers[0]
        return target * 0.8, target * 1.2
    lower, upper = numbers[0], numbers[1]
    if lower > upper:
        lower, upper = upper, lower
    return lower, upper


def visible_prose(lines: list[str], body_start: int) -> str:
    chunks: list[str] = []
    for _, raw in iter_visible_lines(lines, body_start):
        text = re.sub(r"<!--.*?-->", " ", raw)
        text = re.sub(r"!\[([^\]]*)\]\([^\)]+\)", r"\1", text)
        text = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", text)
        text = re.sub(r"https?://\S+", " ", text)
        text = re.sub(r"^#{1,6}\s+", "", text)
        text = re.sub(r"^[>*+-]\s+", "", text)
        chunks.append(text)
    return "\n".join(chunks)


def code_block_info(text: str) -> tuple[int, int]:
    blocks = re.findall(r"(?ms)^```([^\n`]*)\n.*?^```\s*$", text)
    code_blocks = 0
    for info in blocks:
        lang = info.strip().casefold()
        if lang not in {"", "text", "plaintext", "plain", "mermaid", "ascii"}:
            code_blocks += 1
    return len(blocks), code_blocks


def sentence_lengths(prose: str) -> list[int]:
    cleaned = re.sub(r"\[[0-9,，\-–—\s]+\]", "", prose)
    parts = re.split(r"(?<=[。！？!?])\s*|\n{2,}", cleaned)
    lengths: list[int] = []
    for part in parts:
        part = re.sub(r"\s+", "", part)
        if len(part) >= 6:
            lengths.append(len(part))
    return lengths


def estimate_reading_minutes(prose: str) -> tuple[int, int, float]:
    cjk = len(re.findall(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]", prose))
    latin = len(re.findall(r"\b[A-Za-z][A-Za-z0-9_'-]*\b", prose))
    minutes = cjk / 450.0 + latin / 220.0
    return cjk, latin, round(minutes, 1)


def expand_numeric_citation(raw: str) -> set[int]:
    values: set[int] = set()
    normalized = raw.replace("，", ",").replace("–", "-").replace("—", "-")
    for part in normalized.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            left, right = [item.strip() for item in part.split("-", 1)]
            if left.isdigit() and right.isdigit():
                a, b = int(left), int(right)
                if 0 < a <= b <= a + 100:
                    values.update(range(a, b + 1))
            continue
        if part.isdigit():
            values.add(int(part))
    return values


def extract_citations(lines: list[str], body_start: int) -> set[int]:
    citations: set[int] = set()
    pattern = re.compile(r"(?<![!\w])\[([0-9]+(?:\s*[-–—,，]\s*[0-9]+)*)\](?!\s*\()")
    for _, raw in iter_visible_lines(lines, body_start):
        if raw.lstrip().startswith("#") and normalize_heading(raw.lstrip("# ")) in {
            "参考资料",
            "参考文献",
            "references",
            "sources",
        }:
            break
        for match in pattern.finditer(raw):
            citations.update(expand_numeric_citation(match.group(1)))
    return citations


def extract_numbered_references(lines: list[str], body_start: int) -> tuple[dict[int, str], int | None]:
    heading_index: int | None = None
    heading_level = 0
    for index in range(body_start, len(lines)):
        match = re.match(r"^(#{1,6})\s+(.+?)\s*$", lines[index])
        if not match:
            continue
        title = normalize_heading(match.group(2))
        if title in {"参考资料", "参考文献", "references", "sources"}:
            heading_index = index
            heading_level = len(match.group(1))
            break
    if heading_index is None:
        return {}, None

    refs: dict[int, list[str]] = {}
    current: int | None = None
    for index in range(heading_index + 1, len(lines)):
        heading = re.match(r"^(#{1,6})\s+", lines[index])
        if heading and len(heading.group(1)) <= heading_level:
            break
        match = re.match(r"^\s*(\d+)[.)、]\s+(.+)$", lines[index])
        if match:
            current = int(match.group(1))
            refs[current] = [match.group(2).strip()]
        elif current is not None and lines[index].strip():
            refs[current].append(lines[index].strip())
    return {key: " ".join(value) for key, value in refs.items()}, heading_index + 1


def validate_enum(
    findings: list[Finding],
    meta: dict[str, Any],
    field: str,
    allowed: set[str],
    missing_severity: str = "warning",
) -> str:
    value = normalize_enum(meta.get(field))
    if not value:
        findings.append(Finding(missing_severity, f"missing_{field}", f"Frontmatter 缺少 {field}。"))
        return ""
    if value not in allowed:
        findings.append(
            Finding(
                "warning",
                f"invalid_{field}",
                f"{field}={scalar(meta.get(field))!r} 不在允许值中：{', '.join(sorted(allowed))}。",
            )
        )
    return value


def relative_artifact_issue(
    findings: list[Finding],
    article_path: Path,
    raw_value: Any,
    field: str,
    required: bool = False,
) -> Path | None:
    value = scalar(raw_value)
    if not value:
        if required:
            findings.append(Finding("error", f"missing_{field}", f"声明的验证状态要求提供 {field}。"))
        return None
    candidate = Path(value)
    if not candidate.is_absolute():
        candidate = article_path.parent / candidate
    if not candidate.exists():
        findings.append(
            Finding("error", f"missing_{field}_file", f"{field} 指向的文件不存在：{candidate}")
        )
    return candidate


def lint(
    path: Path,
    primary_query: str | None = None,
    reader_level_override: str | None = None,
    target_minutes_override: str | None = None,
) -> tuple[list[Finding], Metrics]:
    findings: list[Finding] = []
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    frontmatter, body_start = parse_frontmatter(lines)

    for field in ("title", "description", "slug"):
        if field not in frontmatter or not scalar(frontmatter[field]):
            findings.append(Finding("warning", f"missing_{field}", f"Frontmatter 缺少 {field}。"))

    fence_tokens = re.findall(r"(?m)^\s*(```+|~~~+)", text)
    if len(fence_tokens) % 2 != 0:
        findings.append(Finding("error", "unbalanced_code_fence", "代码围栏数量不成对。"))

    headings: list[tuple[int, int, str]] = []
    heading_counts: dict[str, list[int]] = {}
    previous_level: int | None = None

    for line_no, raw in iter_visible_lines(lines, body_start):
        match = re.match(r"^(#{1,6})\s+(.+?)\s*$", raw)
        if not match:
            continue
        level = len(match.group(1))
        title = match.group(2).strip()
        headings.append((line_no, level, title))
        normalized = normalize_heading(title)
        heading_counts.setdefault(normalized, []).append(line_no)

        if previous_level is not None and level > previous_level + 1:
            findings.append(
                Finding(
                    "error",
                    "heading_level_jump",
                    f"标题层级从 H{previous_level} 跳到 H{level}。",
                    line_no,
                )
            )
        previous_level = level

    h1s = [item for item in headings if item[1] == 1]
    h2s = [item for item in headings if item[1] == 2]
    h3s = [item for item in headings if item[1] == 3]
    if len(h1s) != 1:
        findings.append(Finding("error", "h1_count", f"正文应有且只有一个 H1，当前为 {len(h1s)} 个。"))

    for normalized, line_numbers in heading_counts.items():
        if normalized and len(line_numbers) > 1:
            findings.append(
                Finding(
                    "warning",
                    "duplicate_heading",
                    f"标题重复，行号：{', '.join(map(str, line_numbers))}。",
                    line_numbers[1],
                )
            )

    for line_no, raw in iter_visible_lines(lines, body_start):
        for match in re.finditer(r"!\[([^\]]*)\]\([^\)]+\)", raw):
            if not match.group(1).strip():
                findings.append(Finding("warning", "empty_image_alt", "图片 alt 文本为空。", line_no))

        for match in re.finditer(r"(?<!!)\[([^\]]+)\]\([^\)]+\)", raw):
            anchor = normalize_heading(match.group(1))
            if anchor in {"点击这里", "这里", "更多", "查看详情", "clickhere", "readmore", "link"}:
                findings.append(
                    Finding("warning", "vague_anchor", f"链接文本“{match.group(1)}”缺少目标描述。", line_no)
                )

    paragraphs: list[tuple[int, str]] = []
    buffer: list[str] = []
    buffer_line = 0
    for line_no, raw in iter_visible_lines(lines, body_start):
        stripped = raw.strip()
        boundary = (
            not stripped
            or stripped.startswith("#")
            or stripped.startswith(("- ", "* ", "> ", "|"))
            or bool(re.match(r"^\d+[.)]\s", stripped))
        )
        if boundary:
            if buffer:
                paragraphs.append((buffer_line, " ".join(buffer)))
                buffer = []
            continue
        if not buffer:
            buffer_line = line_no
        buffer.append(stripped)
    if buffer:
        paragraphs.append((buffer_line, " ".join(buffer)))

    for line_no, paragraph in paragraphs:
        visible_length = len(re.sub(r"\s+", "", paragraph))
        if visible_length > 350:
            findings.append(
                Finding(
                    "warning",
                    "long_paragraph",
                    f"段落约 {visible_length} 个非空白字符；考虑按信息职责拆分（编辑性提示，不是排名规则）。",
                    line_no,
                )
            )

    query = (primary_query or scalar(frontmatter.get("primary_query"))).strip().lower()
    if query:
        h2_or_h3 = [title.lower() for _, level, title in headings if level in (2, 3)]
        mentions = sum(1 for title in h2_or_h3 if query in title)
        if len(h2_or_h3) >= 4 and mentions / len(h2_or_h3) > 0.6:
            findings.append(
                Finding(
                    "warning",
                    "query_in_too_many_headings",
                    "主查询出现在超过 60% 的 H2/H3 中，检查是否机械重复或关键词堆砌。",
                )
            )

    title = scalar(frontmatter.get("title"))
    h1_title = h1s[0][2] if len(h1s) == 1 else ""
    if title and h1_title and normalize_heading(title) != normalize_heading(h1_title):
        findings.append(
            Finding(
                "info",
                "title_h1_difference",
                "Frontmatter title 与 H1 不完全相同；确认两者表达同一内容承诺。",
                h1s[0][0],
            )
        )

    # Cognitive-budget metadata and rough load checks.
    reader_level = normalize_enum(reader_level_override) or validate_enum(
        findings, frontmatter, "reader_level", READER_LEVELS
    )
    if not reader_level:
        inference_sample = " ".join(
            [
                scalar(frontmatter.get("title")),
                scalar(frontmatter.get("description")),
                "\n".join(lines[body_start : body_start + 45]),
            ]
        )
        if re.search(
            r"小白|零基础|无需.{0,8}(数学|编程|机器学习).{0,4}基础|不要求.{0,8}(数学|编程)|没有.{0,8}(数学|编程|机器学习).{0,4}基础",
            inference_sample,
            flags=re.IGNORECASE,
        ):
            reader_level = "absolute_beginner"
            findings.append(
                Finding(
                    "info",
                    "inferred_reader_level",
                    "根据标题/开头推断 reader_level=absolute_beginner；请在 frontmatter 明确声明。",
                )
            )
    if reader_level_override and reader_level not in READER_LEVELS:
        findings.append(
            Finding("warning", "invalid_reader_level_override", f"未知 reader level：{reader_level_override}")
        )
    math_budget = validate_enum(findings, frontmatter, "math_budget", MATH_BUDGETS)
    code_budget = validate_enum(findings, frontmatter, "code_budget", CODE_BUDGETS, "info")
    evidence_tier = validate_enum(findings, frontmatter, "evidence_tier", EVIDENCE_TIERS)
    evidence_status = validate_enum(findings, frontmatter, "evidence_status", EVIDENCE_STATUSES)
    reader_test_status = validate_enum(
        findings, frontmatter, "reader_test_status", READER_TEST_STATUSES
    )

    prose = visible_prose(lines, body_start)
    cjk_count, latin_words, reading_minutes = estimate_reading_minutes(prose)
    lengths = sentence_lengths(prose)
    threshold = {
        "absolute_beginner": 75,
        "beginner_engineer": 100,
        "intermediate": 130,
        "expert": 160,
    }.get(reader_level, 110)
    long_sentences = sum(length > threshold for length in lengths)
    if lengths and long_sentences >= max(3, math.ceil(len(lengths) * 0.08)):
        findings.append(
            Finding(
                "warning",
                "sentence_load",
                f"约 {long_sentences}/{len(lengths)} 个句子超过当前读者等级的编辑阈值 {threshold} 字符；检查多层因果和从句。",
            )
        )

    target_value: Any = target_minutes_override or frontmatter.get("reading_time_target")
    target_range = parse_duration_range(target_value)
    if target_range is None:
        severity = "warning" if reader_level == "absolute_beginner" else "info"
        findings.append(Finding(severity, "missing_reading_time_target", "未声明 reading_time_target。"))
    else:
        lower, upper = target_range
        if reading_minutes > upper * 1.15:
            findings.append(
                Finding(
                    "warning",
                    "reading_time_over_budget",
                    f"估算阅读时长约 {reading_minutes:.1f} 分钟，超过目标 {scalar(target_value)}；请删减、分层或说明超预算理由。",
                )
            )
        elif reading_minutes < lower * 0.6:
            findings.append(
                Finding(
                    "info",
                    "reading_time_under_target",
                    f"估算阅读时长约 {reading_minutes:.1f} 分钟，明显短于目标 {scalar(target_value)}；确认标题承诺是否仍完整兑现。",
                )
            )

    new_terms = as_list(frontmatter.get("new_terms"))
    raw_term_budget = frontmatter.get("core_term_budget")
    term_budget: int | None = None
    try:
        if raw_term_budget not in (None, ""):
            term_budget = int(raw_term_budget)
    except (TypeError, ValueError):
        findings.append(Finding("warning", "invalid_core_term_budget", "core_term_budget 必须是整数。"))

    if not new_terms:
        severity = "warning" if reader_level == "absolute_beginner" else "info"
        findings.append(Finding(severity, "missing_new_terms", "未声明 new_terms，无法核对核心术语预算。"))
    if term_budget is None:
        severity = "warning" if reader_level == "absolute_beginner" else "info"
        findings.append(Finding(severity, "missing_core_term_budget", "未声明 core_term_budget。"))
    elif term_budget < 0:
        findings.append(Finding("warning", "invalid_core_term_budget", "core_term_budget 不得为负数。"))
    elif len(new_terms) > term_budget:
        findings.append(
            Finding(
                "warning",
                "term_budget_exceeded",
                f"声明了 {len(new_terms)} 个核心新术语，超过预算 {term_budget}。",
            )
        )
    prose_casefold = prose.casefold()
    for term in new_terms:
        if term.casefold() not in prose_casefold:
            findings.append(
                Finding("info", "declared_term_not_found", f"new_terms 中的“{term}”未在可见正文中找到。")
            )

    quick_path_value = frontmatter.get("quick_path_minutes")
    quick_path_requested = False
    try:
        quick_path_requested = float(quick_path_value) > 0
    except (TypeError, ValueError):
        if quick_path_value not in (None, ""):
            findings.append(Finding("warning", "invalid_quick_path_minutes", "quick_path_minutes 应为数字。"))
    quick_path_present = bool(
        re.search(
            r"阅读路线|快速阅读|快速理解|快速路线|只想快速|(?:3|三|5|五)\s*分钟",
            "\n".join(title for _, _, title in headings) + "\n" + prose[:2200],
            flags=re.IGNORECASE,
        )
    )
    if (quick_path_requested or (reader_level == "absolute_beginner" and reading_minutes > 10.0)) and not quick_path_present:
        findings.append(
            Finding(
                "warning",
                "missing_quick_path",
                "文章较长或声明了 quick_path_minutes，但未发现明确的快速阅读路线。",
            )
        )
    if reader_level == "absolute_beginner" and len(h2s) > 14:
        findings.append(
            Finding(
                "warning",
                "too_many_top_level_steps",
                f"绝对小白文章包含 {len(h2s)} 个 H2；检查是否可合并、分层或拆篇。",
            )
        )

    checkpoints = len(re.findall(r"检查点|理解自测|自测|试一试|复述", prose))
    if reader_level == "absolute_beginner" and len(h2s) >= 8:
        expected = max(2, len(h2s) // 5)
        if checkpoints < expected:
            findings.append(
                Finding(
                    "warning",
                    "few_comprehension_checks",
                    f"仅发现约 {checkpoints} 个理解检查信号；当前 {len(h2s)} 个 H2 建议至少约 {expected} 个。",
                )
            )

    all_fences, real_code_blocks = code_block_info("\n".join(lines[body_start:]))
    formula_markers = len(re.findall(r"(?s)\$\$.*?\$\$|\\\[.*?\\\]|(?<!\$)\$[^\n$]+\$(?!\$)", prose))
    if math_budget == "none" and formula_markers:
        findings.append(Finding("warning", "math_over_budget", "math_budget=none，但正文包含公式标记。"))
    elif math_budget == "intuitive" and formula_markers > 3:
        findings.append(
            Finding("warning", "math_over_budget", f"math_budget=intuitive，但检测到约 {formula_markers} 个公式。")
        )
    if code_budget == "none" and real_code_blocks:
        findings.append(
            Finding("warning", "code_over_budget", f"code_budget=none，但检测到 {real_code_blocks} 个非文本代码块。")
        )

    # Citation integrity and declared evidence artifacts.
    citations = extract_citations(lines, body_start)
    references, references_line = extract_numbered_references(lines, body_start)
    if citations and not references:
        findings.append(Finding("error", "missing_reference_list", "正文使用数字引用，但未找到编号参考资料。"))
    missing_refs = sorted(citations - set(references))
    if missing_refs:
        findings.append(
            Finding("error", "citation_without_reference", f"以下引用没有对应参考资料：{missing_refs}。")
        )
    unused_refs = sorted(set(references) - citations)
    if references and unused_refs and len(unused_refs) >= max(3, len(references) // 2):
        findings.append(
            Finding(
                "info",
                "many_uncited_references",
                f"有较多参考资料未在正文出现引用：{unused_refs}；确认它们是否只是延伸阅读。",
                references_line,
            )
        )

    if evidence_tier in {"standard", "rigorous"} and not citations and not re.search(r"https?://", prose):
        findings.append(
            Finding("warning", "no_visible_evidence", f"evidence_tier={evidence_tier}，但正文未发现数字引用或可见来源链接。")
        )
    if evidence_tier == "rigorous":
        weak_locations = [num for num, entry in references.items() if not re.search(
            r"https?://|doi\s*:|arxiv\s*:|isbn\s*:|rfc\s*\d+|[Ss]ection\s+\d+|第\s*\d+\s*[章节页]",
            entry,
            flags=re.IGNORECASE,
        )]
        if weak_locations:
            findings.append(
                Finding(
                    "warning",
                    "reference_without_locator",
                    f"rigorous 证据等级下，以下参考资料缺少明显的稳定定位信息：{weak_locations}。",
                )
            )

    claim_markers = re.findall(r"<!--\s*claim:([A-Za-z0-9_.-]+)\s*-->", text, flags=re.IGNORECASE)
    duplicate_claim_markers = sorted({item for item in claim_markers if claim_markers.count(item) > 1})
    if duplicate_claim_markers:
        findings.append(
            Finding("warning", "duplicate_claim_marker", f"以下 claim 标记重复：{duplicate_claim_markers}。")
        )
    if evidence_tier == "rigorous" and not claim_markers:
        findings.append(
            Finding("warning", "missing_claim_markers", "rigorous 文章未发现 <!-- claim:C01 --> 可追踪标记。")
        )

    ledger_path = scalar(frontmatter.get("evidence_ledger"))
    if ledger_path:
        relative_artifact_issue(findings, path, ledger_path, "evidence_ledger")
    elif evidence_status == "peer_reviewed" or evidence_tier == "rigorous":
        severity = "error" if evidence_status == "peer_reviewed" else "warning"
        findings.append(Finding(severity, "missing_evidence_ledger", "当前证据等级/状态要求提供 evidence_ledger。"))
    elif evidence_status == "source_checked" and not ledger_path:
        findings.append(
            Finding("warning", "source_checked_without_ledger", "evidence_status=source_checked，但未提供可审计的 evidence_ledger。")
        )

    if evidence_tier in {"standard", "rigorous"} and evidence_status in {"", "not_started", "draft"}:
        findings.append(
            Finding("warning", "evidence_not_source_checked", "核心主张尚未声明完成 source_checked 语义核验。")
        )

    report_path = scalar(frontmatter.get("reader_test_report"))
    if report_path:
        relative_artifact_issue(findings, path, report_path, "reader_test_report")
    elif reader_test_status == "target_reader_passed":
        relative_artifact_issue(findings, path, report_path, "reader_test_report", required=True)

    overclaim_text = " ".join([title, scalar(frontmatter.get("description")), h1_title])
    if re.search(
        r"保证.{0,5}(看懂|学会)|人人.{0,4}(都)?(能懂|看懂)|一看就(懂|会)|彻底(搞懂|掌握)|最通俗|小白.{0,4}一看",
        overclaim_text,
        flags=re.IGNORECASE,
    ) and reader_test_status != "target_reader_passed":
        findings.append(
            Finding(
                "warning",
                "unvalidated_comprehension_claim",
                "标题或摘要包含强理解效果承诺，但 reader_test_status 不是 target_reader_passed。",
            )
        )

    metrics = Metrics(
        cjk_characters=cjk_count,
        latin_words=latin_words,
        estimated_reading_minutes=reading_minutes,
        headings_h2=len(h2s),
        headings_h3=len(h3s),
        sentences=len(lengths),
        long_sentences=long_sentences,
        checkpoints=checkpoints,
        declared_new_terms=len(new_terms),
        code_blocks=all_fences,
        formula_markers=formula_markers,
        numeric_citations=len(citations),
        numbered_references=len(references),
    )
    return findings, metrics


def main() -> int:
    parser = argparse.ArgumentParser(
        description="检查 Markdown 技术文章的结构、认知预算和引用完整性。"
    )
    parser.add_argument("article", type=Path, help="Markdown 文件路径")
    parser.add_argument("--primary-query", help="可选：覆盖 frontmatter 主查询，检查标题机械重复")
    parser.add_argument("--reader-level", help="可选：覆盖 frontmatter reader_level")
    parser.add_argument("--target-minutes", help="可选：覆盖 reading_time_target，例如 8-12m")
    parser.add_argument("--report", action="store_true", help="同时输出粗略阅读与结构指标")
    parser.add_argument("--strict", action="store_true", help="有 warning 时也返回非零退出码")
    parser.add_argument("--json", action="store_true", help="输出 JSON")
    args = parser.parse_args()

    if not args.article.exists() or not args.article.is_file():
        print(f"文件不存在：{args.article}", file=sys.stderr)
        return 2

    try:
        findings, metrics = lint(
            args.article,
            args.primary_query,
            args.reader_level,
            args.target_minutes,
        )
    except UnicodeDecodeError:
        print("文件不是有效的 UTF-8 文本。", file=sys.stderr)
        return 2
    except OSError as exc:
        print(f"读取失败：{exc}", file=sys.stderr)
        return 2

    errors = sum(item.severity == "error" for item in findings)
    warnings = sum(item.severity == "warning" for item in findings)
    status = "BLOCKED" if errors else ("REVIEW" if warnings else "STRUCTURE_PASS")

    if args.json:
        if args.report:
            print(
                json.dumps(
                    {
                        "status": status,
                        "validation_scope": "automated_structure_cognitive_budget_and_citation_integrity_only",
                        "metrics": asdict(metrics),
                        "findings": [asdict(item) for item in findings],
                    },
                    ensure_ascii=False,
                    indent=2,
                )
            )
        else:
            print(json.dumps([asdict(item) for item in findings], ensure_ascii=False, indent=2))
    else:
        if args.report:
            print(
                "Metrics: "
                f"reading≈{metrics.estimated_reading_minutes:.1f}m | "
                f"H2={metrics.headings_h2} | H3={metrics.headings_h3} | "
                f"sentences={metrics.sentences} | long={metrics.long_sentences} | "
                f"checkpoints={metrics.checkpoints} | terms={metrics.declared_new_terms} | "
                f"citations={metrics.numeric_citations}/{metrics.numbered_references} refs"
            )
        if not findings:
            print(
                "STRUCTURE PASS：未发现可自动识别的结构、认知预算或引用完整性风险。"
                "该结果不代表技术事实、证据语义或真实读者理解已通过。"
            )
        else:
            order = {"error": 0, "warning": 1, "info": 2}
            for item in sorted(findings, key=lambda x: (order.get(x.severity, 9), x.line or 0, x.code)):
                location = f"L{item.line} " if item.line else ""
                print(f"[{item.severity.upper()}] {location}{item.code}: {item.message}")
            print(
                f"Result: {status} | errors={errors} warnings={warnings}. "
                "自动结果仅覆盖结构、粗略认知负担和引用完整性。"
            )

    if errors:
        return 2
    if args.strict and warnings:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

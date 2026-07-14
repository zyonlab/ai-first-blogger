#!/usr/bin/env python3
"""Lint a directory of Markdown files that form a technical article series.

The checker intentionally uses only Python's standard library. It validates
front matter, article IDs, parts, prerequisite links, navigation reciprocity,
query overlap, and a few Markdown continuity risks. It is an editorial aid,
not a substitute for technical or SEO review.
"""

from __future__ import annotations

import argparse
import ast
import json
import re
import sys
from collections import defaultdict
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Iterable

FRONT_MATTER_BOUNDARY = re.compile(r"^---\s*$", re.MULTILINE)
H1_RE = re.compile(r"^#(?!#)\s+\S", re.MULTILINE)
H2_RE = re.compile(r"^##\s+(.+?)\s*$", re.MULTILINE)

REQUIRED_FIELDS = (
    "title",
    "slug",
    "series_id",
    "article_id",
    "part",
    "status",
    "role",
    "learning_outcome",
    "validation",
    "primary_query",
    "search_intent",
)

RECOMMENDED_FIELDS = (
    "reader_level",
    "math_budget",
    "code_budget",
    "reading_time_target",
    "core_term_budget",
    "evidence_tier",
    "evidence_status",
    "reader_test_status",
)

READER_LEVELS = {
    "absolute_beginner": 0,
    "beginner_engineer": 1,
    "intermediate": 2,
    "expert": 3,
}
MATH_BUDGETS = {"none": 0, "intuitive": 1, "light": 2, "formal": 3}
CODE_BUDGETS = {"none": 0, "pseudocode": 1, "minimal": 2, "production": 3}
EVIDENCE_TIERS = {"light", "standard", "rigorous"}
EVIDENCE_STATUSES = {"not_started", "draft", "source_checked", "peer_reviewed"}
READER_TEST_STATUSES = {
    "not_run",
    "self_check_only",
    "pilot_run",
    "target_reader_passed",
    "needs_revision",
}

SHARED_FILENAMES = {
    "series-map.md",
    "glossary.md",
    "continuity-ledger.md",
    "evidence-ledger.md",
    "seo-map.md",
    "readme.md",
}


@dataclass(frozen=True)
class Issue:
    severity: str
    code: str
    path: str
    message: str


@dataclass
class Article:
    path: Path
    meta: dict[str, Any]
    body: str

    @property
    def series_id(self) -> str:
        return scalar(self.meta.get("series_id"))

    @property
    def article_id(self) -> str:
        return scalar(self.meta.get("article_id"))

    @property
    def slug(self) -> str:
        return scalar(self.meta.get("slug"))

    @property
    def query(self) -> str:
        return scalar(self.meta.get("primary_query"))

    @property
    def role(self) -> str:
        return scalar(self.meta.get("role"))

    @property
    def part(self) -> int | None:
        value = self.meta.get("part")
        if isinstance(value, int):
            return value
        try:
            return int(scalar(value))
        except (TypeError, ValueError):
            return None


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


def parse_front_matter(text: str) -> tuple[dict[str, Any], str]:
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return {}, text

    end_index = None
    for index in range(1, len(lines)):
        if lines[index].strip() == "---":
            end_index = index
            break
    if end_index is None:
        return {}, text

    meta_lines = lines[1:end_index]
    body = "\n".join(lines[end_index + 1 :])
    meta: dict[str, Any] = {}
    current_list_key: str | None = None

    for raw_line in meta_lines:
        if not raw_line.strip() or raw_line.lstrip().startswith("#"):
            continue
        stripped = raw_line.strip()
        if stripped.startswith("-") and current_list_key:
            meta.setdefault(current_list_key, []).append(parse_scalar(stripped[1:].strip()))
            continue

        match = re.match(r"^([A-Za-z0-9_-]+):\s*(.*)$", raw_line)
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

    return meta, body


def normalized(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip().casefold()


def first_prose_paragraph(body: str) -> str:
    paragraphs: list[str] = []
    current: list[str] = []
    in_fence = False

    for line in body.splitlines():
        if line.strip().startswith("```"):
            in_fence = not in_fence
            continue
        if in_fence or line.lstrip().startswith("#") or line.lstrip().startswith(">"):
            if current:
                paragraphs.append(" ".join(current))
                current = []
            continue
        if not line.strip():
            if current:
                paragraphs.append(" ".join(current))
                current = []
            continue
        if line.lstrip().startswith(("- ", "* ", "+ ")):
            continue
        current.append(line.strip())
    if current:
        paragraphs.append(" ".join(current))

    return normalized(paragraphs[0]) if paragraphs else ""


def discover_articles(root: Path) -> tuple[list[Article], list[Issue]]:
    issues: list[Issue] = []
    articles: list[Article] = []
    candidates: Iterable[Path]

    if root.is_file():
        candidates = [root]
    else:
        candidates = sorted(root.rglob("*.md"))

    for path in candidates:
        if path.name.casefold() in SHARED_FILENAMES:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            issues.append(Issue("error", "encoding", str(path), "文件不是有效 UTF-8。"))
            continue
        except OSError as exc:
            issues.append(Issue("error", "read-failed", str(path), f"无法读取文件：{exc}"))
            continue

        meta, body = parse_front_matter(text)
        if not meta:
            continue
        if not any(key in meta for key in ("series_id", "article_id", "part")):
            continue
        articles.append(Article(path=path, meta=meta, body=body))

    if not articles:
        issues.append(
            Issue(
                "error",
                "no-articles",
                str(root),
                "没有发现带 series_id/article_id/part front matter 的系列文章。",
            )
        )
    return articles, issues


def add_duplicate_issues(
    articles: list[Article],
    key_name: str,
    getter,
    issues: list[Issue],
    severity: str = "error",
) -> None:
    seen: dict[str, list[Article]] = defaultdict(list)
    for article in articles:
        value = normalized(getter(article))
        if value:
            seen[value].append(article)
    for value, matches in seen.items():
        if len(matches) > 1:
            paths = ", ".join(str(item.path) for item in matches)
            issues.append(
                Issue(
                    severity,
                    f"duplicate-{key_name}",
                    paths,
                    f"{key_name} 重复：{value}",
                )
            )


def detect_cycle(graph: dict[str, set[str]]) -> list[str] | None:
    state: dict[str, int] = {}
    stack: list[str] = []

    def visit(node: str) -> list[str] | None:
        status = state.get(node, 0)
        if status == 1:
            try:
                start = stack.index(node)
            except ValueError:
                start = 0
            return stack[start:] + [node]
        if status == 2:
            return None

        state[node] = 1
        stack.append(node)
        for neighbor in graph.get(node, set()):
            if neighbor in graph:
                cycle = visit(neighbor)
                if cycle:
                    return cycle
        stack.pop()
        state[node] = 2
        return None

    for node in graph:
        cycle = visit(node)
        if cycle:
            return cycle
    return None


def lint_group(series_id: str, articles: list[Article]) -> list[Issue]:
    issues: list[Issue] = []

    add_duplicate_issues(articles, "article-id", lambda a: a.article_id, issues)
    add_duplicate_issues(articles, "slug", lambda a: a.slug, issues)
    add_duplicate_issues(
        articles,
        "primary-query",
        lambda a: a.query,
        issues,
        severity="warning",
    )

    ids = {article.article_id: article for article in articles if article.article_id}
    parts: dict[int, list[Article]] = defaultdict(list)

    for article in articles:
        relpath = str(article.path)
        for field in REQUIRED_FIELDS:
            value = article.meta.get(field)
            if value in (None, "", []):
                issues.append(
                    Issue("error", "missing-field", relpath, f"缺少必填字段：{field}")
                )

        if article.role != "navigation":
            for field in RECOMMENDED_FIELDS:
                value = article.meta.get(field)
                if value in (None, "", []):
                    issues.append(
                        Issue("warning", "missing-learning-field", relpath, f"缺少学习/验证字段：{field}")
                    )

            reader_level = normalized(scalar(article.meta.get("reader_level"))).replace("-", "_")
            math_budget = normalized(scalar(article.meta.get("math_budget"))).replace("-", "_")
            code_budget = normalized(scalar(article.meta.get("code_budget"))).replace("-", "_")
            evidence_tier = normalized(scalar(article.meta.get("evidence_tier"))).replace("-", "_")
            evidence_status = normalized(scalar(article.meta.get("evidence_status"))).replace("-", "_")
            reader_test_status = normalized(scalar(article.meta.get("reader_test_status"))).replace("-", "_")

            for field, value, allowed in (
                ("reader_level", reader_level, set(READER_LEVELS)),
                ("math_budget", math_budget, set(MATH_BUDGETS)),
                ("code_budget", code_budget, set(CODE_BUDGETS)),
                ("evidence_tier", evidence_tier, EVIDENCE_TIERS),
                ("evidence_status", evidence_status, EVIDENCE_STATUSES),
                ("reader_test_status", reader_test_status, READER_TEST_STATUSES),
            ):
                if value and value not in allowed:
                    issues.append(
                        Issue("warning", "invalid-learning-field", relpath, f"{field}={value!r} 不在允许值中。")
                    )

            try:
                term_budget = int(article.meta.get("core_term_budget"))
            except (TypeError, ValueError):
                term_budget = None
                if article.meta.get("core_term_budget") not in (None, ""):
                    issues.append(
                        Issue("warning", "invalid-term-budget", relpath, "core_term_budget 必须是整数。")
                    )
            if term_budget is not None:
                new_terms = as_list(article.meta.get("new_core_concepts"))
                if len(new_terms) > term_budget:
                    issues.append(
                        Issue(
                            "warning",
                            "term-budget-exceeded",
                            relpath,
                            f"new_core_concepts={len(new_terms)} 超过 core_term_budget={term_budget}。",
                        )
                    )

            evidence_ledger = scalar(article.meta.get("evidence_ledger"))
            if evidence_status == "peer_reviewed" and not evidence_ledger:
                issues.append(
                    Issue("error", "missing-evidence-ledger", relpath, "evidence_status=peer_reviewed 但 evidence_ledger 为空。")
                )
            reader_report = scalar(article.meta.get("reader_test_report"))
            if reader_test_status == "target_reader_passed" and not reader_report:
                issues.append(
                    Issue("error", "missing-reader-test-report", relpath, "reader_test_status=target_reader_passed 但 reader_test_report 为空。")
                )

        if article.part is None:
            issues.append(Issue("error", "invalid-part", relpath, "part 必须是整数。"))
        else:
            parts[article.part].append(article)

        h1_count = len(H1_RE.findall(article.body))
        if h1_count != 1:
            issues.append(
                Issue(
                    "error",
                    "h1-count",
                    relpath,
                    f"正文应有且只有一个 H1，当前为 {h1_count}。",
                )
            )

        headings = [normalized(value) for value in H2_RE.findall(article.body)]
        if article.role != "navigation" and not any("验证" in item or "验收" in item for item in headings):
            issues.append(
                Issue(
                    "warning",
                    "missing-validation-section",
                    relpath,
                    "未发现包含“验证”或“验收”的 H2；请确认可观察结果是否足够醒目。",
                )
            )
        if scalar(article.meta.get("next")) and not any("下一步" in item for item in headings):
            issues.append(
                Issue(
                    "warning",
                    "missing-next-section",
                    relpath,
                    "front matter 声明了 next，但正文未发现“下一步”H2。",
                )
            )

        previous = scalar(article.meta.get("previous"))
        next_id = scalar(article.meta.get("next"))
        prereqs = as_list(article.meta.get("prerequisites"))

        for field_name, reference in (("previous", previous), ("next", next_id)):
            if reference and reference not in ids:
                issues.append(
                    Issue(
                        "error",
                        "missing-reference",
                        relpath,
                        f"{field_name} 引用了不存在的 article_id：{reference}",
                    )
                )
        for reference in prereqs:
            if reference not in ids:
                issues.append(
                    Issue(
                        "error",
                        "missing-prerequisite",
                        relpath,
                        f"prerequisites 引用了不存在的 article_id：{reference}",
                    )
                )
            elif article.part is not None and ids[reference].part is not None and ids[reference].part >= article.part:
                issues.append(
                    Issue(
                        "error",
                        "forward-prerequisite",
                        relpath,
                        f"前置文章 {reference} 的 part 不早于当前文章。",
                    )
                )

    for part, matches in parts.items():
        if len(matches) > 1:
            issues.append(
                Issue(
                    "error",
                    "duplicate-part",
                    ", ".join(str(item.path) for item in matches),
                    f"part={part} 被多篇文章使用。",
                )
            )

    ordered_parts = sorted(parts)
    if ordered_parts:
        expected = list(range(ordered_parts[0], ordered_parts[-1] + 1))
        missing = sorted(set(expected) - set(ordered_parts))
        if missing:
            issues.append(
                Issue(
                    "warning",
                    "part-gap",
                    series_id,
                    f"篇次存在空缺：{missing}",
                )
            )

    for article in articles:
        previous = scalar(article.meta.get("previous"))
        next_id = scalar(article.meta.get("next"))
        if previous in ids:
            reciprocal = scalar(ids[previous].meta.get("next"))
            if reciprocal and reciprocal != article.article_id:
                issues.append(
                    Issue(
                        "warning",
                        "navigation-not-reciprocal",
                        str(article.path),
                        f"previous={previous}，但该文章的 next={reciprocal}。",
                    )
                )
        if next_id in ids:
            reciprocal = scalar(ids[next_id].meta.get("previous"))
            if reciprocal and reciprocal != article.article_id:
                issues.append(
                    Issue(
                        "warning",
                        "navigation-not-reciprocal",
                        str(article.path),
                        f"next={next_id}，但该文章的 previous={reciprocal}。",
                    )
                )

    graph: dict[str, set[str]] = {}
    for article in articles:
        if not article.article_id:
            continue
        dependencies = set(as_list(article.meta.get("prerequisites")))
        previous = scalar(article.meta.get("previous"))
        if previous:
            dependencies.add(previous)
        graph[article.article_id] = dependencies
    cycle = detect_cycle(graph)
    if cycle:
        issues.append(
            Issue(
                "error",
                "dependency-cycle",
                series_id,
                "依赖形成循环：" + " -> ".join(cycle),
            )
        )

    # Detect abrupt cognitive-level jumps between adjacent parts.
    ordered_articles = sorted(
        (article for article in articles if article.part is not None),
        key=lambda item: item.part or 0,
    )
    for previous_article, current_article in zip(ordered_articles, ordered_articles[1:]):
        for field, scale in (
            ("reader_level", READER_LEVELS),
            ("math_budget", MATH_BUDGETS),
            ("code_budget", CODE_BUDGETS),
        ):
            previous_value = normalized(scalar(previous_article.meta.get(field))).replace("-", "_")
            current_value = normalized(scalar(current_article.meta.get(field))).replace("-", "_")
            if previous_value in scale and current_value in scale and scale[current_value] - scale[previous_value] > 1:
                issues.append(
                    Issue(
                        "warning",
                        "abrupt-learning-jump",
                        str(current_article.path),
                        f"{field} 从 {previous_value} 跳到 {current_value}；检查是否需要桥接篇或前置说明。",
                    )
                )

    opening_map: dict[str, list[Article]] = defaultdict(list)
    for article in articles:
        opening = first_prose_paragraph(article.body)
        if len(opening) >= 60:
            opening_map[opening].append(article)
    for opening, matches in opening_map.items():
        if len(matches) > 1:
            issues.append(
                Issue(
                    "warning",
                    "duplicate-opening",
                    ", ".join(str(item.path) for item in matches),
                    "多篇文章使用了完全相同的较长开场，可能存在模板化重复。",
                )
            )

    return issues


def lint(root: Path) -> tuple[list[Article], list[Issue]]:
    articles, issues = discover_articles(root)
    grouped: dict[str, list[Article]] = defaultdict(list)
    for article in articles:
        grouped[article.series_id or "<missing-series-id>"].append(article)

    for series_id, group in grouped.items():
        issues.extend(lint_group(series_id, group))
    return articles, issues


def print_text(root: Path, articles: list[Article], issues: list[Issue]) -> None:
    errors = sum(issue.severity == "error" for issue in issues)
    warnings = sum(issue.severity == "warning" for issue in issues)
    print(f"Series lint: {root}")
    print(f"Articles: {len(articles)} | Errors: {errors} | Warnings: {warnings}")
    if not issues:
        print("SERIES STRUCTURE PASS：未发现可自动识别的系列结构、依赖或学习字段风险；该结果不代表技术、证据语义或读者理解已验证。")
        return
    for issue in issues:
        print(f"[{issue.severity.upper()}] {issue.code}: {issue.path}")
        print(f"  {issue.message}")


def main() -> int:
    parser = argparse.ArgumentParser(description="检查 Markdown 技术文章系列的结构、认知连续性与验证字段。")
    parser.add_argument("path", type=Path, help="系列目录或单个 Markdown 文件")
    parser.add_argument("--json", action="store_true", help="以 JSON 输出结果")
    args = parser.parse_args()

    root = args.path.resolve()
    if not root.exists():
        print(f"路径不存在：{root}", file=sys.stderr)
        return 2

    articles, issues = lint(root)
    errors = sum(issue.severity == "error" for issue in issues)
    warnings = sum(issue.severity == "warning" for issue in issues)

    if args.json:
        payload = {
            "path": str(root),
            "articles": len(articles),
            "errors": errors,
            "warnings": warnings,
            "status": "BLOCKED" if errors else ("REVISE" if warnings else "PASS"),
            "issues": [asdict(issue) for issue in issues],
        }
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        print_text(root, articles, issues)

    if errors:
        return 2
    if warnings:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

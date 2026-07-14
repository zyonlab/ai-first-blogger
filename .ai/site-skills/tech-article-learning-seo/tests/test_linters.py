from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ARTICLE_LINT = ROOT / "scripts" / "article_lint.py"
EVIDENCE_LINT = ROOT / "scripts" / "evidence_lint.py"
SERIES_LINT = ROOT / "scripts" / "series_lint.py"


def run_json(*args: str) -> tuple[int, dict | list]:
    completed = subprocess.run(
        [sys.executable, *args],
        text=True,
        capture_output=True,
        check=False,
    )
    try:
        payload = json.loads(completed.stdout)
    except json.JSONDecodeError as exc:  # pragma: no cover - diagnostic branch
        raise AssertionError(
            f"Invalid JSON output. rc={completed.returncode}\nstdout={completed.stdout}\nstderr={completed.stderr}"
        ) from exc
    return completed.returncode, payload


class ArticleLintTests(unittest.TestCase):
    def test_infers_absolute_beginner_and_flags_long_missing_quick_path(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "article.md"
            sections = []
            for index in range(1, 17):
                sections.append(f"## 第 {index} 步\n\n" + "这是面向零基础读者的解释。" * 38)
            path.write_text(
                """---
title: "零基础理解测试主题"
description: "不要求数学和编程基础。"
slug: "beginner-test"
---

# 零基础理解测试主题

> 先给结论。

"""
                + "\n\n".join(sections),
                encoding="utf-8",
            )
            rc, payload = run_json(str(ARTICLE_LINT), str(path), "--report", "--json")
            self.assertEqual(rc, 0)
            codes = {item["code"] for item in payload["findings"]}
            self.assertIn("inferred_reader_level", codes)
            self.assertIn("missing_quick_path", codes)
            self.assertIn("too_many_top_level_steps", codes)

    def test_missing_numeric_reference_is_error(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "article.md"
            path.write_text(
                """---
title: "引用测试"
description: "测试数字引用完整性。"
slug: "citation-test"
reader_level: "beginner_engineer"
math_budget: "none"
code_budget: "none"
reading_time_target: "3-5m"
core_term_budget: 2
new_terms: ["术语"]
evidence_tier: "standard"
evidence_status: "source_checked"
evidence_ledger: "ledger.json"
reader_test_status: "not_run"
---

# 引用测试

## 结论

这是一个需要来源的结论。[2]

## 参考资料

1. Example. https://example.com
""",
                encoding="utf-8",
            )
            (Path(tmp) / "ledger.json").write_text("{}", encoding="utf-8")
            rc, payload = run_json(str(ARTICLE_LINT), str(path), "--report", "--json")
            self.assertEqual(rc, 2)
            codes = {item["code"] for item in payload["findings"]}
            self.assertIn("citation_without_reference", codes)

    def test_target_reader_passed_requires_report(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "article.md"
            path.write_text(
                """---
title: "读者测试声明"
description: "验证声明完整性。"
slug: "reader-test"
reader_level: "absolute_beginner"
math_budget: "none"
code_budget: "none"
reading_time_target: "3-5m"
quick_path_minutes: 0
core_term_budget: 1
new_terms: ["概念"]
evidence_tier: "light"
evidence_status: "source_checked"
reader_test_status: "target_reader_passed"
reader_test_report: ""
---

# 读者测试声明

## 概念

概念解释。
""",
                encoding="utf-8",
            )
            rc, payload = run_json(str(ARTICLE_LINT), str(path), "--report", "--json")
            self.assertEqual(rc, 2)
            codes = {item["code"] for item in payload["findings"]}
            self.assertIn("missing_reader_test_report", codes)


class EvidenceLintTests(unittest.TestCase):
    def test_traceable_standard_claim_passes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            article = root / "article.md"
            article.write_text(
                """---
title: "证据测试"
evidence_status: "source_checked"
---
# 证据测试

## 机制

该机制在此条件下成立。[1]
<!-- claim:C01 -->

## 参考资料

1. Primary source. https://example.com/source
""",
                encoding="utf-8",
            )
            ledger = root / "ledger.json"
            ledger.write_text(
                json.dumps(
                    {
                        "article": "article.md",
                        "evidence_tier": "standard",
                        "traceability_required": True,
                        "claims": [
                            {
                                "id": "C01",
                                "importance": "core",
                                "claim_type": "fact",
                                "published_claim": "该机制在此条件下成立。",
                                "article_location": "## 机制",
                                "citation_markers": ["[1]"],
                                "source_type": "paper",
                                "source": "Primary source",
                                "source_locator": "https://example.com/source",
                                "source_summary": "来源在相同条件下报告该机制。",
                                "reviewer_verdict": "direct",
                                "scope_match": "yes",
                                "strength_match": "yes",
                                "qualifier_in_article": "",
                                "limitations": "仅在声明条件下。",
                                "rationale": "",
                                "provenance": "",
                                "counterevidence_checked": False,
                                "verification_status": "source_checked",
                                "reviewed_by": "",
                                "reviewed_at": "",
                            }
                        ],
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )
            rc, payload = run_json(
                str(EVIDENCE_LINT), str(ledger), "--article", str(article), "--json"
            )
            self.assertEqual(rc, 0)
            self.assertEqual(payload["status"], "TRACEABILITY_PASS")

    def test_partial_support_without_qualifier_is_blocked(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            ledger = Path(tmp) / "ledger.json"
            ledger.write_text(
                json.dumps(
                    {
                        "evidence_tier": "standard",
                        "traceability_required": False,
                        "claims": [
                            {
                                "id": "C01",
                                "importance": "core",
                                "claim_type": "fact",
                                "published_claim": "无条件结论。",
                                "article_location": "## 结论",
                                "citation_markers": ["[1]"],
                                "source_type": "paper",
                                "source": "Source",
                                "source_locator": "Section 2",
                                "source_summary": "只支持有限条件。",
                                "reviewer_verdict": "partial",
                                "scope_match": "partial",
                                "strength_match": "partial",
                                "qualifier_in_article": "",
                                "verification_status": "source_checked",
                            }
                        ],
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )
            rc, payload = run_json(str(EVIDENCE_LINT), str(ledger), "--json")
            self.assertEqual(rc, 2)
            codes = {item["code"] for item in payload["findings"]}
            self.assertIn("partial_without_qualifier", codes)


class SeriesLintTests(unittest.TestCase):
    def test_abrupt_reader_math_and_code_jump_is_reported(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            common = {
                "series_id": "s1",
                "status": "draft",
                "role": "foundation",
                "learning_outcome": "完成一个目标",
                "validation": "可观察结果",
                "primary_query": "query",
                "search_intent": "informational",
                "reading_time_target": "5-8m",
                "core_term_budget": 2,
                "new_core_concepts": ["A"],
                "evidence_tier": "standard",
                "evidence_status": "source_checked",
                "reader_test_status": "not_run",
            }

            def write_article(
                name: str,
                article_id: str,
                part: int,
                previous: str,
                next_id: str,
                reader_level: str,
                math_budget: str,
                code_budget: str,
                query: str,
            ) -> None:
                meta = dict(common)
                meta.update(
                    {
                        "title": name,
                        "slug": name.lower(),
                        "article_id": article_id,
                        "part": part,
                        "previous": previous,
                        "next": next_id,
                        "prerequisites": [previous] if previous else [],
                        "reader_level": reader_level,
                        "math_budget": math_budget,
                        "code_budget": code_budget,
                        "primary_query": query,
                    }
                )
                lines = ["---"]
                for key, value in meta.items():
                    if isinstance(value, list):
                        lines.append(f"{key}: {json.dumps(value, ensure_ascii=False)}")
                    elif isinstance(value, str):
                        lines.append(f'{key}: "{value}"')
                    else:
                        lines.append(f"{key}: {value}")
                lines.extend(["---", "", f"# {name}", "", "## 验证本篇结果", "", "通过。"])
                (root / f"{article_id}.md").write_text("\n".join(lines), encoding="utf-8")

            write_article("First", "01", 1, "", "02", "absolute_beginner", "none", "none", "q1")
            write_article("Second", "02", 2, "01", "", "expert", "formal", "production", "q2")

            rc, payload = run_json(str(SERIES_LINT), str(root), "--json")
            self.assertEqual(rc, 1)
            codes = {item["code"] for item in payload["issues"]}
            self.assertIn("abrupt-learning-jump", codes)


if __name__ == "__main__":
    unittest.main()

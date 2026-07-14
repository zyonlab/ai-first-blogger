#!/usr/bin/env python3
"""Validate a claim-evidence ledger and its traceability to an article.

This tool checks schema completeness, declared review outcomes, article claim
markers, and nearby citation markers. It does not read sources or independently
judge whether a source semantically entails a claim.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any


EVIDENCE_TIERS = {"light", "standard", "rigorous"}
IMPORTANCE = {"core", "supporting", "context"}
CLAIM_TYPES = {"fact", "inference", "experience", "recommendation"}
SOURCE_TYPES = {
    "standard",
    "law_or_regulation",
    "official_documentation",
    "paper",
    "source_code",
    "dataset",
    "experiment",
    "expert_input",
    "secondary",
    "other",
}
VERDICTS = {"direct", "partial", "unsupported", "contradicted", "unclear"}
MATCH_VALUES = {"yes", "partial", "no", "unclear"}
VERIFICATION_STATUSES = {"draft", "self_checked", "source_checked", "peer_reviewed"}


@dataclass
class Finding:
    severity: str
    code: str
    message: str
    claim_id: str | None = None


def scalar(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def normalized(value: Any) -> str:
    return scalar(value).casefold().replace("-", "_")


def as_list(value: Any) -> list[str]:
    if value is None or value == "":
        return []
    if isinstance(value, list):
        return [scalar(item) for item in value if scalar(item)]
    return [scalar(value)]


def require(
    findings: list[Finding],
    claim: dict[str, Any],
    claim_id: str,
    field: str,
    severity: str = "error",
) -> str:
    value = scalar(claim.get(field))
    if not value:
        findings.append(Finding(severity, f"missing_{field}", f"缺少字段：{field}", claim_id))
    return value


def enum_value(
    findings: list[Finding],
    claim: dict[str, Any],
    claim_id: str,
    field: str,
    allowed: set[str],
    required: bool = True,
) -> str:
    value = normalized(claim.get(field))
    if not value:
        if required:
            findings.append(Finding("error", f"missing_{field}", f"缺少字段：{field}", claim_id))
        return ""
    if value not in allowed:
        findings.append(
            Finding(
                "error",
                f"invalid_{field}",
                f"{field}={scalar(claim.get(field))!r} 不在允许值中：{', '.join(sorted(allowed))}",
                claim_id,
            )
        )
    return value


def parse_article_frontmatter(text: str) -> dict[str, str]:
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return {}
    meta: dict[str, str] = {}
    for raw in lines[1:]:
        if raw.strip() == "---":
            break
        match = re.match(r"^([A-Za-z0-9_-]+):\s*(.*)$", raw)
        if match:
            key, value = match.groups()
            meta[key] = value.strip().strip("'\"")
    return meta


def heading_exists(article_text: str, location: str) -> bool:
    if not location:
        return False
    needle = re.sub(r"^#+\s*", "", location).strip().casefold()
    if not needle:
        return False
    for match in re.finditer(r"(?m)^#{1,6}\s+(.+?)\s*$", article_text):
        heading = match.group(1).strip().casefold()
        if needle == heading or needle in heading or heading in needle:
            return True
    return False


def marker_windows(article_text: str, claim_id: str) -> list[str]:
    pattern = re.compile(
        rf"<!--\s*claim:{re.escape(claim_id)}\s*-->",
        flags=re.IGNORECASE,
    )
    windows: list[str] = []
    for match in pattern.finditer(article_text):
        start = max(0, match.start() - 900)
        end = min(len(article_text), match.end() + 250)
        windows.append(article_text[start:end])
    return windows


def lint_ledger(ledger: dict[str, Any], article_path: Path | None) -> list[Finding]:
    findings: list[Finding] = []
    tier = normalized(ledger.get("evidence_tier"))
    if not tier:
        findings.append(Finding("error", "missing_evidence_tier", "ledger 缺少 evidence_tier。"))
    elif tier not in EVIDENCE_TIERS:
        findings.append(
            Finding("error", "invalid_evidence_tier", f"未知 evidence_tier：{tier}")
        )

    claims_raw = ledger.get("claims")
    if not isinstance(claims_raw, list) or not claims_raw:
        findings.append(Finding("error", "missing_claims", "ledger.claims 必须是非空数组。"))
        return findings

    claims: list[dict[str, Any]] = []
    ids: dict[str, int] = {}
    for index, raw in enumerate(claims_raw, start=1):
        if not isinstance(raw, dict):
            findings.append(Finding("error", "invalid_claim", f"第 {index} 条 claim 不是对象。"))
            continue
        claim = raw
        claim_id = scalar(claim.get("id")) or f"<claim-{index}>"
        if not scalar(claim.get("id")):
            findings.append(Finding("error", "missing_id", "缺少 claim id。", claim_id))
        elif not re.fullmatch(r"[A-Za-z0-9_.-]+", claim_id):
            findings.append(
                Finding("error", "invalid_id", "claim id 只能包含字母、数字、点、下划线或连字符。", claim_id)
            )
        ids[claim_id] = ids.get(claim_id, 0) + 1
        claims.append(claim)

    for claim_id, count in ids.items():
        if count > 1:
            findings.append(Finding("error", "duplicate_id", f"claim id 重复 {count} 次。", claim_id))

    for claim in claims:
        claim_id = scalar(claim.get("id")) or "<missing>"
        importance = enum_value(findings, claim, claim_id, "importance", IMPORTANCE)
        claim_type = enum_value(findings, claim, claim_id, "claim_type", CLAIM_TYPES)
        require(findings, claim, claim_id, "published_claim")
        location = require(findings, claim, claim_id, "article_location", "warning")
        verdict = enum_value(findings, claim, claim_id, "reviewer_verdict", VERDICTS)
        scope_match = enum_value(findings, claim, claim_id, "scope_match", MATCH_VALUES)
        strength_match = enum_value(findings, claim, claim_id, "strength_match", MATCH_VALUES)
        verification = enum_value(
            findings, claim, claim_id, "verification_status", VERIFICATION_STATUSES
        )

        is_core = importance == "core"
        source = scalar(claim.get("source"))
        source_locator = scalar(claim.get("source_locator"))
        source_summary = scalar(claim.get("source_summary"))
        source_type = normalized(claim.get("source_type"))
        qualifier = scalar(claim.get("qualifier_in_article"))
        rationale = scalar(claim.get("rationale"))
        provenance = scalar(claim.get("provenance"))

        source_required = claim_type in {"fact", "experience"} or is_core
        if source_required and not source:
            findings.append(Finding("error", "missing_source", "核心/事实主张缺少 source。", claim_id))
        if source_required and not source_locator:
            findings.append(
                Finding("error", "missing_source_locator", "核心/事实主张缺少 source_locator。", claim_id)
            )
        if source_required and not source_summary:
            findings.append(
                Finding("error", "missing_source_summary", "缺少来源实际支持内容的摘要。", claim_id)
            )
        if source_type:
            if source_type not in SOURCE_TYPES:
                findings.append(
                    Finding(
                        "warning",
                        "invalid_source_type",
                        f"未知 source_type：{source_type}",
                        claim_id,
                    )
                )
        elif source_required:
            findings.append(Finding("warning", "missing_source_type", "缺少 source_type。", claim_id))

        if is_core and verdict in {"unsupported", "contradicted", "unclear"}:
            findings.append(
                Finding(
                    "error",
                    "core_claim_not_supported",
                    f"核心主张 reviewer_verdict={verdict}，不得作为确定结论发布。",
                    claim_id,
                )
            )
        if is_core and scope_match in {"no", "unclear"}:
            findings.append(
                Finding(
                    "error",
                    "scope_mismatch",
                    f"核心主张 scope_match={scope_match}。",
                    claim_id,
                )
            )
        if is_core and strength_match in {"no", "unclear"}:
            findings.append(
                Finding(
                    "error",
                    "strength_mismatch",
                    f"核心主张 strength_match={strength_match}。",
                    claim_id,
                )
            )
        if (verdict == "partial" or scope_match == "partial" or strength_match == "partial") and not qualifier:
            findings.append(
                Finding(
                    "error" if is_core else "warning",
                    "partial_without_qualifier",
                    "记录为部分支持/部分匹配，但 qualifier_in_article 为空。",
                    claim_id,
                )
            )

        if claim_type == "inference" and not rationale:
            findings.append(
                Finding("warning", "inference_without_rationale", "推断缺少 rationale。", claim_id)
            )
        if claim_type == "recommendation" and not rationale:
            findings.append(
                Finding("warning", "recommendation_without_rationale", "建议缺少决策依据 rationale。", claim_id)
            )
        if claim_type == "experience" and not provenance:
            findings.append(
                Finding("error", "experience_without_provenance", "经验主张缺少真实来源/环境 provenance。", claim_id)
            )

        if is_core and verification in {"draft", "self_checked"}:
            findings.append(
                Finding(
                    "warning",
                    "core_claim_not_source_checked",
                    f"核心主张 verification_status={verification}，尚未完成来源语义核验。",
                    claim_id,
                )
            )
        if verification == "peer_reviewed":
            if not scalar(claim.get("reviewed_by")):
                findings.append(
                    Finding("error", "peer_review_without_reviewer", "标记 peer_reviewed 但 reviewed_by 为空。", claim_id)
                )
            if not scalar(claim.get("reviewed_at")):
                findings.append(
                    Finding("warning", "peer_review_without_date", "标记 peer_reviewed 但 reviewed_at 为空。", claim_id)
                )

        if is_core and source_type == "secondary":
            findings.append(
                Finding(
                    "warning",
                    "core_claim_secondary_source",
                    "核心主张只记录了二手来源；确认是否能追溯一手来源。",
                    claim_id,
                )
            )
        if tier == "rigorous" and is_core and claim.get("counterevidence_checked") is not True:
            findings.append(
                Finding(
                    "warning",
                    "counterevidence_not_checked",
                    "rigorous 核心主张未标记 counterevidence_checked=true。",
                    claim_id,
                )
            )

        markers = as_list(claim.get("citation_markers"))
        if is_core and not markers:
            findings.append(
                Finding(
                    "warning" if tier != "rigorous" else "error",
                    "missing_citation_markers",
                    "核心主张缺少 citation_markers，无法检查正文引用邻接。",
                    claim_id,
                )
            )

        if article_path is not None and location:
            # Checked later once article text is loaded; keep the field here.
            pass

    if article_path is None:
        return findings

    if not article_path.exists() or not article_path.is_file():
        findings.append(Finding("error", "article_not_found", f"文章不存在：{article_path}"))
        return findings

    try:
        article_text = article_path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as exc:
        findings.append(Finding("error", "article_read_failed", f"无法读取文章：{exc}"))
        return findings

    article_meta = parse_article_frontmatter(article_text)
    article_markers = re.findall(
        r"<!--\s*claim:([A-Za-z0-9_.-]+)\s*-->", article_text, flags=re.IGNORECASE
    )
    marker_counts: dict[str, int] = {}
    for marker in article_markers:
        marker_counts[marker] = marker_counts.get(marker, 0) + 1
    for marker, count in marker_counts.items():
        if count > 1:
            findings.append(
                Finding("warning", "duplicate_article_marker", f"正文 claim 标记出现 {count} 次。", marker)
            )
        if marker not in ids:
            findings.append(
                Finding("error", "article_marker_not_in_ledger", "正文 claim 标记在 ledger 中不存在。", marker)
            )

    traceability_required = ledger.get("traceability_required") is True
    for claim in claims:
        claim_id = scalar(claim.get("id"))
        if not claim_id:
            continue
        importance = normalized(claim.get("importance"))
        if traceability_required and importance == "core" and claim_id not in marker_counts:
            findings.append(
                Finding("error", "core_claim_marker_missing", "核心主张未在正文加入 claim 标记。", claim_id)
            )

        location = scalar(claim.get("article_location"))
        if location and not heading_exists(article_text, location):
            findings.append(
                Finding(
                    "warning",
                    "article_location_not_found",
                    f"正文未找到 article_location：{location}",
                    claim_id,
                )
            )

        citation_markers = as_list(claim.get("citation_markers"))
        windows = marker_windows(article_text, claim_id)
        if windows and citation_markers:
            found_nearby = any(
                any(marker in window for marker in citation_markers) for window in windows
            )
            if not found_nearby:
                findings.append(
                    Finding(
                        "warning",
                        "citation_not_near_claim",
                        f"未在 claim 标记附近找到 citation_markers={citation_markers}。",
                        claim_id,
                    )
                )

    article_evidence_status = normalized(article_meta.get("evidence_status"))
    if article_evidence_status == "peer_reviewed":
        not_peer = [
            scalar(claim.get("id"))
            for claim in claims
            if normalized(claim.get("importance")) == "core"
            and normalized(claim.get("verification_status")) != "peer_reviewed"
        ]
        if not_peer:
            findings.append(
                Finding(
                    "error",
                    "article_peer_review_status_inconsistent",
                    f"文章声明 evidence_status=peer_reviewed，但核心主张未全部同行审阅：{not_peer}",
                )
            )

    return findings


def main() -> int:
    parser = argparse.ArgumentParser(description="检查主张—证据台账和正文可追踪性。")
    parser.add_argument("ledger", type=Path, help="evidence-ledger.json 路径")
    parser.add_argument("--article", type=Path, help="可选：对应 Markdown 文章")
    parser.add_argument("--strict", action="store_true", help="有 warning 时返回非零退出码")
    parser.add_argument("--json", action="store_true", help="输出 JSON")
    args = parser.parse_args()

    if not args.ledger.exists() or not args.ledger.is_file():
        print(f"ledger 不存在：{args.ledger}", file=sys.stderr)
        return 2

    try:
        ledger = json.loads(args.ledger.read_text(encoding="utf-8"))
    except UnicodeDecodeError:
        print("ledger 不是有效 UTF-8。", file=sys.stderr)
        return 2
    except json.JSONDecodeError as exc:
        print(f"ledger JSON 无效：{exc}", file=sys.stderr)
        return 2
    except OSError as exc:
        print(f"读取 ledger 失败：{exc}", file=sys.stderr)
        return 2

    if not isinstance(ledger, dict):
        print("ledger 根节点必须是 JSON 对象。", file=sys.stderr)
        return 2

    article_path = args.article
    if article_path is None and scalar(ledger.get("article")):
        candidate = Path(scalar(ledger.get("article")))
        if not candidate.is_absolute():
            candidate = args.ledger.parent / candidate
        article_path = candidate

    findings = lint_ledger(ledger, article_path)
    errors = sum(item.severity == "error" for item in findings)
    warnings = sum(item.severity == "warning" for item in findings)
    status = "BLOCKED" if errors else ("REVIEW" if warnings else "TRACEABILITY_PASS")

    if args.json:
        print(
            json.dumps(
                {
                    "status": status,
                    "validation_scope": "ledger_completeness_and_article_traceability_only",
                    "article": str(article_path) if article_path else None,
                    "errors": errors,
                    "warnings": warnings,
                    "findings": [asdict(item) for item in findings],
                },
                ensure_ascii=False,
                indent=2,
            )
        )
    elif not findings:
        print(
            "TRACEABILITY PASS：台账字段、正文 claim 标记和引用邻接未发现可自动识别的问题。"
            "脚本没有独立阅读来源，不能证明语义支持关系正确。"
        )
    else:
        order = {"error": 0, "warning": 1, "info": 2}
        for item in sorted(findings, key=lambda x: (order.get(x.severity, 9), x.claim_id or "", x.code)):
            claim = f" [{item.claim_id}]" if item.claim_id else ""
            print(f"[{item.severity.upper()}]{claim} {item.code}: {item.message}")
        print(
            f"Result: {status} | errors={errors} warnings={warnings}. "
            "请由写作者/审阅者实际阅读来源完成语义判断。"
        )

    if errors:
        return 2
    if args.strict and warnings:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

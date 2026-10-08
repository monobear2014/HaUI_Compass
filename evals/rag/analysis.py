"""Evidence tables and paired run comparison; no product or prompt changes."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

TAXONOMY = (
    "retrieval_miss",
    "ranking_issue",
    "tokenization_issue",
    "normalization_issue",
    "multi_source_recall_issue",
    "generation_missing_concept",
    "unsupported_claim",
    "bad_citation",
    "false_refusal",
    "missed_refusal",
    "context_failure",
    "prompt_injection_failure",
    "provider_error",
    "timeout",
    "evaluator_issue",
    "dataset_issue",
)


def failure_rows(report: dict[str, Any]) -> list[dict[str, Any]]:
    failures = []
    for row in report["cases"]:
        expected = set(row["expected_sources"])
        found = set().union(*(set(item["source_ids"]) for item in row["retrieved"]))
        tags = []
        if row["answerable"] and not expected & found:
            tags.append("retrieval_miss")
        elif row["answerable"] and not expected <= found:
            tags.append("multi_source_recall_issue")
        if row.get("provider_error"):
            tags.append("timeout" if row.get("failure_reason") == "timeout" else "provider_error")
        elif "status" in row:
            if row["answerable"] and row["status"] == "abstained":
                tags.append("false_refusal")
            if not row["answerable"] and row["status"] == "answered":
                tags.append("missed_refusal")
            if row["status"] == "answered" and row["answerable"]:
                if not row.get("required_concepts_met", True):
                    tags.append("generation_missing_concept")
                if not row.get("citation_correct", True):
                    tags.append("bad_citation")
            if row.get("unsupported_claim"):
                tags.append("unsupported_claim")
                if row["category"] == "adversarial":
                    tags.append("prompt_injection_failure")
        if tags:
            failures.append(
                {
                    "case": row["case_id"],
                    "turn": row["turn_index"] + 1,
                    "category": row["category"],
                    "tags": tags,
                    "retrieved_sources": sorted(found),
                    "expected_sources": sorted(expected),
                    "question": row["question"],
                    "answer": row.get("answer"),
                    "root_cause": "provider"
                    if row.get("provider_error")
                    else "retrieval"
                    if any(t in tags for t in ("retrieval_miss", "multi_source_recall_issue"))
                    else "generation_or_evaluator_review",
                }
            )
    return failures


def compare(before: dict[str, Any], after: dict[str, Any]) -> list[dict[str, Any]]:
    rows = []
    for section in ("retrieval", "generation", "token_usage"):
        for key, value in (before.get(section) or {}).items():
            new = (after.get(section) or {}).get(key)
            if isinstance(value, (float, int)) and isinstance(new, (float, int)):
                rows.append(
                    {
                        "metric": f"{section}.{key}",
                        "baseline": value,
                        "hardened": new,
                        "delta": round(new - value, 4),
                    }
                )
    for stage, metrics in before["latency_ms"].items():
        if metrics and after["latency_ms"].get(stage):
            for key in ("p50", "p95"):
                value = metrics[key]
                new = after["latency_ms"][stage][key]
                rows.append(
                    {
                        "metric": f"{stage}_ms.{key}",
                        "baseline": value,
                        "hardened": new,
                        "delta": round(new - value, 3),
                    }
                )
    for category, metrics in before["retrieval"]["by_category"].items():
        value = metrics["hit_at_3"]
        new = after["retrieval"]["by_category"].get(category, {}).get("hit_at_3")
        if value is not None and new is not None:
            rows.append(
                {
                    "metric": f"{category}.hit_at_3",
                    "baseline": value,
                    "hardened": new,
                    "delta": round(new - value, 4),
                }
            )
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("baseline", type=Path)
    parser.add_argument("--candidate", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    baseline = json.loads(args.baseline.read_text())
    result: dict[str, Any] = {"taxonomy": TAXONOMY, "failures": failure_rows(baseline)}
    if args.candidate:
        candidate = json.loads(args.candidate.read_text())
        result["comparison"] = compare(baseline, candidate)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()

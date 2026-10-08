#!/usr/bin/env python3
"""RAG Evaluation Harness v1 for the private Compass Assistant.

Retrieval mode is deterministic and offline. Full mode is an explicit live-provider
run through the real upload, ingestion, chat, generation, citation and persistence path.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import secrets
import signal
import subprocess
import sys
import tempfile
import time
import unicodedata
import uuid
from collections import Counter
from contextlib import suppress
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx

ROOT = Path(__file__).resolve().parents[1]
DATASET = ROOT / "evals/datasets/compass-rag-v1.json"
DEFAULT_OUTPUT = ROOT / "artifacts/evals/compass-rag-v1"
CATEGORIES = {
    "direct_factual": 12,
    "paraphrased": 8,
    "multi_section": 6,
    "follow_up": 6,
    "no_evidence": 8,
    "ambiguous": 4,
    "adversarial": 4,
}


class DatasetError(ValueError):
    pass


def load_dataset(path: Path = DATASET) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise DatasetError(f"cannot load dataset: {exc}") from exc
    if (
        value.get("$schema") != "./compass-rag-v1.schema.json"
        or value.get("version") not in ("compass-rag-eval-v1", "compass-rag-eval-v1-pdf")
        or value.get("fictional_only") is not True
    ):
        raise DatasetError("dataset must be versioned compass-rag-eval-v1 and fictional_only")
    cases = value.get("cases")
    if not isinstance(cases, list) or not 40 <= len(cases) <= 60:
        raise DatasetError("dataset must contain 40 to 60 cases")
    ids = [case.get("id") for case in cases if isinstance(case, dict)]
    if len(ids) != len(cases) or len(ids) != len(set(ids)):
        raise DatasetError("case ids must be present and unique")
    counts = Counter(case.get("category") for case in cases)
    expected_counts = {**CATEGORIES, **({"pdf": 8} if value["version"].endswith("-pdf") else {})}
    if counts != Counter(expected_counts):
        raise DatasetError(f"category distribution must be {CATEGORIES}, got {dict(counts)}")
    documents = value.get("documents", [])
    if not isinstance(documents, list) or not documents:
        raise DatasetError("documents must be a non-empty list")
    document_keys = [row.get("key") for row in documents if isinstance(row, dict)]
    if len(document_keys) != len(documents) or len(document_keys) != len(set(document_keys)):
        raise DatasetError("document keys must be present and unique")
    fixture_root = (ROOT / "evals/rag/fixtures").resolve()
    sources_by_document: dict[str, set[str]] = {}
    for document in documents:
        document_path = (ROOT / document.get("path", "")).resolve()
        if not document_path.is_relative_to(fixture_root) or not document_path.is_file():
            raise DatasetError(f"{document.get('key')}: fixture path is missing or unsafe")
        if document_path.suffix == ".pdf":
            from haui_compass.infrastructure.retrieval.pdf import extract_pages

            text = "\n".join(page.text for page in extract_pages(document_path.read_bytes()))
        else:
            text = document_path.read_text(encoding="utf-8")
        markers = re.findall(r"\[SOURCE:([^\]]+)\]", text)
        if not markers or len(markers) != len(set(markers)):
            raise DatasetError(f"{document['key']}: source markers must be present and unique")
        sources_by_document[document["key"]] = set(markers)
    for case in cases:
        if case.get("document") not in set(document_keys):
            raise DatasetError(f"{case['id']}: unknown document")
        turns = case.get("turns", [case])
        if case["category"] == "follow_up" and (not isinstance(turns, list) or len(turns) < 2):
            raise DatasetError(f"{case['id']}: follow_up requires at least two turns")
        for turn in turns:
            if not isinstance(turn.get("question"), str) or not turn["question"].strip():
                raise DatasetError(f"{case['id']}: non-blank question required")
            if not isinstance(turn.get("answerable"), bool):
                raise DatasetError(f"{case['id']}: answerable must be boolean")
            sources = turn.get("expected_sources")
            if not isinstance(sources, list) or (turn["answerable"] and not sources):
                raise DatasetError(f"{case['id']}: answerable turns require expected_sources")
            if not set(sources) <= sources_by_document[case["document"]]:
                raise DatasetError(f"{case['id']}: expected source is absent from fixture")
            if not isinstance(turn.get("required_concepts"), list):
                raise DatasetError(f"{case['id']}: required_concepts must be a list")
    return value


def nearest_rank(values: list[float], percentile: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    return round(ordered[max(0, math.ceil(percentile * len(ordered)) - 1)], 3)


def latency_summary(values: list[float]) -> dict[str, float | int | None]:
    return {
        "n": len(values),
        "mean": round(sum(values) / len(values), 3) if values else None,
        "p50": nearest_rank(values, 0.50),
        "p95": nearest_rank(values, 0.95),
        "max": round(max(values), 3) if values else None,
    }


def _source_rank(row: dict[str, Any]) -> int | None:
    expected = set(row["expected_sources"])
    for retrieved in row["retrieved"]:
        if expected.intersection(retrieved.get("source_ids", [])):
            return int(retrieved["rank"])
    return None


def retrieval_metrics(rows: list[dict[str, Any]]) -> dict[str, Any]:
    relevant = [row for row in rows if row["answerable"]]
    negative = [row for row in rows if not row["answerable"]]

    def summarize(group: list[dict[str, Any]]) -> dict[str, Any]:
        answerable = [row for row in group if row["answerable"]]
        ranks = [_source_rank(row) for row in answerable]
        recalls = []
        for row in answerable:
            found = set().union(*(set(item.get("source_ids", [])) for item in row["retrieved"][:5]))
            expected = set(row["expected_sources"])
            recalls.append(len(found & expected) / len(expected))
        return {
            "answerable_turns": len(answerable),
            "hit_at_1": round(sum(rank == 1 for rank in ranks) / len(ranks), 4) if ranks else None,
            "hit_at_3": round(sum(rank is not None and rank <= 3 for rank in ranks) / len(ranks), 4)
            if ranks
            else None,
            "hit_at_5": round(sum(rank is not None and rank <= 5 for rank in ranks) / len(ranks), 4)
            if ranks
            else None,
            "mrr": round(sum(0 if rank is None else 1 / rank for rank in ranks) / len(ranks), 4)
            if ranks
            else None,
            "source_recall_at_5": round(sum(recalls) / len(recalls), 4) if recalls else None,
        }

    by_category = {
        category: summarize([row for row in rows if row["category"] == category])
        for category in dict.fromkeys(row["category"] for row in rows)
    }
    return {
        **summarize(relevant),
        "no_evidence_empty_retrieval_rate": round(
            sum(not row["retrieved"] for row in negative) / len(negative), 4
        )
        if negative
        else None,
        "by_category": by_category,
        "definitions": {
            "hit_at_k": (
                "1 when at least one expected semantic source identifier is in top K chunks"
            ),
            "mrr": "mean of 1/rank for the first relevant chunk; zero when absent",
            "source_recall_at_5": (
                "expected source identifiers found in top 5 / expected source count"
            ),
        },
    }


def run_offline(
    dataset_path: Path = DATASET, category: str | None = None
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    completed = subprocess.run(
        ["node", str(ROOT / "evals/rag/offline-retrieval.cjs"), str(dataset_path), category or ""],
        env={**os.environ, "COMPASS_EVAL_PYTHON": sys.executable},
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    rows = json.loads(completed.stdout)["results"]
    return rows, retrieval_metrics(rows)


def normalize(text: str) -> str:
    normalized = unicodedata.normalize("NFC", text).casefold()
    return " ".join(re.sub(r"[^\w\s.,%]", " ", normalized, flags=re.UNICODE).split())


def concept_present(answer: str, concept: dict[str, Any]) -> bool:
    haystack = normalize(answer)
    phrases = [concept["concept"], *concept.get("aliases", [])]
    return any(normalize(phrase) in haystack for phrase in phrases)


def _turn_specs(
    dataset: dict[str, Any],
) -> dict[tuple[str, int], tuple[dict[str, Any], dict[str, Any]]]:
    specs = {}
    for case in dataset["cases"]:
        for index, turn in enumerate(case.get("turns", [case])):
            specs[(case["id"], index)] = (case, turn)
    return specs


def generation_metrics(rows: list[dict[str, Any]], dataset: dict[str, Any]) -> dict[str, Any]:
    specs = _turn_specs(dataset)
    answerable_count = sum(row["answerable"] for row in rows)
    refusals = [row for row in rows if row["status"] == "abstained"]
    negative = [row for row in rows if not row["answerable"]]
    citation_required = [row for row in rows if row["answerable"]]
    citation_count = sum(len(row["citations"]) for row in citation_required)
    correct_citations = sum(
        sum(
            bool(set(item["source_ids"]) & set(row["expected_sources"]))
            and (
                "expected_pages" not in specs[(row["case_id"], row["turn_index"])][1]
                or item.get("page_number")
                in specs[(row["case_id"], row["turn_index"])][1]["expected_pages"]
            )
            for item in row["citations"]
        )
        for row in citation_required
    )
    for row in rows:
        case, turn = specs[(row["case_id"], row["turn_index"])]
        concepts = turn.get("required_concepts", [])
        forbidden = [*case.get("forbidden_concepts", []), *turn.get("forbidden_concepts", [])]
        row["required_concepts_met"] = all(
            concept_present(row["answer"], item) for item in concepts
        )
        row["unsupported_claim"] = any(
            normalize(item) in normalize(row["answer"]) for item in forbidden
        )
        row["citation_correct"] = (
            (
                bool(row["citations"])
                and all(
                    set(item["source_ids"]) & set(row["expected_sources"])
                    for item in row["citations"]
                )
                and set(row["expected_sources"])
                <= set().union(*(set(item["source_ids"]) for item in row["citations"]))
                and {item["chunk_id"] for item in row["citations"]}
                <= {item["chunk_id"] for item in row["retrieved"]}
            )
            if row["answerable"]
            else not row["citations"]
        )
        if "expected_pages" in turn:
            expected_pages = set(turn["expected_pages"])
            row["page_citation_correct"] = {
                item.get("page_number") for item in row["citations"]
            } == expected_pages and all(
                item["document_id"] == row["document_id"] for item in row["citations"]
            )
            row["citation_correct"] = row["citation_correct"] and row["page_citation_correct"]
        row["grounded"] = bool(
            row["answerable"]
            and row["status"] == "answered"
            and row["required_concepts_met"]
            and not row["unsupported_claim"]
            and row["citation_correct"]
        )
    by_category = {}
    for category in dict.fromkeys(row["category"] for row in rows):
        group = [row for row in rows if row["category"] == category]
        group_answerable = [row for row in group if row["answerable"]]
        group_negative = [row for row in group if not row["answerable"]]
        by_category[category] = {
            "turns": len(group),
            "grounded_answer_rate": round(
                sum(row["grounded"] for row in group_answerable) / len(group_answerable), 4
            )
            if group_answerable
            else None,
            "citation_correctness_rate": round(
                sum(row["citation_correct"] for row in group_answerable) / len(group_answerable),
                4,
            )
            if group_answerable
            else None,
            "refusal_recall": round(
                sum(row["status"] == "abstained" for row in group_negative) / len(group_negative),
                4,
            )
            if group_negative
            else None,
        }
    return {
        "grounded_answer_rate": round(sum(row["grounded"] for row in rows) / answerable_count, 4),
        "citation_precision": round(correct_citations / citation_count, 4)
        if citation_count
        else None,
        "citation_coverage": round(
            sum(row["citation_correct"] for row in citation_required) / len(citation_required), 4
        ),
        "citation_correctness_rate": round(
            sum(row["citation_correct"] for row in citation_required) / len(citation_required), 4
        ),
        "refusal_precision": round(
            sum(not row["answerable"] for row in refusals) / len(refusals), 4
        )
        if refusals
        else None,
        "refusal_recall": round(
            sum(row["status"] == "abstained" for row in negative) / len(negative), 4
        ),
        "unsupported_claim_rate": round(
            sum(row["unsupported_claim"] for row in rows) / len(rows), 4
        ),
        "provider_call_count": sum(row["provider_call_count"] for row in rows),
        "provider_error_rate": round(
            sum(row.get("provider_error", False) for row in rows) / len(rows), 4
        ),
        "no_evidence_provider_calls": sum(
            row["provider_call_count"] for row in negative if not row["retrieved"]
        ),
        "no_evidence_zero_retrieval_turns": sum(not row["retrieved"] for row in negative),
        "by_category": by_category,
        "methodology": (
            "Deterministic normalized alias matching for required concepts; "
            "forbidden-phrase checks for known unsupported claims; structural "
            "source/retrieval checks for citations. This is "
            "an approximate fixture-based evaluator, not semantic entailment or an LLM judge."
        ),
    }


def load_env_file(path: Path | None, env: dict[str, str]) -> None:
    if not path:
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if line and not line.startswith("#") and "=" in line:
            name, value = line.split("=", 1)
            env.setdefault(name.strip(), value.strip().strip("\"'"))


def wait_ready(url: str, processes: list[subprocess.Popen[Any]]) -> None:
    with httpx.Client(timeout=2) as client:
        for _ in range(180):
            try:
                if client.get(url).status_code < 500:
                    return
            except httpx.HTTPError:
                pass
            if any(process.poll() is not None for process in processes):
                raise RuntimeError("evaluation server exited before becoming ready")
            time.sleep(0.25)
    raise RuntimeError(f"evaluation server did not become ready: {url}")


def read_trace(path: Path, request_id: str) -> dict[str, Any]:
    for _ in range(40):
        if path.exists():
            for line in reversed(path.read_text(encoding="utf-8").splitlines()):
                row = json.loads(line)
                if row.get("request_id") == request_id:
                    return row
        time.sleep(0.05)
    raise RuntimeError(f"missing evaluation trace for request {request_id}")


def run_full(
    dataset: dict[str, Any],
    *,
    env_file: Path | None,
    web_port: int,
    api_port: int,
    log: Path,
    production: bool = False,
) -> list[dict[str, Any]]:
    env = os.environ.copy()
    load_env_file(env_file, env)
    if env.get("HAUI_COMPASS_LLM_ENABLED", "").lower() != "true" or not env.get("OPENAI_API_KEY"):
        raise RuntimeError(
            "full --live requires HAUI_COMPASS_LLM_ENABLED=true and OPENAI_API_KEY; "
            "no mock fallback is used"
        )
    service_key = secrets.token_urlsafe(32)
    traces = log.parent / "request-traces.jsonl"
    provider_traces = log.parent / "provider-traces.jsonl"
    storage = tempfile.TemporaryDirectory(prefix="compass-rag-eval-")
    env.update(
        {
            "COMPASS_SERVICE_KEY": service_key,
            "COMPASS_API_URL": f"http://127.0.0.1:{api_port}",
            "COMPASS_STORAGE_DIR": storage.name,
            "COMPASS_EVAL_TRACE_PATH": str(traces),
            "COMPASS_PROVIDER_TRACE_PATH": str(provider_traces),
        }
    )
    processes: list[subprocess.Popen[Any]] = []
    rows: list[dict[str, Any]] = []
    try:
        with log.open("w", encoding="utf-8") as server_log:
            processes.append(
                subprocess.Popen(
                    [
                        "uv",
                        "run",
                        "uvicorn",
                        "haui_compass.api.main:app",
                        "--host",
                        "127.0.0.1",
                        "--port",
                        str(api_port),
                    ],
                    cwd=ROOT / "apps/api",
                    env=env,
                    stdout=server_log,
                    stderr=server_log,
                    start_new_session=True,
                )
            )
            processes.append(
                subprocess.Popen(
                    ["npm", "run", "start" if production else "dev", "--", "--port", str(web_port)],
                    cwd=ROOT / "apps/web",
                    env=env,
                    stdout=server_log,
                    stderr=server_log,
                    start_new_session=True,
                )
            )
            wait_ready(f"http://127.0.0.1:{api_port}/openapi.json", processes)
            wait_ready(f"http://127.0.0.1:{web_port}", processes)
            origin = f"http://127.0.0.1:{web_port}"
            with httpx.Client(base_url=origin, headers={"Origin": origin}, timeout=70) as client:
                response = client.post(
                    "/api/auth/register",
                    json={
                        "username": f"rag_eval_{uuid.uuid4().hex[:12]}",
                        "name": "RAG evaluator",
                        "password": secrets.token_urlsafe(18),
                    },
                )
                response.raise_for_status()
                document_ids = {}
                paths = {row["key"]: ROOT / row["path"] for row in dataset["documents"]}
                for key, path in paths.items():
                    uploaded = client.post(
                        "/api/documents",
                        files={
                            "files": (
                                path.name,
                                path.read_bytes(),
                                "application/pdf" if path.suffix == ".pdf" else "text/markdown",
                            )
                        },
                    )
                    uploaded.raise_for_status()
                    document = uploaded.json()["documents"][0]
                    if document["ingestionStatus"] != "ready":
                        raise RuntimeError(f"ingestion not ready for {key}")
                    document_ids[key] = document["id"]
                for case in dataset["cases"]:
                    document_id = document_ids[case["document"]]
                    session_response = client.post(
                        f"/api/study-sets/{document_id}/chat/sessions", json={}
                    )
                    session_response.raise_for_status()
                    session_id = session_response.json()["session"]["id"]
                    for turn_index, turn in enumerate(case.get("turns", [case])):
                        request_id = str(uuid.uuid4())
                        response = client.post(
                            f"/api/chat/sessions/{session_id}/messages",
                            json={
                                "message": turn["question"],
                                "active_document_id": document_id,
                                "request_id": request_id,
                            },
                        )
                        message = response.json().get("message") or {
                            "status": "failed",
                            "content": "",
                            "citations": [],
                        }
                        trace = read_trace(traces, request_id)
                        provider_metadata: dict[str, Any] = {}
                        if provider_traces.exists():
                            for line in provider_traces.read_text().splitlines():
                                entry = json.loads(line)
                                if entry.get("request_id") == request_id:
                                    provider_metadata.update(entry)
                        citations = []
                        for citation in message["citations"]:
                            source_response = client.get(
                                f"/api/documents/{document_id}/chunks/{citation['chunk_id']}"
                            )
                            source_response.raise_for_status()
                            content = source_response.json()["chunk"]["content"]
                            citations.append(
                                {
                                    "chunk_id": citation["chunk_id"],
                                    "document_id": citation["document_id"],
                                    "heading": citation["heading"],
                                    "page_number": citation["page_number"],
                                    "source_ids": re.findall(r"\[SOURCE:([^\]]+)\]", content),
                                }
                            )
                        rows.append(
                            {
                                "case_id": case["id"],
                                "turn_index": turn_index,
                                "category": case["category"],
                                "document": case["document"],
                                "document_id": document_id,
                                "question": turn["question"],
                                "resolved_query": trace["resolved_query"],
                                "answerable": turn["answerable"],
                                "expected_sources": turn["expected_sources"],
                                "status": message["status"],
                                "http_status": response.status_code,
                                "provider_error": message["status"] == "failed",
                                "failure_reason": provider_metadata.get("failure_reason"),
                                "usage": provider_metadata.get("usage"),
                                "answer": message["content"],
                                "citations": citations,
                                "retrieved": trace["retrieved"],
                                "provider_call_count": trace["provider_call_count"],
                                "retrieval_ms": trace["retrieval_ms"],
                                "generation_ms": trace["generation_ms"],
                                "end_to_end_ms": trace["end_to_end_ms"],
                            }
                        )
                        (log.parent / "partial-results.json").write_text(
                            json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8"
                        )
                        print(f"{case['id']}:{turn_index + 1} {message['status']}", flush=True)
    finally:
        for process in reversed(processes):
            with suppress(ProcessLookupError):
                os.killpg(process.pid, signal.SIGTERM)
        for process in reversed(processes):
            try:
                process.wait(timeout=8)
            except subprocess.TimeoutExpired:
                process.kill()
        storage.cleanup()
    return rows


def git_sha() -> str:
    return subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=ROOT, check=True, capture_output=True, text=True
    ).stdout.strip()


def decision_signal(metrics: dict[str, Any]) -> dict[str, str]:
    if "paraphrased" not in metrics["by_category"]:
        return {
            "signal": "subset_only",
            "reason": "A category-only run does not select the production retrieval strategy.",
        }
    paraphrased = metrics["by_category"]["paraphrased"]["hit_at_3"]
    weak_categories = [
        category
        for category, values in metrics["by_category"].items()
        if values["answerable_turns"] >= 4
        and values["hit_at_3"] is not None
        and values["hit_at_3"] < 0.85
    ]
    if (
        metrics["hit_at_3"] < 0.9
        or (paraphrased is not None and paraphrased < 0.85)
        or weak_categories
    ):
        return {
            "signal": "evidence_supports_hybrid_experiment",
            "reason": (
                "Hit@3 is below a documented v1 evidence threshold: overall 0.90, "
                f"paraphrased 0.85, or category 0.85. Weak categories: {weak_categories}."
            ),
        }
    return {
        "signal": "lexical_adequate_on_v1_fixture",
        "reason": "Hit@3 meets the v1 fixture thresholds; this does not prove production adequacy.",
    }


def markdown_report(report: dict[str, Any]) -> str:
    retrieval = report["retrieval"]
    lines = [
        "# Compass RAG Evaluation v1",
        "",
        f"- Mode: `{report['metadata']['mode']}`",
        (
            f"- Dataset: `{report['metadata']['dataset_version']}` "
            f"({report['metadata']['case_count']} cases, "
            f"{report['metadata']['turn_count']} turns)"
        ),
        f"- Git commit: `{report['metadata']['git_commit']}`",
        f"- Decision signal: **{report['decision']['signal']}** — {report['decision']['reason']}",
        "",
        "## Retrieval",
        "",
        "| Metric | Value |",
        "|---|---:|",
        f"| Hit@1 | {retrieval['hit_at_1']:.1%} |",
        f"| Hit@3 | {retrieval['hit_at_3']:.1%} |",
        f"| Hit@5 | {retrieval['hit_at_5']:.1%} |",
        f"| MRR | {retrieval['mrr']:.3f} |",
        f"| Source recall@5 | {retrieval['source_recall_at_5']:.1%} |",
        (f"| No-evidence empty retrieval | {retrieval['no_evidence_empty_retrieval_rate']:.1%} |"),
        "",
        "### Hit@3 by category",
        "",
    ]
    for category, metrics in retrieval["by_category"].items():
        if metrics["hit_at_3"] is not None:
            lines.append(f"- `{category}`: {metrics['hit_at_3']:.1%}")
    misses = [row for row in report["cases"] if row["answerable"] and _source_rank(row) is None]
    lines += ["", "### Retrieval misses", ""]
    if misses:
        for row in misses:
            lines.append(
                f"- `{row['case_id']}` turn {row['turn_index'] + 1}: "
                f"{row['question']} (expected {row['expected_sources']})"
            )
    else:
        lines.append("- None")
    if generation := report.get("generation"):
        lines += [
            "",
            "## Grounded generation",
            "",
            f"- Grounded answer rate: {generation['grounded_answer_rate']:.1%}",
            f"- Citation precision: {generation['citation_precision']:.1%}",
            f"- Citation coverage: {generation['citation_coverage']:.1%}",
            (
                f"- Refusal precision / recall: {generation['refusal_precision']:.1%} / "
                f"{generation['refusal_recall']:.1%}"
            ),
            (
                "- Unsupported claim rate (deterministic heuristic): "
                f"{generation['unsupported_claim_rate']:.1%}"
            ),
            f"- Provider calls: {generation['provider_call_count']}",
        ]
    lines += [
        "",
        "## Latency (milliseconds)",
        "",
        "```json",
        json.dumps(report["latency_ms"], ensure_ascii=False, indent=2),
        "```",
        "",
        "Generated artifacts are measurements, not a committed quality baseline.",
    ]
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=("retrieval", "full"), default="retrieval")
    parser.add_argument("--live", action="store_true")
    parser.add_argument(
        "--production", action="store_true", help="use an existing Next production build"
    )
    parser.add_argument("--dataset", type=Path, default=DATASET)
    parser.add_argument("--category", choices=[*CATEGORIES, "pdf"])
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--env-file", type=Path)
    parser.add_argument("--web-port", type=int, default=3411)
    parser.add_argument("--api-port", type=int, default=8111)
    args = parser.parse_args()
    args.output = args.output.resolve()
    try:
        if args.mode == "full" and not args.live:
            raise RuntimeError("full mode requires explicit --live; no mock is substituted")
        if args.mode == "retrieval" and args.live:
            raise RuntimeError("--live is only valid with --mode full")
        dataset = load_dataset(args.dataset)
        if args.category:
            dataset["cases"] = [
                case for case in dataset["cases"] if case["category"] == args.category
            ]
            if not dataset["cases"]:
                raise RuntimeError("selected category has no cases")
            keys = {case["document"] for case in dataset["cases"]}
            dataset["documents"] = [
                document for document in dataset["documents"] if document["key"] in keys
            ]
        if (args.output / "summary.json").exists():
            raise RuntimeError(
                "output already contains a run; choose a new --output to preserve evidence"
            )
        args.output.mkdir(parents=True, exist_ok=True)
        if args.mode == "retrieval":
            rows, retrieval = run_offline(args.dataset, args.category)
        else:
            rows = run_full(
                dataset,
                env_file=args.env_file,
                web_port=args.web_port,
                api_port=args.api_port,
                log=args.output / "servers.log",
                production=args.production,
            )
            retrieval = retrieval_metrics(rows)
        metadata = {
            "timestamp": datetime.now(UTC).isoformat(),
            "git_commit": git_sha(),
            "dataset_version": dataset["version"],
            "dataset_sha256": hashlib.sha256(args.dataset.read_bytes()).hexdigest(),
            "case_count": len(dataset["cases"]),
            "turn_count": len(rows),
            "mode": args.mode,
            "live": args.live,
            "web_runtime": "production" if args.production else "development",
            "model": None,
            "retriever": {
                "strategy": "lexical",
                "implementation_sha256": hashlib.sha256(
                    (ROOT / "apps/web/src/lib/document-ranking.cjs").read_bytes()
                ).hexdigest(),
                "top_k": 6,
                "max_chunk_chars": 3000,
                "overlap_chars": 180,
            },
        }
        if args.live:
            report_env = os.environ.copy()
            load_env_file(args.env_file, report_env)
            metadata["model"] = report_env.get("HAUI_COMPASS_LLM_MODEL", "gpt-5-mini-2025-08-07")
            metadata["llm_base_url"] = report_env.get(
                "HAUI_COMPASS_LLM_BASE_URL", "https://api.openai.com/v1"
            )
            metadata["llm_timeout_seconds"] = float(
                report_env.get("HAUI_COMPASS_LLM_TIMEOUT_SECONDS", "8")
            )
        report = {
            "metadata": metadata,
            "retrieval": retrieval,
            "generation": generation_metrics(rows, dataset) if args.mode == "full" else None,
            "latency_ms": {
                "retrieval": latency_summary([row["retrieval_ms"] for row in rows]),
                "generation": latency_summary([row["generation_ms"] for row in rows])
                if args.mode == "full"
                else None,
                "end_to_end": latency_summary([row["end_to_end_ms"] for row in rows])
                if args.mode == "full"
                else None,
            },
            "token_usage": {
                "status": "captured" if any(row.get("usage") for row in rows) else "unavailable",
                **{
                    field: sum((row.get("usage") or {}).get(field, 0) for row in rows)
                    for field in ("input_tokens", "output_tokens", "total_tokens")
                },
                "responses_with_usage": sum(bool(row.get("usage")) for row in rows),
            },
            "decision": decision_signal(retrieval),
            "cases": rows,
        }
        (args.output / "summary.json").write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        (args.output / "report.md").write_text(markdown_report(report), encoding="utf-8")
        print(
            json.dumps(
                {key: value for key, value in report.items() if key != "cases"},
                ensure_ascii=False,
                indent=2,
            )
        )
        print(f"Reports: {args.output / 'summary.json'} and {args.output / 'report.md'}")
        return 0
    except (
        DatasetError,
        RuntimeError,
        OSError,
        subprocess.CalledProcessError,
        httpx.HTTPError,
    ) as exc:
        print(f"FAIL: {exc}", file=os.sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

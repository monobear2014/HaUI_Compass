"""Bounded RAG v1 evaluation. Offline is deterministic; live is explicit opt-in."""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api/src"))

from haui_compass.application.ports.knowledge import (
    GroundedAnswerInput,
    GroundedAnswerProvider,
    ProviderGroundedAnswer,
)
from haui_compass.application.use_cases.query_knowledge import (
    KnowledgeQueryRequest,
    QueryKnowledge,
)
from haui_compass.infrastructure.config.llm import LLMSettings
from haui_compass.infrastructure.llm.openai_responses import OpenAIResponsesAdapter
from haui_compass.infrastructure.retrieval.ingestion import ingest_manifest
from haui_compass.infrastructure.retrieval.lexical import LocalLexicalKnowledgeRetriever
from haui_compass.infrastructure.retrieval.template_answer import (
    TemplateGroundedAnswerProvider,
)

DATASET = ROOT / "evals/datasets/rag-v1.json"
OUTPUT = ROOT / "artifacts/evals/rag-v1"


class DatasetError(ValueError):
    pass


class AdversarialCitationProvider:
    def __init__(self, scenario: str) -> None:
        self._scenario = scenario

    async def answer(self, request: GroundedAnswerInput) -> ProviderGroundedAnswer:
        if self._scenario == "fabricated_handle":
            handles = ("c999",)
        elif self._scenario == "duplicate_handle":
            handles = ("c1", "c1")
        else:
            raise ValueError("unknown adversarial provider scenario")
        return ProviderGroundedAnswer(
            answer="Unsupported provider answer", citation_handles=handles
        )


@dataclass(frozen=True, slots=True)
class CaseResult:
    case_id: str
    status: str
    expected_status: str
    retrieval_hit: bool
    citation_valid: bool
    abstention_correct: bool
    scope_isolated: bool
    source_separated: bool
    provider_status: str
    latency_ms: float
    passed: bool


def load_dataset(path: Path = DATASET) -> list[dict[str, Any]]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise DatasetError(f"cannot load dataset: {exc}") from exc
    if (
        value.get("dataset_version") != "rag-v1"
        or value.get("public_or_fictional_only") is not True
    ):
        raise DatasetError("dataset must be rag-v1 and public_or_fictional_only")
    cases = value.get("cases")
    if not isinstance(cases, list) or not 20 <= len(cases) <= 30:
        raise DatasetError("dataset must contain 20 to 30 cases")
    ids = [case.get("id") for case in cases if isinstance(case, dict)]
    if len(ids) != len(cases) or len(ids) != len(set(ids)):
        raise DatasetError("case ids must be present and unique")
    for case in cases:
        if case.get("scope") not in {"institutional", "course"}:
            raise DatasetError(f"{case['id']}: invalid scope")
        if case.get("expected_status") not in {"answered", "abstained"}:
            raise DatasetError(f"{case['id']}: invalid expected_status")
    return cases


async def evaluate_case(
    case: dict[str, Any], *, live_provider: GroundedAnswerProvider | None
) -> CaseResult:
    chunks = ingest_manifest(ROOT / "data")
    scenario = case.get("provider_scenario")
    provider = AdversarialCitationProvider(scenario) if scenario else live_provider
    use_case = QueryKnowledge(
        retriever=LocalLexicalKnowledgeRetriever(chunks),
        template=TemplateGroundedAnswerProvider(),
        provider=provider,
    )
    started = time.perf_counter()
    result = await use_case.execute(
        KnowledgeQueryRequest(
            question=case["question"],
            scope=case["scope"],
            course_id=case.get("course_id"),
        )
    )
    latency_ms = (time.perf_counter() - started) * 1000
    expected_document = case.get("expected_document")
    retrieval_hit = expected_document is None or any(
        row.chunk.metadata.document_id == expected_document for row in result.retrieved
    )
    retrieved_ids = {row.chunk.metadata.chunk_id for row in result.retrieved}
    citation_ids = [item.chunk_id for item in result.citations]
    citation_valid = (
        len(citation_ids) == len(set(citation_ids))
        and set(citation_ids) <= retrieved_ids
        and (result.status == "abstained" or bool(citation_ids))
    )
    scope_isolated = all(
        row.chunk.metadata.scope == case["scope"]
        and (
            case["scope"] != "course"
            or row.chunk.metadata.course_id == case.get("course_id")
        )
        for row in result.retrieved
    )
    source_separated = all(
        item.source_type == case["expected_source_type"] for item in result.citations
    )
    abstention_correct = result.status == case["expected_status"]
    passed = all(
        (
            retrieval_hit,
            citation_valid,
            abstention_correct,
            scope_isolated,
            source_separated,
        )
    )
    return CaseResult(
        case_id=case["id"],
        status=result.status,
        expected_status=case["expected_status"],
        retrieval_hit=retrieval_hit,
        citation_valid=citation_valid,
        abstention_correct=abstention_correct,
        scope_isolated=scope_isolated,
        source_separated=source_separated,
        provider_status=(
            f"adversarial_{scenario}"
            if scenario
            else "live_ai"
            if result.source == "ai"
            else f"offline_template:{result.fallback_reason}"
        ),
        latency_ms=round(latency_ms, 3),
        passed=passed,
    )


async def run(mode: str) -> dict[str, Any]:
    cases = load_dataset()
    live_provider: GroundedAnswerProvider | None = None
    model = "offline-template"
    if mode == "live":
        settings = LLMSettings.from_env()
        if settings.unavailable_reason is not None:
            raise RuntimeError(
                "live mode requires HAUI_COMPASS_LLM_ENABLED=true and OPENAI_API_KEY"
            )
        live_provider = OpenAIResponsesAdapter(settings)
        model = settings.model
    results = [await evaluate_case(case, live_provider=live_provider) for case in cases]
    total = len(results)

    def rate(field: str) -> float:
        return round(sum(bool(getattr(row, field)) for row in results) / total, 4)

    return {
        "dataset_version": "rag-v1",
        "mode": mode,
        "model": model,
        "claim_boundary": "engineering contract baseline; not research-grade RAG quality",
        "total_cases": total,
        "passed_cases": sum(row.passed for row in results),
        "retrieval_hit_rate": rate("retrieval_hit"),
        "citation_validity": rate("citation_valid"),
        "abstention_correctness": rate("abstention_correct"),
        "scope_isolation": rate("scope_isolated"),
        "source_separation": rate("source_separated"),
        "provider_success": sum(row.provider_status == "live_ai" for row in results),
        "fallback_or_adversarial": sum(
            row.provider_status != "live_ai" for row in results
        ),
        "latency_ms": {
            "average": round(sum(row.latency_ms for row in results) / total, 3),
            "max": max(row.latency_ms for row in results),
        },
        "cases": [asdict(row) for row in results],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=("offline", "live"), default="offline")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    try:
        report = asyncio.run(run(args.mode))
    except (DatasetError, RuntimeError, ValueError) as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1
    output = args.output
    if output is not None:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["passed_cases"] == report["total_cases"] else 1


if __name__ == "__main__":
    raise SystemExit(main())

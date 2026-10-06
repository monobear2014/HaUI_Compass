#!/usr/bin/env python3
"""Versioned, fictional-data evaluation for the two current language capabilities.

Offline mode is the default and never uses the network. Live mode is opt-in with
``--live`` and records contract-validation evidence, not a model-quality claim.
"""

# ruff: noqa: E402, E501

from __future__ import annotations

import argparse
import asyncio
import json
import re
import subprocess
import sys
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta
from pathlib import Path
from statistics import median
from typing import Any, Protocol
from uuid import UUID

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api/src"))

from haui_compass.application.ports.explanation import (
    ExplanationText,
    RecommendationExplanationInput,
    RecommendationExplanationProvider,
)
from haui_compass.application.ports.lms import ExternalRef
from haui_compass.application.ports.task_decomposition import (
    ProviderTaskCandidate,
    TaskDecompositionInput,
    TaskDecompositionProvider,
)
from haui_compass.domain.assignments.assignment import Assignment, AssignmentId
from haui_compass.domain.courses.course import CourseId
from haui_compass.domain.recommendations.recommendation import (
    RankingDimension,
    Recommendation,
    RecommendationEvidence,
    RecommendationReasonCode,
)
from haui_compass.domain.risk.signal import (
    RiskEvidence,
    RiskLevel,
    RiskReasonCode,
    RiskSignal,
)
from haui_compass.domain.tasks.task import TaskId, TaskStatus
from haui_compass.infrastructure.config.llm import LLMSettings
from haui_compass.infrastructure.decomposition.template import (
    DeterministicTaskDecompositionProvider,
)
from haui_compass.infrastructure.explanation.template import (
    TemplateExplanationProvider,
)
from haui_compass.infrastructure.llm.openai_responses import (
    OpenAIResponsesAdapter,
)

DATASET = ROOT / "evals/datasets/llm-capabilities-v1.json"
OUTPUT = ROOT / "artifacts/evals/llm-capabilities-v1"
ACTION_WORDS = {
    "analyze",
    "build",
    "check",
    "clarify",
    "compare",
    "create",
    "design",
    "draft",
    "evaluate",
    "implement",
    "identify",
    "outline",
    "prepare",
    "review",
    "test",
    "write",
}
SUBMISSION_PHRASES = {"final answer", "complete solution", "submit this", "ready-to-submit"}


class DatasetError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class CaseResult:
    capability: str
    case_id: str
    model_identifier: str
    provider_status: str
    validation_passed: bool
    latency_ms: float
    failure_category: str | None
    checks: dict[str, bool]


class LanguageProvider(RecommendationExplanationProvider, TaskDecompositionProvider, Protocol):
    pass


def load_dataset(path: Path = DATASET) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise DatasetError(f"cannot load dataset: {exc}") from exc
    if not isinstance(value, dict) or value.get("dataset_version") != "llm-capabilities-v1":
        raise DatasetError("dataset_version must be llm-capabilities-v1")
    if value.get("fictional_only") is not True:
        raise DatasetError("dataset must explicitly declare fictional_only=true")
    decompositions = value.get("task_decomposition_cases")
    explanations = value.get("recommendation_explanation_cases")
    if not isinstance(decompositions, list) or not 15 <= len(decompositions) <= 30:
        raise DatasetError("task decomposition dataset must contain 15 to 30 cases")
    if not isinstance(explanations, list) or len(explanations) < 8:
        raise DatasetError("recommendation explanation dataset must contain at least 8 cases")
    ids: list[str] = []
    for case in [*decompositions, *explanations]:
        if not isinstance(case, dict) or not isinstance(case.get("id"), str):
            raise DatasetError("every case must be an object with a string id")
        ids.append(case["id"])
    if len(ids) != len(set(ids)):
        raise DatasetError("case ids must be unique")
    for case in decompositions:
        for field in ("kind", "assignment_title", "course_name", "deadline"):
            if not isinstance(case.get(field), str) or not case[field].strip():
                raise DatasetError(f"{case['id']}: {field} must be non-blank")
        _aware_datetime(case["deadline"], case["id"])
    valid_levels = {item.value for item in RiskLevel}
    valid_reasons = {item.value for item in RiskReasonCode}
    valid_dimensions = {item.value for item in RankingDimension}
    for case in explanations:
        if case.get("risk_level") not in valid_levels:
            raise DatasetError(f"{case['id']}: invalid risk_level")
        reasons = case.get("reason_codes")
        if not isinstance(reasons, list) or not reasons or not set(reasons) <= valid_reasons:
            raise DatasetError(f"{case['id']}: invalid reason_codes")
        if case.get("deciding_dimension") not in valid_dimensions:
            raise DatasetError(f"{case['id']}: invalid deciding_dimension")
        _aware_datetime(case.get("deadline"), case["id"])
        _aware_datetime(case.get("as_of"), case["id"])
    return value


def _aware_datetime(value: object, case_id: str) -> datetime:
    if not isinstance(value, str):
        raise DatasetError(f"{case_id}: expected an ISO datetime")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise DatasetError(f"{case_id}: invalid ISO datetime") from exc
    if parsed.utcoffset() is None:
        raise DatasetError(f"{case_id}: datetime must be timezone-aware")
    return parsed


def decomposition_input(case: dict[str, Any]) -> TaskDecompositionInput:
    return TaskDecompositionInput(
        assignment=ExternalRef("fictional-eval", case["id"]),
        assignment_title=case["assignment_title"],
        deadline=_aware_datetime(case["deadline"], case["id"]),
        course_name=case["course_name"],
        course_code=case.get("course_code"),
    )


def explanation_input(case: dict[str, Any]) -> RecommendationExplanationInput:
    index = int(case["id"].split("-")[-1])
    assignment_id = AssignmentId(UUID(int=10_000 + index))
    task_id = TaskId(UUID(int=20_000 + index))
    deadline = _aware_datetime(case["deadline"], case["id"])
    as_of = _aware_datetime(case["as_of"], case["id"])
    reasons = tuple(RiskReasonCode(value) for value in case["reason_codes"])

    def duration(field: str) -> timedelta | None:
        value = case[field]
        return None if value is None else timedelta(minutes=value)

    risk = RiskSignal(
        assignment_id=assignment_id,
        as_of=as_of,
        level=RiskLevel(case["risk_level"]),
        reason_codes=reasons,
        evidence=RiskEvidence(
            deadline=deadline,
            time_until_deadline=deadline - as_of,
            open_task_count=1,
            remaining_effort=duration("remaining_effort_minutes"),
            available_capacity=duration("available_capacity_minutes"),
            slack=duration("slack_minutes"),
            slack_ratio=None,
        ),
        engine_version=1,
    )
    recommendation = Recommendation(
        task_id=task_id,
        assignment_id=assignment_id,
        as_of=as_of,
        reason_codes=(RecommendationReasonCode.ONLY_ACTIONABLE_TASK,),
        evidence=RecommendationEvidence(
            deadline=deadline,
            time_until_deadline=deadline - as_of,
            estimated_duration=timedelta(minutes=case["task_estimate_minutes"]),
            task_status=TaskStatus.NOT_STARTED,
            risk_level=risk.level,
            risk_reason_codes=reasons,
            risk_engine_version=1,
            eligible_candidate_count=1,
            deciding_dimension=RankingDimension(case["deciding_dimension"]),
        ),
        engine_version=1,
    )
    assignment = Assignment(
        id=assignment_id,
        course_id=CourseId(UUID(int=1)),
        title=case["assignment_title"],
        deadline=deadline,
    )
    return RecommendationExplanationInput(recommendation, assignment, risk)


def validate_candidates(
    case: dict[str, Any], candidates: tuple[ProviderTaskCandidate, ...]
) -> dict[str, bool]:
    titles = [item.title.strip() for item in candidates]
    combined = " ".join(
        [*(item.title for item in candidates), *(item.rationale or "" for item in candidates)]
    ).casefold()
    deadline_tokens = set(re.findall(r"\d{4}|\d{1,2}/\d{1,2}", case["deadline"]))
    output_date_tokens = set(re.findall(r"\d{4}|\d{1,2}/\d{1,2}", combined))
    return {
        "candidate_count_1_to_5": 1 <= len(candidates) <= 5,
        "non_blank_actionable_title": bool(titles)
        and all(
            title and title.split(maxsplit=1)[0].casefold() in ACTION_WORDS for title in titles
        ),
        "title_and_estimate_bounds": all(
            3 <= len(item.title.strip()) <= 120
            and isinstance(item.estimated_duration_minutes, int)
            and not isinstance(item.estimated_duration_minutes, bool)
            and 15 <= item.estimated_duration_minutes <= 480
            and (item.rationale is None or 1 <= len(item.rationale.strip()) <= 240)
            for item in candidates
        ),
        "unique_titles": len({title.casefold() for title in titles}) == len(titles),
        "no_obvious_invented_date_or_course_fact": output_date_tokens <= deadline_tokens,
        "no_obvious_submission_content": not any(term in combined for term in SUBMISSION_PHRASES),
    }


def validate_explanation(
    case: dict[str, Any], facts: RecommendationExplanationInput, output: ExplanationText
) -> dict[str, bool]:
    text = output.text.strip()
    lower = text.casefold()
    numeric = {abs(float(value)) for value in re.findall(r"(?<![\w-])-?\d+(?:\.\d+)?", text)}
    allowed = {case["task_estimate_minutes"]}
    allowed.update(
        abs(value)
        for value in (
            case["remaining_effort_minutes"],
            case["available_capacity_minutes"],
            case["slack_minutes"],
        )
        if value is not None
    )
    reason_present = all(
        any(token in lower for token in _reason_tokens(RiskReasonCode(reason)))
        for reason in case["reason_codes"]
    )
    other_levels = {"low", "medium", "high", "unknown"} - {case["risk_level"]}
    return {
        "text_only_cannot_mutate_recommendation": facts.recommendation.task_id
        == TaskId(UUID(int=20_000 + int(case["id"].split("-")[-1]))),
        "bounded_non_blank_output": 1 <= len(text) <= 2000,
        "risk_level_not_contradicted": case["risk_level"] in lower
        and not any(
            f"rủi ro {level}" in lower or f"risk {level}" in lower for level in other_levels
        ),
        "reason_semantics_present": reason_present,
        "no_invented_numeric_evidence": numeric <= allowed,
    }


def _reason_tokens(reason: RiskReasonCode) -> tuple[str, ...]:
    mapping = {
        RiskReasonCode.SUFFICIENT_SLACK: ("dự phòng", "sufficient"),
        RiskReasonCode.LOW_SLACK: ("dự phòng thấp", "low slack"),
        RiskReasonCode.EFFORT_EXCEEDS_CAPACITY: ("vượt", "exceeds"),
        RiskReasonCode.DEADLINE_PASSED: ("đã qua", "passed"),
        RiskReasonCode.NO_CAPACITY_BEFORE_DEADLINE: ("không có thời gian", "no capacity"),
        RiskReasonCode.MISSING_CAPACITY: ("chưa có dữ liệu capacity", "missing capacity"),
    }
    return mapping.get(reason, (reason.value.replace("_", " "),))


async def evaluate(
    dataset: dict[str, Any],
    provider: LanguageProvider,
    *,
    model_identifier: str,
    live: bool,
) -> list[CaseResult]:
    results: list[CaseResult] = []
    fallback_decomposition = DeterministicTaskDecompositionProvider()
    fallback_explanation = TemplateExplanationProvider()
    for case in dataset["task_decomposition_cases"]:
        started = time.perf_counter()
        status = "provider_success" if live else "offline_fallback"
        failure: str | None = None
        try:
            output = await provider.decompose(decomposition_input(case))
        except TimeoutError:
            failure, status = "timeout", "fallback"
            output = await fallback_decomposition.decompose(decomposition_input(case))
        except Exception:
            failure, status = "provider_error", "fallback"
            output = await fallback_decomposition.decompose(decomposition_input(case))
        checks = validate_candidates(case, output)
        if not all(checks.values()) and failure is None:
            failure, status = "invalid_output", "fallback"
            output = await fallback_decomposition.decompose(decomposition_input(case))
            checks = validate_candidates(case, output)
        results.append(
            CaseResult(
                "task_decomposition",
                case["id"],
                model_identifier,
                status,
                all(checks.values()),
                round((time.perf_counter() - started) * 1000, 3),
                failure,
                checks,
            )
        )
    for case in dataset["recommendation_explanation_cases"]:
        facts = explanation_input(case)
        started = time.perf_counter()
        status = "provider_success" if live else "offline_fallback"
        failure = None
        try:
            output = await provider.explain(facts)
        except TimeoutError:
            failure, status = "timeout", "fallback"
            output = await fallback_explanation.explain(facts)
        except Exception:
            failure, status = "provider_error", "fallback"
            output = await fallback_explanation.explain(facts)
        checks = validate_explanation(case, facts, output)
        if not all(checks.values()) and failure is None:
            failure, status = "invalid_output", "fallback"
            output = await fallback_explanation.explain(facts)
            checks = validate_explanation(case, facts, output)
        results.append(
            CaseResult(
                "recommendation_explanation",
                case["id"],
                model_identifier,
                status,
                all(checks.values()),
                round((time.perf_counter() - started) * 1000, 3),
                failure,
                checks,
            )
        )
    return results


def write_summary(
    output: Path, dataset: dict[str, Any], results: list[CaseResult], *, mode: str, live_status: str
) -> dict[str, Any]:
    output.mkdir(parents=True, exist_ok=True)
    latencies = [item.latency_ms for item in results]
    summary = {
        "evaluation_version": "llm-capabilities-v1",
        "dataset_version": dataset["dataset_version"],
        "fictional_only": True,
        "mode": mode,
        "live_status": live_status,
        "git_commit": subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True, capture_output=True, check=True
        ).stdout.strip(),
        "limitations": [
            "Automated checks are contract and heuristic checks, not scientific proof of semantic quality.",
            "Manual rubric was not scored by this runner.",
            "A small fictional sample cannot establish general model quality or student outcomes.",
        ],
        "totals": {
            "cases": len(results),
            "passed": sum(item.validation_passed for item in results),
            "failed": sum(not item.validation_passed for item in results),
            "fallback_count": sum(
                item.provider_status in {"fallback", "offline_fallback"} for item in results
            ),
        },
        "latency_ms": {
            "min": min(latencies) if latencies else None,
            "median": round(median(latencies), 3) if latencies else None,
            "max": max(latencies) if latencies else None,
        },
        "results": [asdict(item) for item in results],
    }
    (output / "summary.json").write_text(
        json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return summary


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", type=Path, default=DATASET)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument(
        "--live", action="store_true", help="explicitly enable external provider calls"
    )
    args = parser.parse_args()
    try:
        dataset = load_dataset(args.dataset)
    except DatasetError as exc:
        parser.error(str(exc))
    if args.live:
        try:
            settings = LLMSettings.from_env()
        except ValueError as exc:
            parser.error(f"invalid LLM configuration: {exc}")
        if settings.unavailable_reason is not None:
            summary = write_summary(args.output, dataset, [], mode="live", live_status="NOT_RUN")
            print(json.dumps(summary["totals"], sort_keys=True))
            print(f"Live evaluation NOT RUN: {settings.unavailable_reason}")
            return 0
        provider: LanguageProvider = OpenAIResponsesAdapter(settings)
        model = settings.model
        live_status = "RUN"
    else:

        class OfflineProvider(DeterministicTaskDecompositionProvider, TemplateExplanationProvider):
            pass

        provider = OfflineProvider()
        model = "deterministic-template-v1"
        live_status = "NOT_REQUESTED"
    results = asyncio.run(evaluate(dataset, provider, model_identifier=model, live=args.live))
    summary = write_summary(
        args.output,
        dataset,
        results,
        mode="live" if args.live else "offline",
        live_status=live_status,
    )
    print(json.dumps(summary["totals"], sort_keys=True))
    return 0 if summary["totals"]["failed"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())

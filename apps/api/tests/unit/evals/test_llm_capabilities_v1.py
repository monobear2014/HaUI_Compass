"""Schema and offline-runner evidence for the fictional LLM evaluation."""

import asyncio
import importlib.util
import json
import sys
from pathlib import Path

import pytest

from haui_compass.application.ports.task_decomposition import (
    ProviderTaskCandidate,
    TaskDecompositionInput,
)
from haui_compass.infrastructure.decomposition.template import (
    DeterministicTaskDecompositionProvider,
)
from haui_compass.infrastructure.explanation.template import TemplateExplanationProvider

ROOT = Path(__file__).resolve().parents[5]
SPEC = importlib.util.spec_from_file_location(
    "llm_capabilities_v1", ROOT / "evals/llm_capabilities_v1.py"
)
assert SPEC and SPEC.loader
EVAL = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = EVAL
SPEC.loader.exec_module(EVAL)


def test_dataset_is_versioned_fictional_and_covers_required_case_families() -> None:
    dataset = EVAL.load_dataset()

    assert dataset["fictional_only"] is True
    assert len(dataset["task_decomposition_cases"]) == 20
    assert {
        "programming_assignment",
        "database_project",
        "report",
        "research_task",
        "ml_coursework",
        "presentation",
        "team_project",
        "ambiguous_safe",
        "short_description",
    } <= {case["kind"] for case in dataset["task_decomposition_cases"]}
    assert {case["label"] for case in dataset["recommendation_explanation_cases"]} == {
        "low_risk",
        "medium_risk",
        "high_risk",
        "deadline_passed",
        "no_capacity",
        "effort_exceeds_capacity",
        "low_slack",
        "missing_capacity",
    }


def test_offline_runner_is_reproducible_and_passes_contract_checks(tmp_path: Path) -> None:
    class OfflineProvider(DeterministicTaskDecompositionProvider, TemplateExplanationProvider):
        pass

    dataset = EVAL.load_dataset()
    first = asyncio.run(
        EVAL.evaluate(
            dataset,
            OfflineProvider(),
            model_identifier="deterministic-template-v1",
            live=False,
        )
    )
    second = asyncio.run(
        EVAL.evaluate(
            dataset,
            OfflineProvider(),
            model_identifier="deterministic-template-v1",
            live=False,
        )
    )

    assert len(first) == 28
    assert all(result.validation_passed for result in first)
    assert [result.checks for result in first] == [result.checks for result in second]
    assert all(result.provider_status == "offline_fallback" for result in first)
    summary = EVAL.write_summary(
        tmp_path, dataset, first, mode="offline", live_status="NOT_REQUESTED"
    )
    assert summary["totals"] == {
        "cases": 28,
        "passed": 28,
        "failed": 0,
        "fallback_count": 28,
    }
    persisted = json.loads((tmp_path / "summary.json").read_text())
    assert persisted["fictional_only"] is True
    assert "api_key" not in json.dumps(persisted).casefold()


def test_invalid_provider_output_is_recorded_and_replaced_by_deterministic_fallback() -> None:
    class InvalidProvider(DeterministicTaskDecompositionProvider, TemplateExplanationProvider):
        async def decompose(
            self, context: TaskDecompositionInput
        ) -> tuple[ProviderTaskCandidate, ...]:
            return (
                ProviderTaskCandidate(
                    title="Complete solution for the graded assignment",
                    estimated_duration_minutes=5,
                    rationale="ready-to-submit",
                ),
            )

    results = asyncio.run(
        EVAL.evaluate(
            EVAL.load_dataset(),
            InvalidProvider(),
            model_identifier="invalid-test-provider",
            live=True,
        )
    )

    decomposition = [item for item in results if item.capability == "task_decomposition"]
    assert all(item.provider_status == "fallback" for item in decomposition)
    assert all(item.failure_category == "invalid_output" for item in decomposition)
    assert all(item.validation_passed for item in decomposition)


@pytest.mark.parametrize(
    "mutation, message",
    [
        (lambda value: value.update({"fictional_only": False}), "fictional_only"),
        (lambda value: value.update({"dataset_version": "wrong"}), "dataset_version"),
        (
            lambda value: value["task_decomposition_cases"].append(
                dict(value["task_decomposition_cases"][0])
            ),
            "case ids",
        ),
        (
            lambda value: value["recommendation_explanation_cases"][0].update(
                {"risk_level": "critical"}
            ),
            "risk_level",
        ),
    ],
)
def test_invalid_dataset_is_rejected(tmp_path: Path, mutation, message: str) -> None:  # type: ignore[no-untyped-def]
    value = json.loads(EVAL.DATASET.read_text())
    mutation(value)
    path = tmp_path / "invalid.json"
    path.write_text(json.dumps(value))

    with pytest.raises(EVAL.DatasetError, match=message):
        EVAL.load_dataset(path)

import asyncio
from dataclasses import replace
from datetime import timedelta
from typing import cast

import pytest

from haui_compass.api.demo import build_demo_container
from haui_compass.application.ports.explanation import (
    ExplanationText,
    RecommendationExplanationInput,
)
from haui_compass.application.use_cases.daily_recommendation import (
    AssignmentCapacity,
    DailyRecommendationResult,
)
from haui_compass.application.use_cases.explain_recommendation import (
    ExplainRecommendation,
    explanation_input,
)
from haui_compass.application.use_cases.get_daily_recommendation import (
    GetDailyRecommendationRequest,
)
from haui_compass.domain.recommendations.recommendation import (
    NoRecommendation,
    NoRecommendationReason,
)
from haui_compass.infrastructure.demo.scenarios import ScenarioId
from haui_compass.infrastructure.explanation.template import TemplateExplanationProvider


def decision() -> DailyRecommendationResult:
    container, scenario = build_demo_container(ScenarioId.CRUNCH)
    return container.get_daily_recommendation.execute(
        GetDailyRecommendationRequest(
            student=scenario.student,
            available_capacity=timedelta(minutes=180),
            assignment_capacities=tuple(
                AssignmentCapacity(
                    assignment_id=task.assignment_id,
                    available_until_deadline=timedelta(minutes=capacity),
                )
                for task, capacity in zip(scenario.tasks, (60, 120, 180, 180), strict=True)
            ),
        )
    )


def test_mapping_is_only_immutable_engine_output_and_template_is_grounded() -> None:
    result = decision()
    facts = explanation_input(result)
    assert facts is not None
    assert facts.recommendation is result.recommendation
    assert facts.risk is result.assignment_risks[0].risk
    assert facts.assignment is result.assignment_risks[0].assignment
    service = ExplainRecommendation(template=TemplateExplanationProvider())
    output = asyncio.run(service.execute(result))
    assert output is not None
    assert output.source == "template"
    assert "Database Schema" in output.text and "HIGH" in output.text
    assert "150 phút" in output.text and "60 phút" in output.text
    assert "vượt" in output.text
    assert output == asyncio.run(service.execute(result))


class FakeProvider:
    def __init__(self, mode: str) -> None:
        self.mode = mode
        self.input: RecommendationExplanationInput | None = None

    async def explain(self, facts: RecommendationExplanationInput) -> ExplanationText:
        self.input = facts
        if self.mode == "provider_error":
            raise RuntimeError("simulated outage or missing credential")
        if self.mode == "timeout":
            await asyncio.sleep(10)
        if self.mode == "invalid_output":
            return ExplanationText("  ")
        if self.mode == "oversized":
            return ExplanationText("x" * 2001)
        if self.mode == "wrong_type":
            return cast(ExplanationText, {"risk_level": "low"})
        return await TemplateExplanationProvider().explain(facts)


@pytest.mark.parametrize(
    "mode", ["provider_error", "timeout", "invalid_output", "oversized", "wrong_type", "ok"]
)
def test_provider_boundary_falls_back_without_modifying_the_decision(mode: str) -> None:
    result = decision()
    before = repr(result)
    provider = FakeProvider(mode)
    service = ExplainRecommendation(
        template=TemplateExplanationProvider(), provider=provider, timeout_seconds=0.01
    )
    output = asyncio.run(service.execute(result))
    assert output is not None
    assert repr(result) == before
    assert provider.input == explanation_input(result)
    assert "HIGH" in output.text and "150 phút" in output.text
    assert output.source == ("ai" if mode == "ok" else "template")
    expected = "invalid_output" if mode in {"oversized", "wrong_type"} else mode
    assert output.fallback_reason == (None if mode == "ok" else expected)


def test_no_recommendation_does_not_call_provider_or_fabricate_text() -> None:
    result = decision()
    result = replace(
        result,
        recommendation=NoRecommendation(
            as_of=result.as_of,
            reason=NoRecommendationReason.NO_ACTIONABLE_TASKS,
            engine_version=1,
        ),
    )
    provider = FakeProvider("provider_error")
    service = ExplainRecommendation(template=TemplateExplanationProvider(), provider=provider)
    assert asyncio.run(service.execute(result)) is None
    assert provider.input is None

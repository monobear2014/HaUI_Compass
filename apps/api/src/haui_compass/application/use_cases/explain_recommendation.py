"""Attach prose after decision computation. Providers cannot return business decisions."""

import asyncio
import logging
import re
from typing import Literal

from haui_compass.application.ports.explanation import (
    ExplanationText,
    RecommendationExplanation,
    RecommendationExplanationInput,
    RecommendationExplanationProvider,
)
from haui_compass.application.ports.llm import InvalidLLMOutputError
from haui_compass.application.use_cases.daily_recommendation import DailyRecommendationResult
from haui_compass.domain.recommendations.recommendation import NoRecommendation

logger = logging.getLogger(__name__)

_PRESENTATION_LEAK = re.compile(
    r"(?:recommended_task_id|recommendation_reason_codes|risk_reason_codes|"
    r"deciding_dimension|risk_level|available_capacity_minutes|"
    r"remaining_effort_minutes|slack_minutes|task_estimate_minutes|"
    r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b|"
    r"\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})",
    re.IGNORECASE,
)


def _is_student_facing_explanation(text: str) -> bool:
    """Reject serialized provider input before it reaches the presentation layer."""
    return not _PRESENTATION_LEAK.search(text)


def explanation_input(result: DailyRecommendationResult) -> RecommendationExplanationInput | None:
    rec = result.recommendation
    if isinstance(rec, NoRecommendation):
        return None
    assignment_risk = next(
        x for x in result.assignment_risks if x.assignment.id == rec.assignment_id
    )
    return RecommendationExplanationInput(rec, assignment_risk.assignment, assignment_risk.risk)


class ExplainRecommendation:
    def __init__(
        self,
        *,
        template: RecommendationExplanationProvider,
        provider: RecommendationExplanationProvider | None = None,
        timeout_seconds: float = 1.0,
        unavailable_reason: Literal["not_configured", "disabled", "missing_credential"] = (
            "not_configured"
        ),
    ) -> None:
        if timeout_seconds <= 0:
            raise ValueError("explanation timeout must be positive")
        self._template = template
        self._provider = provider
        self._timeout = timeout_seconds
        self._unavailable_reason = unavailable_reason

    async def execute(self, result: DailyRecommendationResult) -> RecommendationExplanation | None:
        facts = explanation_input(result)
        if facts is None:
            return None
        reason: Literal[
            "not_configured",
            "disabled",
            "missing_credential",
            "timeout",
            "provider_error",
            "invalid_output",
        ]
        reason = self._unavailable_reason
        if self._provider is not None:
            try:
                output = await asyncio.wait_for(self._provider.explain(facts), self._timeout)
                if (
                    isinstance(output, ExplanationText)
                    and isinstance(output.text, str)
                    and 1 <= len(output.text.strip()) <= 2000
                    and _is_student_facing_explanation(output.text)
                ):
                    logger.info("llm_explanation provider_success")
                    return RecommendationExplanation(output.text.strip(), "ai", None)
                reason = "invalid_output"
            except TimeoutError:
                reason = "timeout"
            except InvalidLLMOutputError:
                reason = "invalid_output"
            except Exception:
                # Provider failures must not turn a valid deterministic decision into an HTTP error.
                reason = "provider_error"
        logger.info("llm_explanation fallback reason=%s", reason)
        fallback = await self._template.explain(facts)
        return RecommendationExplanation(fallback.text, "template", reason)

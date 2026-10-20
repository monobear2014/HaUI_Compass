"""Attach optional AI reflection support to a deterministic weekly review, with fallback."""

import asyncio
import logging
import re
from typing import Literal

from haui_compass.application.ports.llm import InvalidLLMOutputError
from haui_compass.application.ports.reflection_coach import (
    CoachText,
    ReflectionCoaching,
    ReflectionCoachInput,
    ReflectionCoachProvider,
)
from haui_compass.application.use_cases.weekly_cycle import DeadlineState, WeeklyReview

logger = logging.getLogger(__name__)

_LEAK = re.compile(
    r"(?:\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b|"
    r"\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}|planned_minutes|actual_minutes|weaknesses|strengths|"
    r"missed_sessions|deadline_missed|underestimated|low_follow_through|no_activity|"
    r"completed_tasks|deadlines_met|consistent_sessions|accurate_estimates)",
    re.IGNORECASE,
)


def coach_input(review: WeeklyReview) -> ReflectionCoachInput:
    return ReflectionCoachInput(
        goal_text=review.goal.goal_text if review.goal else "",
        planned_minutes=int(review.planned.total_seconds() // 60),
        actual_minutes=int(review.actual.total_seconds() // 60),
        completed_tasks=tuple(r.task.title for r in review.tasks if r.completed_this_period),
        open_tasks=tuple(r.task.title for r in review.tasks if r.task.status.value != "completed"),
        missed_tasks=tuple(r.task.title for r in review.tasks if r.missed),
        deadlines_missed=tuple(
            d.assignment.title for d in review.deadlines if d.state is DeadlineState.MISSED
        ),
        deadlines_upcoming=tuple(
            d.assignment.title for d in review.deadlines if d.state is DeadlineState.UPCOMING
        ),
        strengths=tuple(code.value for code in review.strengths),
        weaknesses=tuple(code.value for code in review.weaknesses),
    )


def _valid(output: object) -> bool:
    if not isinstance(output, CoachText) or not isinstance(output.summary, str):
        return False
    texts = [output.summary, *output.questions]
    return (
        1 <= len(output.summary.strip()) <= 1200
        and 1 <= len(output.questions) <= 3
        and all(isinstance(q, str) and 1 <= len(q.strip()) <= 300 for q in output.questions)
        and not any(_LEAK.search(text) for text in texts)
    )


class CoachWeeklyReflection:
    def __init__(
        self,
        *,
        template: ReflectionCoachProvider,
        provider: ReflectionCoachProvider | None = None,
        timeout_seconds: float = 2.0,
        unavailable_reason: Literal["not_configured", "disabled", "missing_credential"] = (
            "not_configured"
        ),
    ) -> None:
        self._template = template
        self._provider = provider
        self._timeout = timeout_seconds
        self._unavailable_reason = unavailable_reason

    async def execute(self, review: WeeklyReview) -> ReflectionCoaching:
        facts = coach_input(review)
        reason: Literal[
            "not_configured",
            "disabled",
            "missing_credential",
            "timeout",
            "provider_error",
            "invalid_output",
        ] = self._unavailable_reason
        if self._provider is not None:
            try:
                output = await asyncio.wait_for(self._provider.coach(facts), self._timeout)
                if _valid(output):
                    logger.info("llm_reflection_coach provider_success")
                    return ReflectionCoaching(
                        output.summary.strip(),
                        tuple(q.strip() for q in output.questions),
                        "ai",
                        None,
                    )
                reason = "invalid_output"
            except TimeoutError:
                reason = "timeout"
            except InvalidLLMOutputError:
                reason = "invalid_output"
            except Exception:
                reason = "provider_error"
        logger.info("llm_reflection_coach fallback reason=%s", reason)
        fallback = await self._template.coach(facts)
        return ReflectionCoaching(fallback.summary, fallback.questions, "template", reason)

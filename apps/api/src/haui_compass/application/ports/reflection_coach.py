"""Presentation-only weekly reflection support: deterministic review facts in, prose out."""

from dataclasses import dataclass
from typing import Literal, Protocol


@dataclass(frozen=True, slots=True)
class ReflectionCoachInput:
    """Only titles, counts and rule codes; never private conversation content or identifiers."""

    goal_text: str
    planned_minutes: int
    actual_minutes: int
    completed_tasks: tuple[str, ...]
    open_tasks: tuple[str, ...]
    missed_tasks: tuple[str, ...]
    deadlines_missed: tuple[str, ...]
    deadlines_upcoming: tuple[str, ...]
    strengths: tuple[str, ...]
    weaknesses: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class CoachText:
    summary: str
    questions: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class ReflectionCoaching:
    summary: str
    questions: tuple[str, ...]
    source: Literal["template", "ai"]
    fallback_reason: (
        Literal[
            "not_configured",
            "disabled",
            "missing_credential",
            "timeout",
            "provider_error",
            "invalid_output",
        ]
        | None
    )


class ReflectionCoachProvider(Protocol):
    async def coach(self, facts: ReflectionCoachInput) -> CoachText:
        """Summarize supplied facts and ask reflective questions; never add new facts."""
        ...

"""Presentation-only provider: immutable engine outputs in, prose out."""

from dataclasses import dataclass
from typing import Literal, Protocol

from haui_compass.domain.assignments.assignment import Assignment
from haui_compass.domain.recommendations.recommendation import Recommendation
from haui_compass.domain.risk.signal import RiskSignal


@dataclass(frozen=True, slots=True)
class RecommendationExplanationInput:
    recommendation: Recommendation
    assignment: Assignment
    risk: RiskSignal


@dataclass(frozen=True, slots=True)
class ExplanationText:
    text: str


@dataclass(frozen=True, slots=True)
class RecommendationExplanation:
    text: str
    source: Literal["template", "ai"]
    fallback_reason: Literal["not_configured", "timeout", "provider_error", "invalid_output"] | None


class RecommendationExplanationProvider(Protocol):
    async def explain(self, facts: RecommendationExplanationInput) -> ExplanationText:
        """Only verbalize supplied facts. Async I/O must cooperate with cancellation."""
        ...

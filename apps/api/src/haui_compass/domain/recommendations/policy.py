"""RecommendationPolicy: the named, versioned choices behind Next Best Action v0.

There are deliberately no numeric weights: ranking is an ordered comparison (see
``engines.next_best_action``), so the only policy value is how to treat risk we could not assess.
UNVALIDATED MVP HEURISTIC: this is an initial engineering choice, not derived from HaUI data.
"""

from dataclasses import dataclass

from haui_compass.domain.risk.signal import RiskLevel
from haui_compass.domain.shared.errors import DomainValidationError


@dataclass(frozen=True, slots=True, kw_only=True)
class RecommendationPolicy:
    """``engine_version`` identifies the ranking rules that produced a result.

    Bump it whenever the ranking semantics change (the order of the comparison dimensions, or this
    policy's values), and never reuse a version for different behaviour.

    ``unknown_risk_treated_as`` is the risk tier used *for ordering only* when an assignment's risk
    is ``UNKNOWN`` (not enough evidence to assess it). It must be a real level: unknown risk is
    never ranked as "no evidence, so lowest". The recommendation still reports the risk as
    ``UNKNOWN``.
    """

    engine_version: int
    unknown_risk_treated_as: RiskLevel

    def __post_init__(self) -> None:
        if self.engine_version < 1:
            raise DomainValidationError("RecommendationPolicy.engine_version must be at least 1")
        if self.unknown_risk_treated_as.severity is None:
            raise DomainValidationError(
                "RecommendationPolicy.unknown_risk_treated_as must be LOW, MEDIUM or HIGH"
            )


# Initial policy: unassessed risk is ordered like MEDIUM: worth attention, never above known HIGH
# risk, and never treated as safe. UNVALIDATED.
DEFAULT_RECOMMENDATION_POLICY = RecommendationPolicy(
    engine_version=1, unknown_risk_treated_as=RiskLevel.MEDIUM
)

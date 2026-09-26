"""RiskPolicy: the named, versioned thresholds behind Risk v0.

UNVALIDATED MVP HEURISTICS. The values below are an initial engineering policy chosen for
explainability. They are not calibrated against any HaUI student data and must not be presented as
predictions until they have been evaluated (PROJECT.md, *Risk Engine* and *Evaluation Strategy*).
"""

from dataclasses import dataclass
from fractions import Fraction

from haui_compass.domain.shared.errors import DomainValidationError


@dataclass(frozen=True, slots=True, kw_only=True)
class RiskPolicy:
    """Thresholds for Risk v0.

    ``engine_version`` identifies the rule set (logic *and* thresholds) that produced a signal.
    Bump it whenever either changes, and never reuse a version for different thresholds, so that
    later evaluation can tell Risk v1 from Risk v2.

    ``low_slack_ratio`` is spare capacity expressed as a share of the remaining effort. Work that
    fits but leaves less spare capacity than this is reported as tightly constrained. It is an exact
    ``Fraction`` so boundary cases are decided without floating-point rounding.
    """

    engine_version: int
    low_slack_ratio: Fraction

    def __post_init__(self) -> None:
        if self.engine_version < 1:
            raise DomainValidationError("RiskPolicy.engine_version must be at least 1")
        if self.low_slack_ratio <= 0:
            raise DomainValidationError("RiskPolicy.low_slack_ratio must be positive")


# Initial policy: spare capacity below 25% of the remaining effort counts as tight. UNVALIDATED.
DEFAULT_RISK_POLICY = RiskPolicy(engine_version=1, low_slack_ratio=Fraction(1, 4))

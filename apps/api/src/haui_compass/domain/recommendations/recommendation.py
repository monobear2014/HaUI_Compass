"""The result of Next Best Action: a Recommendation or a NoRecommendation.

Results are typed reason codes plus typed evidence. Natural-language explanation is a presentation
concern built from these and must never change them.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import StrEnum

from haui_compass.domain.assignments.assignment import AssignmentId
from haui_compass.domain.risk.signal import RiskLevel, RiskReasonCode
from haui_compass.domain.shared.errors import DomainValidationError
from haui_compass.domain.shared.validation import (
    require_aware_utc,
    require_non_negative,
)
from haui_compass.domain.tasks.task import TaskId, TaskStatus


class RecommendationReasonCode(StrEnum):
    """Why this task was chosen. Stable identifiers, not display text."""

    HIGH_ASSIGNMENT_RISK = "high_assignment_risk"
    MEDIUM_ASSIGNMENT_RISK = "medium_assignment_risk"
    UNKNOWN_ASSIGNMENT_RISK = "unknown_assignment_risk"
    EARLIEST_DEADLINE = "earliest_deadline"
    CONTINUE_IN_PROGRESS_TASK = "continue_in_progress_task"
    ONLY_ACTIONABLE_TASK = "only_actionable_task"


class RankingDimension(StrEnum):
    """The comparison step that separated the chosen task from the runner-up."""

    RISK = "risk"
    DEADLINE = "deadline"
    STATUS = "status"
    STABLE_ORDER = "stable_order"
    ONLY_CANDIDATE = "only_candidate"


@dataclass(frozen=True, slots=True, kw_only=True)
class RecommendationEvidence:
    """The facts behind a recommendation, sufficient to audit or explain it.

    ``risk_*`` values are copied from the assignment's ``RiskSignal``; ``risk_level`` is the real
    level (possibly ``UNKNOWN``), not the tier used for ordering. ``time_until_deadline`` is
    negative once the deadline has passed. ``deciding_dimension`` names the first comparison step at
    which this task differed from the second-ranked one.
    """

    deadline: datetime
    time_until_deadline: timedelta
    estimated_duration: timedelta
    task_status: TaskStatus
    risk_level: RiskLevel
    risk_reason_codes: tuple[RiskReasonCode, ...]
    risk_engine_version: int
    eligible_candidate_count: int
    deciding_dimension: RankingDimension

    def __post_init__(self) -> None:
        object.__setattr__(
            self, "deadline", require_aware_utc(self.deadline, "RecommendationEvidence.deadline")
        )
        require_non_negative(self.estimated_duration, "RecommendationEvidence.estimated_duration")
        if self.eligible_candidate_count < 1:
            raise DomainValidationError(
                "RecommendationEvidence.eligible_candidate_count must be at least 1"
            )


@dataclass(frozen=True, slots=True, kw_only=True)
class Recommendation:
    """The one task the student should do next, and why."""

    task_id: TaskId
    assignment_id: AssignmentId
    as_of: datetime
    reason_codes: tuple[RecommendationReasonCode, ...]
    evidence: RecommendationEvidence
    engine_version: int

    def __post_init__(self) -> None:
        object.__setattr__(self, "as_of", require_aware_utc(self.as_of, "Recommendation.as_of"))
        if not self.reason_codes:
            raise DomainValidationError("Recommendation must have at least one reason code")
        if len(set(self.reason_codes)) != len(self.reason_codes):
            raise DomainValidationError("Recommendation reason codes must be unique")
        if self.engine_version < 1:
            raise DomainValidationError("Recommendation.engine_version must be at least 1")


class NoRecommendationReason(StrEnum):
    NO_ACTIONABLE_TASKS = "no_actionable_tasks"


@dataclass(frozen=True, slots=True, kw_only=True)
class NoRecommendation:
    """There is nothing to recommend. A normal outcome, not an error."""

    as_of: datetime
    reason: NoRecommendationReason
    engine_version: int

    def __post_init__(self) -> None:
        object.__setattr__(self, "as_of", require_aware_utc(self.as_of, "NoRecommendation.as_of"))
        if self.engine_version < 1:
            raise DomainValidationError("NoRecommendation.engine_version must be at least 1")


NextBestActionResult = Recommendation | NoRecommendation

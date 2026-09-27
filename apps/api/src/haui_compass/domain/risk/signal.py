"""RiskSignal: the typed, explainable result of a risk assessment."""

from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import StrEnum

from haui_compass.domain.assignments.assignment import AssignmentId
from haui_compass.domain.shared.errors import DomainValidationError
from haui_compass.domain.shared.validation import (
    require_aware_utc,
    require_non_negative,
    require_non_negative_int,
)


class RiskLevel(StrEnum):
    """How constrained an assignment is. ``UNKNOWN`` means there was not enough information.

    ``UNKNOWN`` is not a level of danger and is not ordered relative to the others; see
    ``severity``.
    """

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    UNKNOWN = "unknown"

    @property
    def severity(self) -> int | None:
        """0 (low) to 2 (high), for comparing levels; ``None`` for ``UNKNOWN``."""
        return {"low": 0, "medium": 1, "high": 2}.get(self.value)


class RiskReasonCode(StrEnum):
    """Why a level was assigned. Stable identifiers, not display text."""

    NO_REMAINING_WORK = "no_remaining_work"
    DEADLINE_PASSED = "deadline_passed"
    MISSING_EFFORT_ESTIMATE = "missing_effort_estimate"
    MISSING_CAPACITY = "missing_capacity"
    NO_CAPACITY_BEFORE_DEADLINE = "no_capacity_before_deadline"
    EFFORT_EXCEEDS_CAPACITY = "effort_exceeds_capacity"
    LOW_SLACK = "low_slack"
    SUFFICIENT_SLACK = "sufficient_slack"


@dataclass(frozen=True, slots=True, kw_only=True)
class RiskEvidence:
    """The concrete numbers behind a signal.

    ``slack`` (capacity minus effort) is present only while time remains and both inputs are known.
    ``slack_ratio`` (slack as a share of the remaining effort) is present only when the effort is
    greater than zero. Both may be negative.
    """

    deadline: datetime
    time_until_deadline: timedelta
    open_task_count: int
    remaining_effort: timedelta | None
    available_capacity: timedelta | None
    slack: timedelta | None
    slack_ratio: float | None

    def __post_init__(self) -> None:
        object.__setattr__(
            self, "deadline", require_aware_utc(self.deadline, "RiskEvidence.deadline")
        )
        require_non_negative_int(self.open_task_count, "RiskEvidence.open_task_count")
        if self.remaining_effort is not None:
            require_non_negative(self.remaining_effort, "RiskEvidence.remaining_effort")
        if self.available_capacity is not None:
            require_non_negative(self.available_capacity, "RiskEvidence.available_capacity")


@dataclass(frozen=True, slots=True, kw_only=True)
class RiskSignal:
    """Risk for one assignment at ``as_of``, with reasons and evidence.

    ``engine_version`` is the ``RiskPolicy.engine_version`` that produced it. This is a transparent
    rule-based assessment of constraint, not a calibrated probability of a late submission.
    """

    assignment_id: AssignmentId
    as_of: datetime
    level: RiskLevel
    reason_codes: tuple[RiskReasonCode, ...]
    evidence: RiskEvidence
    engine_version: int

    def __post_init__(self) -> None:
        object.__setattr__(self, "as_of", require_aware_utc(self.as_of, "RiskSignal.as_of"))
        if not self.reason_codes:
            raise DomainValidationError("RiskSignal must have at least one reason code")
        if len(set(self.reason_codes)) != len(self.reason_codes):
            raise DomainValidationError("RiskSignal reason codes must be unique")
        if self.engine_version < 1:
            raise DomainValidationError("RiskSignal.engine_version must be at least 1")

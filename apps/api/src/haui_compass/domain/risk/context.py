"""AssignmentRiskContext: the explicit input to the Risk Engine for one assignment."""

from dataclasses import dataclass
from datetime import datetime, timedelta

from haui_compass.domain.assignments.assignment import AssignmentId
from haui_compass.domain.shared.errors import DomainValidationError
from haui_compass.domain.shared.validation import (
    require_aware_utc,
    require_non_negative,
    require_non_negative_int,
)


@dataclass(frozen=True, slots=True, kw_only=True)
class AssignmentRiskContext:
    """Everything the engine may use to assess one assignment. The engine fetches nothing itself.

    ``available_capacity_until_deadline`` is the study time available between ``now`` and *this
    assignment's* ``deadline``. It is deliberately not the student's general weekly capacity
    (``StudentState.capacity``), which covers a different horizon; the caller must compute the
    capacity for this window.

    ``remaining_effort`` is the estimated effort still to do for this assignment. ``None`` means
    "not estimated" and is different from zero. ``None`` is also allowed for capacity that could not
    be determined.
    """

    assignment_id: AssignmentId
    now: datetime
    deadline: datetime
    open_task_count: int
    remaining_effort: timedelta | None
    available_capacity_until_deadline: timedelta | None

    def __post_init__(self) -> None:
        object.__setattr__(self, "now", require_aware_utc(self.now, "AssignmentRiskContext.now"))
        object.__setattr__(
            self, "deadline", require_aware_utc(self.deadline, "AssignmentRiskContext.deadline")
        )
        require_non_negative_int(self.open_task_count, "AssignmentRiskContext.open_task_count")
        if self.remaining_effort is not None:
            require_non_negative(self.remaining_effort, "AssignmentRiskContext.remaining_effort")
        if self.available_capacity_until_deadline is not None:
            require_non_negative(
                self.available_capacity_until_deadline,
                "AssignmentRiskContext.available_capacity_until_deadline",
            )
        if self.open_task_count == 0 and self.remaining_effort:
            raise DomainValidationError(
                "AssignmentRiskContext has remaining_effort but no open tasks"
            )

    @property
    def time_until_deadline(self) -> timedelta:
        """Negative once the deadline has passed."""
        return self.deadline - self.now

"""StudentState v0: a derived snapshot of a student's current academic execution state.

It is a *result*, produced by ``engines.student_state`` from explicit facts. It is immutable and
fully typed. It is not a persistence design, a behavioural profile, reflection memory, or a risk
prediction; those belong to later slices (ADR-0001, *StudentState Ownership*).
"""

from dataclasses import dataclass
from datetime import datetime, timedelta

from haui_compass.domain.shared.errors import DomainValidationError
from haui_compass.domain.shared.validation import (
    require_aware_utc,
    require_non_negative,
    require_non_negative_int,
)
from haui_compass.domain.students.ids import StudentId

# Version of the *shape* of StudentState. Bump it whenever a field is added, removed, or changes
# meaning, so stored or compared snapshots can tell which shape they have. It is not a snapshot id.
STUDENT_STATE_SCHEMA_VERSION = 1


@dataclass(frozen=True, slots=True, kw_only=True)
class CapacityState:
    """Study time available versus effort committed to the work in scope.

    ``available`` and ``committed`` are the recorded facts. ``remaining`` and ``overcommitted_by``
    are derived from them, so they cannot disagree, and an over-commitment is reported rather than
    clamped away: at most one of the two is non-zero.
    """

    available: timedelta
    committed: timedelta

    def __post_init__(self) -> None:
        require_non_negative(self.available, "CapacityState.available")
        require_non_negative(self.committed, "CapacityState.committed")

    @property
    def remaining(self) -> timedelta:
        """Capacity left after the commitment; zero when fully or over-committed."""
        return max(self.available - self.committed, timedelta(0))

    @property
    def overcommitted_by(self) -> timedelta:
        """How far the commitment exceeds capacity; zero when it fits."""
        return max(self.committed - self.available, timedelta(0))


@dataclass(frozen=True, slots=True, kw_only=True)
class ProgressState:
    """Task counts by status. Everything else is derived from the three counts."""

    not_started: int
    in_progress: int
    completed: int

    def __post_init__(self) -> None:
        require_non_negative_int(self.not_started, "ProgressState.not_started")
        require_non_negative_int(self.in_progress, "ProgressState.in_progress")
        require_non_negative_int(self.completed, "ProgressState.completed")

    @property
    def total(self) -> int:
        return self.not_started + self.in_progress + self.completed

    @property
    def remaining(self) -> int:
        """Tasks that still need work (not started or in progress)."""
        return self.not_started + self.in_progress

    @property
    def completion_ratio(self) -> float | None:
        """Share of tasks completed, in [0, 1]; ``None`` when there are no tasks.

        With zero tasks neither 0% nor 100% is true, so the ratio is undefined rather than guessed.
        Tasks are counted equally; effort-weighted progress is deliberately not modelled yet.
        """
        if self.total == 0:
            return None
        return self.completed / self.total


@dataclass(frozen=True, slots=True, kw_only=True)
class StudentState:
    """Snapshot of one student at ``as_of`` (UTC), for the tasks in scope."""

    student_id: StudentId
    as_of: datetime
    capacity: CapacityState
    progress: ProgressState
    schema_version: int = STUDENT_STATE_SCHEMA_VERSION

    def __post_init__(self) -> None:
        object.__setattr__(self, "as_of", require_aware_utc(self.as_of, "StudentState.as_of"))
        if self.schema_version < 1:
            raise DomainValidationError("StudentState.schema_version must be at least 1")

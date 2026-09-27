"""TaskExecution: an observed fact about work actually performed on a task.

This is an observation, not a plan, an estimate, or a prediction: it records what the student
reports happened in one sitting, with its own start and end time, independent of the Task's
``estimated_duration``. Deriving any behavioural signal (calibration, risk, procrastination) from
these facts is deliberately out of scope here; see docs/research/intelliplan-execution-reference.md.

No ``ExecutionId``: nothing in this branch needs to look one up, deduplicate by it, or persist it
independently of the task it describes. Persistence, if it needs one, can add it later without
changing this type's meaning. One consequence, documented rather than silently handled: v0 cannot
distinguish a second, genuinely repeated sitting from an accidental duplicate submission of the
same record; both are just another ``TaskExecution`` for the engine to summarise.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import StrEnum

from haui_compass.domain.shared.errors import DomainValidationError
from haui_compass.domain.shared.validation import require_aware_utc
from haui_compass.domain.tasks.task import TaskId


class ExecutionOutcome(StrEnum):
    """The student's own report of what this sitting achieved. Nothing finer-grained than this.

    ``PARTIAL``: worked on the task, did not finish it.
    ``COMPLETED``: the task was finished during this sitting.
    """

    PARTIAL = "partial"
    COMPLETED = "completed"


class ExecutionTaskMismatchError(DomainValidationError):
    """An execution was applied to a task it does not describe."""


class TaskAlreadyCompletedError(DomainValidationError):
    """A completed task cannot receive another execution."""


@dataclass(frozen=True, slots=True, kw_only=True)
class TaskExecution:
    """One observed sitting. ``actual_duration`` is derived, never stored separately, so it cannot
    disagree with the timestamps it comes from."""

    task_id: TaskId
    started_at: datetime
    ended_at: datetime
    outcome: ExecutionOutcome

    def __post_init__(self) -> None:
        object.__setattr__(
            self, "started_at", require_aware_utc(self.started_at, "TaskExecution.started_at")
        )
        object.__setattr__(
            self, "ended_at", require_aware_utc(self.ended_at, "TaskExecution.ended_at")
        )
        if self.ended_at <= self.started_at:
            raise DomainValidationError(
                "TaskExecution.ended_at must be strictly after started_at "
                "(a zero-duration sitting is not a meaningful observation)"
            )

    @property
    def actual_duration(self) -> timedelta:
        return self.ended_at - self.started_at


@dataclass(frozen=True, slots=True, kw_only=True)
class TaskExecutionSummary:
    """A factual aggregate over one task's execution history. No scoring, no inference.

    ``last_activity_at`` is the latest ``ended_at`` across all sessions, whether or not the task
    is finished. ``completed_at`` is the ``ended_at`` of the completing session, or ``None`` if the
    task has not been completed yet.
    """

    task_id: TaskId
    session_count: int
    total_actual_duration: timedelta
    first_started_at: datetime
    last_activity_at: datetime
    completed_at: datetime | None

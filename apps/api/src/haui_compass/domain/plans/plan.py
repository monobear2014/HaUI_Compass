"""StudyPlan domain model: explicit windows, planned blocks, and unplanned effort."""

from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import StrEnum
from itertools import pairwise

from haui_compass.domain.shared.errors import DomainValidationError
from haui_compass.domain.shared.validation import require_aware_utc, require_non_negative
from haui_compass.domain.students.ids import StudentId
from haui_compass.domain.tasks.task import TaskId


@dataclass(frozen=True, slots=True, kw_only=True)
class PlanPeriod:
    """The caller-supplied planning horizon. It has no weekday assumptions."""

    start: datetime
    end: datetime

    def __post_init__(self) -> None:
        object.__setattr__(self, "start", require_aware_utc(self.start, "PlanPeriod.start"))
        object.__setattr__(self, "end", require_aware_utc(self.end, "PlanPeriod.end"))
        if self.end <= self.start:
            raise DomainValidationError("PlanPeriod.end must be strictly after start")


@dataclass(frozen=True, slots=True, kw_only=True)
class StudyWindow:
    """One interval during which the student is explicitly available to study."""

    starts_at: datetime
    ends_at: datetime

    def __post_init__(self) -> None:
        object.__setattr__(
            self, "starts_at", require_aware_utc(self.starts_at, "StudyWindow.starts_at")
        )
        object.__setattr__(self, "ends_at", require_aware_utc(self.ends_at, "StudyWindow.ends_at"))
        if self.ends_at <= self.starts_at:
            raise DomainValidationError("StudyWindow.ends_at must be strictly after starts_at")

    @property
    def duration(self) -> timedelta:
        return self.ends_at - self.starts_at


@dataclass(frozen=True, slots=True, kw_only=True)
class StudyBlock:
    """Planned execution of part or all of an existing Task."""

    task_id: TaskId
    starts_at: datetime
    ends_at: datetime

    def __post_init__(self) -> None:
        object.__setattr__(
            self, "starts_at", require_aware_utc(self.starts_at, "StudyBlock.starts_at")
        )
        object.__setattr__(self, "ends_at", require_aware_utc(self.ends_at, "StudyBlock.ends_at"))
        if self.ends_at <= self.starts_at:
            raise DomainValidationError("StudyBlock.ends_at must be strictly after starts_at")

    @property
    def duration(self) -> timedelta:
        return self.ends_at - self.starts_at


class UnplannedReason(StrEnum):
    """Why some explicit task effort could not be placed in this horizon."""

    NO_STUDY_WINDOW_BEFORE_DEADLINE = "no_study_window_before_deadline"
    INSUFFICIENT_CAPACITY = "insufficient_capacity"


@dataclass(frozen=True, slots=True, kw_only=True)
class UnplannedTask:
    """The exact remaining effort the planner could not place for one task."""

    task_id: TaskId
    remaining_effort: timedelta
    reason: UnplannedReason

    def __post_init__(self) -> None:
        require_non_negative(self.remaining_effort, "UnplannedTask.remaining_effort")
        if self.remaining_effort == timedelta(0):
            raise DomainValidationError("UnplannedTask.remaining_effort must be positive")


@dataclass(frozen=True, slots=True, kw_only=True)
class StudyPlan:
    """A reproducible plan plus every piece of work that did not fit."""

    student_id: StudentId
    period: PlanPeriod
    generated_at: datetime
    blocks: tuple[StudyBlock, ...]
    unplanned_tasks: tuple[UnplannedTask, ...]
    planner_version: int

    def __post_init__(self) -> None:
        object.__setattr__(
            self,
            "generated_at",
            require_aware_utc(self.generated_at, "StudyPlan.generated_at"),
        )
        if self.planner_version < 1:
            raise DomainValidationError("StudyPlan.planner_version must be at least 1")

        ordered_blocks = tuple(
            sorted(self.blocks, key=lambda block: (block.starts_at, block.ends_at, block.task_id))
        )
        object.__setattr__(self, "blocks", ordered_blocks)
        for block in ordered_blocks:
            if block.starts_at < self.period.start or block.ends_at > self.period.end:
                raise DomainValidationError("StudyPlan block must lie inside the planning period")
        for previous, current in pairwise(ordered_blocks):
            if previous.ends_at > current.starts_at:
                raise DomainValidationError("StudyPlan blocks must not overlap")

        task_ids = [item.task_id for item in self.unplanned_tasks]
        if len(set(task_ids)) != len(task_ids):
            raise DomainValidationError("StudyPlan may contain at most one unplanned row per task")
        object.__setattr__(
            self,
            "unplanned_tasks",
            tuple(sorted(self.unplanned_tasks, key=lambda item: item.task_id)),
        )

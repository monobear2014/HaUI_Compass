"""Immutable inputs and outputs for Adaptive Replanning v0."""

from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import StrEnum

from haui_compass.domain.plans.plan import StudyBlock, StudyPlan
from haui_compass.domain.shared.errors import DomainValidationError
from haui_compass.domain.shared.validation import (
    require_aware_utc,
    require_non_negative,
    require_non_negative_int,
)
from haui_compass.domain.tasks.task import TaskId


@dataclass(frozen=True, slots=True, kw_only=True)
class TaskRemainingEffort:
    """Explicit work remaining at ``effective_at``; never inferred from execution duration."""

    task_id: TaskId
    remaining_duration: timedelta

    def __post_init__(self) -> None:
        require_non_negative(self.remaining_duration, "TaskRemainingEffort.remaining_duration")


@dataclass(frozen=True, slots=True, kw_only=True)
class ReplanningPolicy:
    """Version of the deterministic replanning semantics.

    Version 1 freezes every block that starts before ``effective_at``, including a block that
    crosses that instant. The full crossing-block duration reserves explicit remaining effort.
    All confirmed reflection signals are informational in v0.
    """

    replanner_version: int

    def __post_init__(self) -> None:
        if self.replanner_version < 1:
            raise DomainValidationError("ReplanningPolicy.replanner_version must be at least 1")


DEFAULT_REPLANNING_POLICY = ReplanningPolicy(replanner_version=1)


class PlanChangeReason(StrEnum):
    """Concrete facts that required a task's future plan to change."""

    TASK_COMPLETED = "task_completed"
    STUDY_WINDOW_CHANGED = "study_window_changed"
    ASSIGNMENT_DEADLINE_CHANGED = "assignment_deadline_changed"
    REMAINING_EFFORT_CHANGED = "remaining_effort_changed"
    INSUFFICIENT_CAPACITY = "insufficient_capacity"


@dataclass(frozen=True, slots=True, kw_only=True)
class PlanChange:
    """Task-level before/after evidence for one meaningful modification.

    Unchanged/preserved blocks produce no event. ``had_execution_activity`` records only whether
    a factual execution summary was supplied; its duration never determines remaining effort.
    """

    task_id: TaskId
    reasons: tuple[PlanChangeReason, ...]
    baseline_future_blocks: tuple[StudyBlock, ...]
    revised_future_blocks: tuple[StudyBlock, ...]
    baseline_unplanned_effort: timedelta
    revised_unplanned_effort: timedelta
    had_execution_activity: bool

    def __post_init__(self) -> None:
        if not self.reasons:
            raise DomainValidationError("PlanChange must have at least one reason")
        if len(set(self.reasons)) != len(self.reasons):
            raise DomainValidationError("PlanChange reasons must be unique")
        require_non_negative(self.baseline_unplanned_effort, "PlanChange.baseline_unplanned_effort")
        require_non_negative(self.revised_unplanned_effort, "PlanChange.revised_unplanned_effort")
        if (
            self.baseline_future_blocks == self.revised_future_blocks
            and self.baseline_unplanned_effort == self.revised_unplanned_effort
        ):
            raise DomainValidationError("PlanChange must describe an actual plan modification")


class ReflectionSignalKind(StrEnum):
    ESTIMATION_FEEDBACK = "estimation_feedback"
    WORKLOAD_FEEDBACK = "workload_feedback"
    DIFFICULT_TOPIC = "difficult_topic"
    DEFERRED_TASK = "deferred_task"


@dataclass(frozen=True, slots=True, kw_only=True)
class ReplanningSummary:
    """Measurable churn facts, never collapsed into an unvalidated stability score."""

    historical_block_count: int
    crossing_block_count: int
    preserved_future_block_count: int
    removed_future_block_count: int
    added_future_block_count: int
    moved_duration: timedelta
    newly_unplanned_duration: timedelta
    execution_context_task_count: int

    def __post_init__(self) -> None:
        for name in (
            "historical_block_count",
            "crossing_block_count",
            "preserved_future_block_count",
            "removed_future_block_count",
            "added_future_block_count",
            "execution_context_task_count",
        ):
            require_non_negative_int(getattr(self, name), f"ReplanningSummary.{name}")
        require_non_negative(self.moved_duration, "ReplanningSummary.moved_duration")
        require_non_negative(
            self.newly_unplanned_duration, "ReplanningSummary.newly_unplanned_duration"
        )


@dataclass(frozen=True, slots=True, kw_only=True)
class ReplanningResult:
    """A revised plan and the concise, typed audit of how it differs from its baseline."""

    revised_plan: StudyPlan
    effective_at: datetime
    changes: tuple[PlanChange, ...]
    summary: ReplanningSummary
    informational_reflection_signals: tuple[ReflectionSignalKind, ...]
    replanner_version: int

    def __post_init__(self) -> None:
        object.__setattr__(
            self,
            "effective_at",
            require_aware_utc(self.effective_at, "ReplanningResult.effective_at"),
        )
        if not self.revised_plan.period.start <= self.effective_at <= self.revised_plan.period.end:
            raise DomainValidationError("ReplanningResult.effective_at must lie inside plan period")
        if self.replanner_version < 1:
            raise DomainValidationError("ReplanningResult.replanner_version must be at least 1")
        task_ids = [change.task_id for change in self.changes]
        if len(set(task_ids)) != len(task_ids):
            raise DomainValidationError("ReplanningResult may contain at most one change per task")
        object.__setattr__(self, "changes", tuple(sorted(self.changes, key=lambda c: c.task_id)))
        object.__setattr__(
            self,
            "informational_reflection_signals",
            tuple(sorted(set(self.informational_reflection_signals), key=str)),
        )

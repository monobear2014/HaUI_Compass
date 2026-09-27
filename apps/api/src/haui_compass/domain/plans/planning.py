"""Inputs and versioned policy for deterministic weekly planning."""

from dataclasses import dataclass

from haui_compass.domain.assignments.assignment import Assignment
from haui_compass.domain.shared.errors import DomainValidationError
from haui_compass.domain.tasks.task import Task


@dataclass(frozen=True, slots=True, kw_only=True)
class PlanningCandidate:
    """An explicit task paired with the assignment that supplies its deadline."""

    task: Task
    assignment: Assignment

    def __post_init__(self) -> None:
        if self.task.assignment_id != self.assignment.id:
            raise DomainValidationError("PlanningCandidate.task does not belong to assignment")


@dataclass(frozen=True, slots=True, kw_only=True)
class PlanningPolicy:
    """The small, explicit set of semantic choices behind Weekly Planner v0."""

    planner_version: int
    prefer_in_progress_when_deadlines_tie: bool

    def __post_init__(self) -> None:
        if self.planner_version < 1:
            raise DomainValidationError("PlanningPolicy.planner_version must be at least 1")


DEFAULT_PLANNING_POLICY = PlanningPolicy(
    planner_version=1,
    prefer_in_progress_when_deadlines_tie=True,
)

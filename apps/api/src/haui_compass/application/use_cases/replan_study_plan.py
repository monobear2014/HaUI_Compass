"""Application entry point for deterministic Adaptive Replanning v0.

The complete baseline and current facts are caller-supplied. This use case performs no I/O and
does not fetch, infer, persist, or enrich planning inputs.
"""

from dataclasses import dataclass
from datetime import datetime

from haui_compass.domain.assignments.assignment import Assignment
from haui_compass.domain.plans.plan import StudyPlan, StudyWindow
from haui_compass.domain.plans.planning import DEFAULT_PLANNING_POLICY, PlanningPolicy
from haui_compass.domain.plans.replanning import (
    DEFAULT_REPLANNING_POLICY,
    ReplanningPolicy,
    ReplanningResult,
    TaskRemainingEffort,
)
from haui_compass.domain.reflections.signals import ConfirmedReflectionSignals
from haui_compass.domain.tasks.execution import TaskExecutionSummary
from haui_compass.domain.tasks.task import Task
from haui_compass.engines.replanning.replan import replan_study_plan


@dataclass(frozen=True, slots=True, kw_only=True)
class ReplanStudyPlanRequest:
    baseline_plan: StudyPlan
    tasks: tuple[Task, ...]
    assignments: tuple[Assignment, ...]
    study_windows: tuple[StudyWindow, ...]
    remaining_efforts: tuple[TaskRemainingEffort, ...]
    execution_summaries: tuple[TaskExecutionSummary, ...]
    confirmed_reflections: tuple[ConfirmedReflectionSignals, ...]
    effective_at: datetime


class ReplanStudyPlan:
    def __init__(
        self,
        *,
        policy: ReplanningPolicy = DEFAULT_REPLANNING_POLICY,
        planning_policy: PlanningPolicy = DEFAULT_PLANNING_POLICY,
    ) -> None:
        self._policy = policy
        self._planning_policy = planning_policy

    def execute(self, request: ReplanStudyPlanRequest) -> ReplanningResult:
        """Revise one explicit baseline using only explicit current facts."""
        return replan_study_plan(
            baseline_plan=request.baseline_plan,
            tasks=request.tasks,
            assignments=request.assignments,
            study_windows=request.study_windows,
            remaining_efforts=request.remaining_efforts,
            execution_summaries=request.execution_summaries,
            confirmed_reflections=request.confirmed_reflections,
            effective_at=request.effective_at,
            policy=self._policy,
            planning_policy=self._planning_policy,
        )

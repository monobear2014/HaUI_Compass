"""GenerateWeeklyPlan: validate explicit inputs and delegate to the pure planner.

No repository, LMS, clock, AI capability, or persistence adapter is involved. The caller supplies
the complete task/assignment context, planning horizon, availability windows, and generation time.
"""

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum

from haui_compass.domain.assignments.assignment import Assignment, AssignmentId
from haui_compass.domain.plans.plan import PlanPeriod, StudyPlan, StudyWindow
from haui_compass.domain.plans.planning import (
    DEFAULT_PLANNING_POLICY,
    PlanningCandidate,
    PlanningPolicy,
)
from haui_compass.domain.students.ids import StudentId
from haui_compass.domain.tasks.task import Task, TaskId
from haui_compass.engines.planning.schedule import generate_weekly_plan


@dataclass(frozen=True, slots=True, kw_only=True)
class GenerateWeeklyPlanRequest:
    student_id: StudentId
    tasks: tuple[Task, ...]
    assignments: tuple[Assignment, ...]
    period: PlanPeriod
    study_windows: tuple[StudyWindow, ...]
    generated_at: datetime


class WeeklyPlanInputErrorCode(StrEnum):
    DUPLICATE_TASK_ID = "duplicate_task_id"
    DUPLICATE_ASSIGNMENT_ID = "duplicate_assignment_id"
    TASK_FOR_UNKNOWN_ASSIGNMENT = "task_for_unknown_assignment"


class WeeklyPlanInputError(ValueError):
    """The explicit request contradicts itself. Input is rejected, never silently dropped."""

    def __init__(self, code: WeeklyPlanInputErrorCode, message: str) -> None:
        super().__init__(message)
        self.code = code


class GenerateWeeklyPlan:
    def __init__(self, *, policy: PlanningPolicy = DEFAULT_PLANNING_POLICY) -> None:
        self._policy = policy

    def execute(self, request: GenerateWeeklyPlanRequest) -> StudyPlan:
        """Generate one baseline weekly plan using exactly the supplied facts."""
        assignments = _assignments_by_id(request.assignments)
        _require_unique_task_ids(request.tasks)

        candidates: list[PlanningCandidate] = []
        for task in request.tasks:
            assignment = assignments.get(task.assignment_id)
            if assignment is None:
                raise WeeklyPlanInputError(
                    WeeklyPlanInputErrorCode.TASK_FOR_UNKNOWN_ASSIGNMENT,
                    f"task {task.id} references assignment {task.assignment_id} not in request",
                )
            candidates.append(PlanningCandidate(task=task, assignment=assignment))

        return generate_weekly_plan(
            student_id=request.student_id,
            candidates=candidates,
            period=request.period,
            study_windows=request.study_windows,
            generated_at=request.generated_at,
            policy=self._policy,
        )


def _assignments_by_id(assignments: tuple[Assignment, ...]) -> dict[AssignmentId, Assignment]:
    by_id: dict[AssignmentId, Assignment] = {}
    for assignment in assignments:
        if assignment.id in by_id:
            raise WeeklyPlanInputError(
                WeeklyPlanInputErrorCode.DUPLICATE_ASSIGNMENT_ID,
                f"duplicate assignment id: {assignment.id}",
            )
        by_id[assignment.id] = assignment
    return by_id


def _require_unique_task_ids(tasks: tuple[Task, ...]) -> None:
    seen: set[TaskId] = set()
    for task in tasks:
        if task.id in seen:
            raise WeeklyPlanInputError(
                WeeklyPlanInputErrorCode.DUPLICATE_TASK_ID,
                f"duplicate task id: {task.id}",
            )
        seen.add(task.id)

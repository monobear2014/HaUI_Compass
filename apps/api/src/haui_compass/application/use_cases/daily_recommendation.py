"""Request, result, and errors for the GenerateDailyRecommendation use case.

Every non-LMS fact is an explicit, typed input: nothing is fetched or inferred behind the caller's
back, and an LMS assignment is never turned into a task here.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import StrEnum

from haui_compass.application.lms_mapping import SkippedAssignment
from haui_compass.application.ports.lms import ExternalRef
from haui_compass.domain.assignments.assignment import Assignment, AssignmentId
from haui_compass.domain.recommendations.recommendation import NextBestActionResult
from haui_compass.domain.risk.signal import RiskSignal
from haui_compass.domain.shared.errors import DomainValidationError
from haui_compass.domain.shared.validation import require_non_negative
from haui_compass.domain.students.state import StudentState
from haui_compass.domain.tasks.task import Task


@dataclass(frozen=True, slots=True, kw_only=True)
class AssignmentCapacity:
    """Study time available between now and this assignment's own deadline.

    This is a different quantity from ``GenerateDailyRecommendationRequest.available_capacity``:
    each assignment has its own horizon (its deadline), so the caller supplies one value per
    assignment. It is what the risk engine needs; it is never derived from the general capacity.
    """

    assignment_id: AssignmentId
    available_until_deadline: timedelta

    def __post_init__(self) -> None:
        require_non_negative(
            self.available_until_deadline, "AssignmentCapacity.available_until_deadline"
        )


@dataclass(frozen=True, slots=True, kw_only=True)
class GenerateDailyRecommendationRequest:
    """Everything the use case needs besides the LMS and the clock.

    - ``student``: the student's identity in the LMS.
    - ``tasks``: the tasks to consider, supplied explicitly. Task planning and decomposition do not
      exist yet, so nothing generates tasks from assignments. Each task must belong to an assignment
      the LMS reports for this student, and the tasks are assumed to fully represent the remaining
      work of their assignment.
    - ``available_capacity``: general study time for ``StudentState`` (not a deadline horizon).
    - ``assignment_capacities``: per-assignment capacity until each deadline. An assignment with
      tasks but no entry here has *unknown* capacity, and its risk is reported as ``UNKNOWN``.
    """

    student: ExternalRef
    tasks: tuple[Task, ...]
    available_capacity: timedelta
    assignment_capacities: tuple[AssignmentCapacity, ...] = ()


@dataclass(frozen=True, slots=True, kw_only=True)
class AssignmentRisk:
    """An assignment (with tasks supplied for it) and its risk assessment."""

    assignment: Assignment
    risk: RiskSignal


@dataclass(frozen=True, slots=True, kw_only=True)
class DailyRecommendationResult:
    """The decision pipeline's output for one snapshot instant.

    - ``as_of``: the single instant used by every part of this result.
    - ``student_state``: derived from the supplied tasks and capacity.
    - ``assignment_risks``: one entry per assignment that has at least one supplied task, ordered
      by deadline then id. Assignments with no tasks get none, because their remaining work is
      not known from the inputs.
    - ``recommendation``: a ``Recommendation`` or a ``NoRecommendation`` (a valid outcome).
    - ``skipped_assignments``: LMS assignments that could not be mapped (for example, no deadline).
    """

    as_of: datetime
    student_state: StudentState
    assignment_risks: tuple[AssignmentRisk, ...]
    recommendation: NextBestActionResult
    skipped_assignments: tuple[SkippedAssignment, ...]

    def __post_init__(self) -> None:
        instants = {
            self.student_state.as_of,
            self.recommendation.as_of,
            *(item.risk.as_of for item in self.assignment_risks),
        }
        if instants != {self.as_of}:
            raise DomainValidationError(
                "DailyRecommendationResult must use one snapshot instant throughout"
            )


class InputErrorCode(StrEnum):
    DUPLICATE_TASK_ID = "duplicate_task_id"
    TASK_FOR_UNKNOWN_ASSIGNMENT = "task_for_unknown_assignment"
    TASK_FOR_UNDATED_ASSIGNMENT = "task_for_undated_assignment"
    DUPLICATE_ASSIGNMENT_CAPACITY = "duplicate_assignment_capacity"
    CAPACITY_FOR_UNKNOWN_ASSIGNMENT = "capacity_for_unknown_assignment"


class DailyRecommendationInputError(ValueError):
    """The request contradicts itself or the LMS data. Bad input is reported, never dropped."""

    def __init__(self, code: InputErrorCode, message: str) -> None:
        super().__init__(message)
        self.code = code

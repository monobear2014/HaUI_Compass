"""Shared helpers for daily-recommendation tests."""

from collections.abc import Collection, Sequence
from datetime import datetime, timedelta
from uuid import UUID

from haui_compass.application.lms_mapping import assignment_id_for
from haui_compass.application.ports.lms import (
    ExternalRef,
    LMSAssignmentRecord,
    LMSCourseRecord,
    LMSEntity,
    LMSNotFoundError,
    LMSSubmissionRecord,
)
from haui_compass.application.use_cases.daily_recommendation import AssignmentCapacity
from haui_compass.domain.assignments.assignment import AssignmentId
from haui_compass.domain.tasks.task import Task, TaskId, TaskStatus
from support.builders import NOW

HOUR = timedelta(hours=1)
STUDENT = ExternalRef("stub", "student-1")


class StubLMS:
    """A minimal LMSProvider that is not MockLMSProvider (proves port independence)."""

    def __init__(self, assignments: Sequence[tuple[str, datetime | None]]) -> None:
        course = ExternalRef("stub", "course-1")
        self._courses = (LMSCourseRecord(ref=course, name="Stub course"),)
        self._assignments = tuple(
            LMSAssignmentRecord(
                ref=ExternalRef("stub", key),
                course_ref=course,
                title=f"Assignment {key}",
                deadline=due,
            )
            for key, due in assignments
        )

    def get_courses(self, student: ExternalRef) -> tuple[LMSCourseRecord, ...]:
        self._check(student)
        return self._courses

    def get_assignments(
        self, student: ExternalRef, *, courses: Collection[ExternalRef] | None = None
    ) -> tuple[LMSAssignmentRecord, ...]:
        self._check(student)
        return self._assignments

    def get_submission_statuses(
        self, student: ExternalRef, *, assignments: Collection[ExternalRef] | None = None
    ) -> tuple[LMSSubmissionRecord, ...]:
        self._check(student)
        return ()

    @staticmethod
    def _check(student: ExternalRef) -> None:
        if student != STUDENT:
            raise LMSNotFoundError(LMSEntity.STUDENT, student)


def aid(key: str, provider: str = "stub") -> AssignmentId:
    return assignment_id_for(ExternalRef(provider, key))


def days(n: float) -> datetime:
    return NOW + timedelta(days=n)


def task(
    n: int,
    assignment: AssignmentId,
    *,
    hours: float = 1,
    status: TaskStatus = TaskStatus.NOT_STARTED,
) -> Task:
    return Task(
        id=TaskId(UUID(int=n)),
        assignment_id=assignment,
        title=f"Task {n}",
        estimated_duration=timedelta(hours=hours),
        status=status,
    )


def cap(assignment: AssignmentId, hours: float) -> AssignmentCapacity:
    return AssignmentCapacity(
        assignment_id=assignment, available_until_deadline=timedelta(hours=hours)
    )

"""MockLMSProvider: an in-memory, deterministic LMSProvider for development and tests.

This is development/test infrastructure, NOT a production integration. It has no network, files,
randomness, or clock. It never returns its internal storage: results are fresh tuples of frozen
records, so callers cannot corrupt it.
"""

from collections.abc import Collection, Mapping
from datetime import datetime

from haui_compass.application.ports.lms import (
    ExternalRef,
    LMSAssignmentRecord,
    LMSCourseRecord,
    LMSEntity,
    LMSNotFoundError,
    LMSSubmissionRecord,
)
from haui_compass.infrastructure.lms.mock_data import MockStudentRecords, canonical_students


class MockLMSProvider:
    def __init__(self, students: Mapping[ExternalRef, MockStudentRecords]) -> None:
        # Copy, so later changes to the caller's mapping cannot leak in.
        self._students: dict[ExternalRef, MockStudentRecords] = dict(students)

    @classmethod
    def canonical(cls, *, anchor: datetime) -> "MockLMSProvider":
        """The canonical fictional scenario, with deadlines relative to ``anchor``."""
        return cls(canonical_students(anchor))

    def get_courses(self, student: ExternalRef) -> tuple[LMSCourseRecord, ...]:
        courses, _, _ = self._records(student)
        return tuple(courses)

    def get_assignments(
        self, student: ExternalRef, *, courses: Collection[ExternalRef] | None = None
    ) -> tuple[LMSAssignmentRecord, ...]:
        student_courses, assignments, _ = self._records(student)
        if courses is None:
            return tuple(assignments)
        known = {course.ref for course in student_courses}
        for ref in courses:
            if ref not in known:
                raise LMSNotFoundError(LMSEntity.COURSE, ref)
        wanted = set(courses)
        return tuple(a for a in assignments if a.course_ref in wanted)

    def get_submission_statuses(
        self, student: ExternalRef, *, assignments: Collection[ExternalRef] | None = None
    ) -> tuple[LMSSubmissionRecord, ...]:
        _, student_assignments, submissions = self._records(student)
        if assignments is None:
            return tuple(submissions)
        known = {a.ref for a in student_assignments}
        for ref in assignments:
            if ref not in known:
                raise LMSNotFoundError(LMSEntity.ASSIGNMENT, ref)
        wanted = set(assignments)
        return tuple(s for s in submissions if s.assignment_ref in wanted)

    def _records(self, student: ExternalRef) -> MockStudentRecords:
        try:
            return self._students[student]
        except KeyError:
            raise LMSNotFoundError(LMSEntity.STUDENT, student) from None

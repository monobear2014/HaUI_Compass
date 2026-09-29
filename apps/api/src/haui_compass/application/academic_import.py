"""Strict, source-labelled academic-data import contract for the pilot.

Imports deliberately end as LMS-compatible records.  They are user-provided pilot
input, not claimed as authoritative HaUI data.
"""

from collections.abc import Collection
from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import StrEnum

from haui_compass.application.ports.lms import (
    ExternalRef,
    LMSAssignmentRecord,
    LMSCourseRecord,
    LMSEntity,
    LMSNotFoundError,
    LMSProvider,
    LMSSubmissionRecord,
    SubmissionStatus,
)

SCHEMA_VERSION = "haui-compass-academic-import-v1"


class AcademicSource(StrEnum):
    MANUAL = "manual"
    CSV_IMPORT = "csv"
    JSON_IMPORT = "json"


class AcademicImportErrorCode(StrEnum):
    INVALID_SCHEMA = "invalid_academic_import_schema"
    DUPLICATE_ID = "duplicate_academic_external_id"
    ORPHAN_ASSIGNMENT = "orphan_assignment_course"
    ORPHAN_SUBMISSION = "orphan_submission_assignment"
    CONFLICT = "academic_import_conflict"


class AcademicImportError(ValueError):
    def __init__(self, code: AcademicImportErrorCode, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True, slots=True)
class AcademicDataSet:
    """One atomically imported student-owned pilot snapshot."""

    student: ExternalRef
    source: AcademicSource
    courses: tuple[LMSCourseRecord, ...]
    assignments: tuple[LMSAssignmentRecord, ...]
    submissions: tuple[LMSSubmissionRecord, ...]

    def __post_init__(self) -> None:
        provider = self.source.value
        if self.student.provider != provider:
            raise AcademicImportError(
                AcademicImportErrorCode.INVALID_SCHEMA,
                "student provider must match the academic-data source",
            )
        if len({item.ref for item in self.courses}) != len(self.courses):
            raise AcademicImportError(AcademicImportErrorCode.DUPLICATE_ID, "duplicate course id")
        if len({item.ref for item in self.assignments}) != len(self.assignments):
            raise AcademicImportError(
                AcademicImportErrorCode.DUPLICATE_ID, "duplicate assignment id"
            )
        if len({item.assignment_ref for item in self.submissions}) != len(self.submissions):
            raise AcademicImportError(
                AcademicImportErrorCode.DUPLICATE_ID, "duplicate submission assignment id"
            )
        course_refs = {item.ref for item in self.courses}
        assignment_refs = {item.ref for item in self.assignments}
        if any(item.course_ref not in course_refs for item in self.assignments):
            raise AcademicImportError(
                AcademicImportErrorCode.ORPHAN_ASSIGNMENT,
                "an assignment references a course outside this import",
            )
        if any(item.assignment_ref not in assignment_refs for item in self.submissions):
            raise AcademicImportError(
                AcademicImportErrorCode.ORPHAN_SUBMISSION,
                "a submission references an assignment outside this import",
            )


class ImportedAcademicDataProvider:
    """Read-only LMSProvider implementation backed by validated pilot datasets."""

    def __init__(self) -> None:
        self._datasets: dict[ExternalRef, AcademicDataSet] = {}

    def replace(self, dataset: AcademicDataSet) -> bool:
        """Store an exact retry idempotently; reject a changed same-source dataset."""
        current = self._datasets.get(dataset.student)
        if current is not None and current != dataset:
            raise AcademicImportError(
                AcademicImportErrorCode.CONFLICT,
                "academic data already exists for this student and source; "
                "clear it before replacing",
            )
        self._datasets[dataset.student] = dataset
        return current is not None

    def clear(self, student: ExternalRef) -> bool:
        return self._datasets.pop(student, None) is not None

    def dataset(self, student: ExternalRef) -> AcademicDataSet | None:
        return self._datasets.get(student)

    def get_courses(self, student: ExternalRef) -> tuple[LMSCourseRecord, ...]:
        return self._records(student).courses

    def get_assignments(
        self, student: ExternalRef, *, courses: Collection[ExternalRef] | None = None
    ) -> tuple[LMSAssignmentRecord, ...]:
        records = self._records(student)
        if courses is None:
            return records.assignments
        known = {course.ref for course in records.courses}
        for course in courses:
            if course not in known:
                raise LMSNotFoundError(LMSEntity.COURSE, course)
        wanted = set(courses)
        return tuple(item for item in records.assignments if item.course_ref in wanted)

    def get_submission_statuses(
        self, student: ExternalRef, *, assignments: Collection[ExternalRef] | None = None
    ) -> tuple[LMSSubmissionRecord, ...]:
        records = self._records(student)
        if assignments is None:
            return records.submissions
        known = {item.ref for item in records.assignments}
        for assignment in assignments:
            if assignment not in known:
                raise LMSNotFoundError(LMSEntity.ASSIGNMENT, assignment)
        wanted = set(assignments)
        return tuple(item for item in records.submissions if item.assignment_ref in wanted)

    def _records(self, student: ExternalRef) -> AcademicDataSet:
        try:
            return self._datasets[student]
        except KeyError:
            raise LMSNotFoundError(LMSEntity.STUDENT, student) from None


class AcademicDataRoutingProvider:
    """Route pilot namespaces to imports and retain the existing configured provider otherwise."""

    def __init__(self, *, imported: ImportedAcademicDataProvider, fallback: LMSProvider) -> None:
        self._imported = imported
        self._fallback = fallback

    def _provider_for(self, student: ExternalRef) -> LMSProvider:
        if student.provider in {item.value for item in AcademicSource}:
            return self._imported
        return self._fallback

    def get_courses(self, student: ExternalRef) -> tuple[LMSCourseRecord, ...]:
        return self._provider_for(student).get_courses(student)

    def get_assignments(
        self, student: ExternalRef, *, courses: Collection[ExternalRef] | None = None
    ) -> tuple[LMSAssignmentRecord, ...]:
        return self._provider_for(student).get_assignments(student, courses=courses)

    def get_submission_statuses(
        self, student: ExternalRef, *, assignments: Collection[ExternalRef] | None = None
    ) -> tuple[LMSSubmissionRecord, ...]:
        return self._provider_for(student).get_submission_statuses(student, assignments=assignments)


def dataset_from_values(
    *,
    student_id: str,
    source: AcademicSource,
    courses: tuple[tuple[str, str, str | None], ...],
    assignments: tuple[tuple[str, str, str, datetime | None, int | None], ...],
    submissions: tuple[tuple[str, SubmissionStatus, datetime | None], ...],
) -> AcademicDataSet:
    """Build the normalized boundary records after an API/parser has validated input."""
    provider = source.value
    return AcademicDataSet(
        student=ExternalRef(provider, student_id),
        source=source,
        courses=tuple(
            LMSCourseRecord(ref=ExternalRef(provider, identifier), name=name, code=code)
            for identifier, name, code in courses
        ),
        assignments=tuple(
            LMSAssignmentRecord(
                ref=ExternalRef(provider, identifier),
                course_ref=ExternalRef(provider, course_id),
                title=title,
                deadline=deadline,
                estimated_effort=(
                    timedelta(minutes=effort_minutes) if effort_minutes is not None else None
                ),
            )
            for identifier, course_id, title, deadline, effort_minutes in assignments
        ),
        submissions=tuple(
            LMSSubmissionRecord(
                assignment_ref=ExternalRef(provider, assignment_id),
                status=status,
                submitted_at=submitted_at,
            )
            for assignment_id, status, submitted_at in submissions
        ),
    )

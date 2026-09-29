"""PostgreSQL-backed user-provided academic data exposed through LMSProvider semantics."""

from collections.abc import Callable, Collection
from datetime import UTC, datetime
from uuid import UUID, uuid5

from sqlalchemy import select
from sqlalchemy.orm import Session

from haui_compass.application.academic_import import (
    AcademicDataSet,
    AcademicImportError,
    AcademicImportErrorCode,
)
from haui_compass.application.lms_mapping import assignment_id_for, student_id_for
from haui_compass.application.ports.lms import (
    ExternalRef,
    LMSAssignmentRecord,
    LMSCourseRecord,
    LMSEntity,
    LMSNotFoundError,
    LMSSubmissionRecord,
    SubmissionStatus,
)
from haui_compass.infrastructure.persistence.postgres.mapping import duration, seconds, utc
from haui_compass.infrastructure.persistence.postgres.models import (
    AcademicSourceRow,
    ImportedAssignmentRow,
    ImportedCourseRow,
    ImportedSubmissionRow,
    TaskRow,
)

_NAMESPACE = UUID("96a1b239-1c22-4f10-b838-d133208d2edf")


class PostgresImportedAcademicDataProvider:
    def __init__(self, session_provider: Callable[[], Session]) -> None:
        self._session_provider = session_provider

    def _session(self) -> Session:
        return self._session_provider()

    def replace(self, dataset: AcademicDataSet) -> bool:
        session = self._session()
        existing = self._source(dataset.student)
        if existing is not None:
            if self._dataset(existing) == dataset:
                return True
            raise AcademicImportError(
                AcademicImportErrorCode.CONFLICT,
                "academic data already exists for this student and source; "
                "clear it before replacing",
            )
        source = AcademicSourceRow(
            source_id=uuid5(_NAMESPACE, f"source|{dataset.student}"),
            student_id=student_id_for(dataset.student),
            source=dataset.source.value,
            student_external_id=dataset.student.id,
            imported_at=datetime.now(UTC),
        )
        session.add(source)
        session.flush()
        course_rows: dict[ExternalRef, ImportedCourseRow] = {}
        for course in dataset.courses:
            course_row = ImportedCourseRow(
                course_id=uuid5(_NAMESPACE, f"course|{dataset.student}|{course.ref}"),
                source_id=source.source_id,
                external_id=course.ref.id,
                name=course.name,
                code=course.code,
            )
            course_rows[course.ref] = course_row
            session.add(course_row)
        session.flush()
        assignment_rows: dict[ExternalRef, ImportedAssignmentRow] = {}
        for assignment in dataset.assignments:
            assignment_row = ImportedAssignmentRow(
                assignment_id=uuid5(_NAMESPACE, f"assignment|{dataset.student}|{assignment.ref}"),
                source_id=source.source_id,
                course_id=course_rows[assignment.course_ref].course_id,
                external_id=assignment.ref.id,
                title=assignment.title,
                deadline=utc(assignment.deadline) if assignment.deadline else None,
                estimated_seconds=(
                    seconds(assignment.estimated_effort) if assignment.estimated_effort else None
                ),
            )
            assignment_rows[assignment.ref] = assignment_row
            session.add(assignment_row)
        session.flush()
        for submission in dataset.submissions:
            session.add(
                ImportedSubmissionRow(
                    submission_id=uuid5(
                        _NAMESPACE,
                        f"submission|{dataset.student}|{submission.assignment_ref}",
                    ),
                    assignment_id=assignment_rows[submission.assignment_ref].assignment_id,
                    status=submission.status.value,
                    submitted_at=utc(submission.submitted_at) if submission.submitted_at else None,
                )
            )
        session.flush()
        return False

    def clear(self, student: ExternalRef) -> bool:
        source = self._source(student)
        if source is None:
            return False
        assignment_ids = [
            assignment_id_for(ExternalRef(student.provider, row.external_id))
            for row in self._session().scalars(
                select(ImportedAssignmentRow).where(
                    ImportedAssignmentRow.source_id == source.source_id
                )
            )
        ]
        if assignment_ids and self._session().scalar(
            select(TaskRow.task_id).where(
                TaskRow.student_id == student_id_for(student),
                TaskRow.assignment_id.in_(assignment_ids),
            )
        ):
            raise AcademicImportError(
                AcademicImportErrorCode.CONFLICT,
                "academic data has study tasks; clearing it would leave those tasks orphaned",
            )
        submissions = self._session().scalars(
            select(ImportedSubmissionRow)
            .join(ImportedAssignmentRow)
            .where(ImportedAssignmentRow.source_id == source.source_id)
        )
        for submission_row in submissions:
            self._session().delete(submission_row)
        self._session().flush()
        for assignment_row in self._session().scalars(
            select(ImportedAssignmentRow).where(ImportedAssignmentRow.source_id == source.source_id)
        ):
            self._session().delete(assignment_row)
        self._session().flush()
        for course_row in self._session().scalars(
            select(ImportedCourseRow).where(ImportedCourseRow.source_id == source.source_id)
        ):
            self._session().delete(course_row)
        self._session().flush()
        self._session().delete(source)
        return True

    def dataset(self, student: ExternalRef) -> AcademicDataSet | None:
        source = self._source(student)
        return self._dataset(source) if source is not None else None

    def get_courses(self, student: ExternalRef) -> tuple[LMSCourseRecord, ...]:
        dataset = self._required(student)
        return dataset.courses

    def get_assignments(
        self, student: ExternalRef, *, courses: Collection[ExternalRef] | None = None
    ) -> tuple[LMSAssignmentRecord, ...]:
        dataset = self._required(student)
        if courses is None:
            return dataset.assignments
        known = {item.ref for item in dataset.courses}
        for course in courses:
            if course not in known:
                raise LMSNotFoundError(LMSEntity.COURSE, course)
        return tuple(item for item in dataset.assignments if item.course_ref in set(courses))

    def get_submission_statuses(
        self, student: ExternalRef, *, assignments: Collection[ExternalRef] | None = None
    ) -> tuple[LMSSubmissionRecord, ...]:
        dataset = self._required(student)
        if assignments is None:
            return dataset.submissions
        known = {item.ref for item in dataset.assignments}
        for assignment in assignments:
            if assignment not in known:
                raise LMSNotFoundError(LMSEntity.ASSIGNMENT, assignment)
        return tuple(
            item for item in dataset.submissions if item.assignment_ref in set(assignments)
        )

    def _source(self, student: ExternalRef) -> AcademicSourceRow | None:
        return self._session().scalar(
            select(AcademicSourceRow).where(
                AcademicSourceRow.student_id == student_id_for(student),
                AcademicSourceRow.source == student.provider,
            )
        )

    def _required(self, student: ExternalRef) -> AcademicDataSet:
        dataset = self.dataset(student)
        if dataset is None:
            raise LMSNotFoundError(LMSEntity.STUDENT, student)
        return dataset

    def _dataset(self, source: AcademicSourceRow) -> AcademicDataSet:
        from haui_compass.application.academic_import import AcademicSource

        courses = tuple(
            LMSCourseRecord(
                ref=ExternalRef(source.source, row.external_id), name=row.name, code=row.code
            )
            for row in self._session().scalars(
                select(ImportedCourseRow)
                .where(ImportedCourseRow.source_id == source.source_id)
                .order_by(ImportedCourseRow.external_id)
            )
        )
        course_refs = {
            row.course_id: ExternalRef(source.source, row.external_id)
            for row in self._session().scalars(
                select(ImportedCourseRow).where(ImportedCourseRow.source_id == source.source_id)
            )
        }
        assignment_rows = tuple(
            self._session().scalars(
                select(ImportedAssignmentRow)
                .where(ImportedAssignmentRow.source_id == source.source_id)
                .order_by(ImportedAssignmentRow.external_id)
            )
        )
        assignments = tuple(
            LMSAssignmentRecord(
                ref=ExternalRef(source.source, row.external_id),
                course_ref=course_refs[row.course_id],
                title=row.title,
                deadline=utc(row.deadline) if row.deadline else None,
                estimated_effort=duration(row.estimated_seconds)
                if row.estimated_seconds is not None
                else None,
            )
            for row in assignment_rows
        )
        assignment_refs = {
            row.assignment_id: ExternalRef(source.source, row.external_id)
            for row in assignment_rows
        }
        submissions = tuple(
            LMSSubmissionRecord(
                assignment_ref=assignment_refs[row.assignment_id],
                status=SubmissionStatus(row.status),
                submitted_at=utc(row.submitted_at) if row.submitted_at else None,
            )
            for row in self._session().scalars(
                select(ImportedSubmissionRow)
                .join(ImportedAssignmentRow)
                .where(ImportedAssignmentRow.source_id == source.source_id)
                .order_by(ImportedSubmissionRow.assignment_id)
            )
        )
        return AcademicDataSet(
            student=ExternalRef(source.source, source.student_external_id),
            source=AcademicSource(source.source),
            courses=courses,
            assignments=assignments,
            submissions=submissions,
        )

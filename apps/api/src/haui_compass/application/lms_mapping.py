"""Explicit mapping from normalized LMS records to domain types.

Mapping lives here, not in domain entities and not in infrastructure adapters. It never invents a
value the LMS did not provide.

Identifiers: domain ids are derived deterministically from ``ExternalRef`` with ``uuid5``. That is
a stateless v0 strategy: the same LMS entity always maps to the same domain id, so repeated syncs
are idempotent without a database. It is not an identity-resolution system. When persistence
exists, a stored external-to-internal mapping can replace ``*_id_for`` without touching callers,
and provenance (which external record a domain object came from) is returned alongside the domain
object rather than added to it.

Not mapped, on purpose: course codes (``Course`` has no code), submission state (there is no
domain ``Submission`` yet), and tasks (an LMS assignment is not a task; decomposition is a
separate concern).
"""

from collections.abc import Iterable
from dataclasses import dataclass
from enum import StrEnum
from uuid import UUID, uuid5

from haui_compass.application.ports.lms import ExternalRef, LMSAssignmentRecord, LMSCourseRecord
from haui_compass.domain.assignments.assignment import Assignment, AssignmentId
from haui_compass.domain.courses.course import Course, CourseId
from haui_compass.domain.students.ids import StudentId

# Fixed namespace for deriving ids. Changing it would change every derived id.
_NAMESPACE = UUID("6f1d3c0e-8a52-4b7e-9c41-2d0a5b8e7f13")


def _derive(kind: str, ref: ExternalRef) -> UUID:
    # ``kind`` keeps a course and an assignment with the same external id apart.
    return uuid5(_NAMESPACE, f"{kind}|{ref.provider}|{ref.id}")


def student_id_for(ref: ExternalRef) -> StudentId:
    return StudentId(_derive("student", ref))


def course_id_for(ref: ExternalRef) -> CourseId:
    return CourseId(_derive("course", ref))


def assignment_id_for(ref: ExternalRef) -> AssignmentId:
    return AssignmentId(_derive("assignment", ref))


@dataclass(frozen=True, slots=True)
class MappedCourse:
    course: Course
    source: ExternalRef


@dataclass(frozen=True, slots=True)
class MappedAssignment:
    assignment: Assignment
    source: ExternalRef


class SkipReason(StrEnum):
    NO_DEADLINE = "no_deadline"  # a domain Assignment requires a deadline


@dataclass(frozen=True, slots=True)
class SkippedAssignment:
    source: ExternalRef
    reason: SkipReason


@dataclass(frozen=True, slots=True)
class AssignmentMapping:
    """Assignments that could be mapped, and the ones that could not, with the reason."""

    mapped: tuple[MappedAssignment, ...]
    skipped: tuple[SkippedAssignment, ...]


def map_course(record: LMSCourseRecord) -> MappedCourse:
    return MappedCourse(
        course=Course(id=course_id_for(record.ref), name=record.name), source=record.ref
    )


def map_assignments(records: Iterable[LMSAssignmentRecord]) -> AssignmentMapping:
    """Map records in order. An assignment without a deadline is skipped, not given a made-up one.

    ``estimated_effort`` is passed through exactly as provided, including ``None`` (unknown).
    """
    mapped: list[MappedAssignment] = []
    skipped: list[SkippedAssignment] = []
    for record in records:
        if record.deadline is None:
            skipped.append(SkippedAssignment(source=record.ref, reason=SkipReason.NO_DEADLINE))
            continue
        mapped.append(
            MappedAssignment(
                assignment=Assignment(
                    id=assignment_id_for(record.ref),
                    course_id=course_id_for(record.course_ref),
                    title=record.title,
                    deadline=record.deadline,
                    estimated_effort=record.estimated_effort,
                ),
                source=record.ref,
            )
        )
    return AssignmentMapping(mapped=tuple(mapped), skipped=tuple(skipped))

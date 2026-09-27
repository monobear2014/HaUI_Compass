"""Canonical fictional scenario for MockLMSProvider. Synthetic data, not a real student or course.

Deadlines are offsets from an explicit ``anchor`` instant, so the scenario is deterministic and can
be replayed at any time. The LMS emits local Hanoi times (UTC+07:00); the records normalise them to
UTC. ``estimated_effort`` is SYNTHETIC planning data supplied by the mock so later slices can
exercise the risk engine: a real LMS does not usually provide it.
"""

from datetime import datetime, timedelta, timezone

from haui_compass.application.ports.lms import (
    ExternalRef,
    LMSAssignmentRecord,
    LMSCourseRecord,
    LMSSubmissionRecord,
    SubmissionStatus,
)
from haui_compass.domain.shared.validation import require_aware_utc

PROVIDER = "mock-lms"
HANOI = timezone(timedelta(hours=7))  # Vietnam has no daylight saving time

MAIN_STUDENT = ExternalRef(PROVIDER, "student-001")
OTHER_STUDENT = ExternalRef(PROVIDER, "student-002")

MockStudentRecords = tuple[
    tuple[LMSCourseRecord, ...],
    tuple[LMSAssignmentRecord, ...],
    tuple[LMSSubmissionRecord, ...],
]


def _ref(kind_id: str) -> ExternalRef:
    return ExternalRef(PROVIDER, kind_id)


def canonical_students(anchor: datetime) -> dict[ExternalRef, MockStudentRecords]:
    """The scenario for two fictional students, relative to ``anchor`` (timezone-aware)."""
    anchor = require_aware_utc(anchor, "anchor")

    def due(**offset: float) -> datetime:
        return (anchor + timedelta(**offset)).astimezone(HANOI)

    def assignment(
        key: str,
        course: str,
        title: str,
        deadline: datetime | None,
        effort_hours: float | None,
    ) -> LMSAssignmentRecord:
        return LMSAssignmentRecord(
            ref=_ref(key),
            course_ref=_ref(course),
            title=title,
            deadline=deadline,
            estimated_effort=None if effort_hours is None else timedelta(hours=effort_hours),
        )

    courses = (
        LMSCourseRecord(ref=_ref("course-ml"), name="Machine Learning", code="MOCK-ML"),
        LMSCourseRecord(ref=_ref("course-db"), name="Database Systems", code="MOCK-DB"),
        LMSCourseRecord(ref=_ref("course-en"), name="English", code="MOCK-EN"),
    )
    assignments = (
        # Machine Learning: one due soon, one later.
        assignment("ml-a", "course-ml", "Assignment A: Linear regression", due(hours=36), 6),
        assignment("ml-b", "course-ml", "Assignment B: Model evaluation report", due(days=12), 10),
        # Database Systems: one open, one already handed in.
        assignment("db-c", "course-db", "Assignment C: Normalisation exercises", due(days=5), 4),
        assignment("db-lab2", "course-db", "Lab 2: SQL joins", due(days=-2), 3),
        # English: unknown effort, overdue, handed in late, and no due date yet.
        assignment("en-d", "course-en", "Assignment D: Presentation outline", due(days=3), None),
        assignment("en-read3", "course-en", "Reading response 3", due(days=-1), 2),
        assignment("en-essay", "course-en", "Essay draft", due(days=-4), 5),
        assignment("en-portfolio", "course-en", "Portfolio", None, None),
    )
    submissions = (
        _submission("ml-a", SubmissionStatus.NOT_SUBMITTED),
        _submission("ml-b", SubmissionStatus.UNKNOWN),  # the LMS reports nothing for this one
        _submission("db-c", SubmissionStatus.NOT_SUBMITTED),
        _submission("db-lab2", SubmissionStatus.SUBMITTED, due(days=-2, hours=-3)),
        _submission("en-d", SubmissionStatus.NOT_SUBMITTED),
        _submission("en-read3", SubmissionStatus.NOT_SUBMITTED),  # overdue and still open
        _submission("en-essay", SubmissionStatus.LATE, due(days=-4, hours=5)),
        _submission("en-portfolio", SubmissionStatus.NOT_SUBMITTED),
    )

    other_courses = (LMSCourseRecord(ref=_ref("course-phy"), name="Physics", code="MOCK-PHY"),)
    other_assignments = (assignment("phy-1", "course-phy", "Problem set 1", due(days=2), 3),)
    other_submissions = (_submission("phy-1", SubmissionStatus.NOT_SUBMITTED),)

    return {
        MAIN_STUDENT: (courses, assignments, submissions),
        OTHER_STUDENT: (other_courses, other_assignments, other_submissions),
    }


def _submission(
    key: str, status: SubmissionStatus, submitted_at: datetime | None = None
) -> LMSSubmissionRecord:
    return LMSSubmissionRecord(assignment_ref=_ref(key), status=status, submitted_at=submitted_at)

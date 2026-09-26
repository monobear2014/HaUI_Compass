from datetime import UTC, datetime, timedelta, timezone
from uuid import UUID

import pytest

from haui_compass.domain.assignments.assignment import Assignment, AssignmentId
from haui_compass.domain.courses.course import CourseId
from haui_compass.domain.shared.errors import DomainValidationError

ASSIGNMENT_ID = AssignmentId(UUID(int=2))
COURSE_ID = CourseId(UUID(int=1))
DEADLINE = datetime(2026, 10, 1, 16, 59, tzinfo=UTC)


def make(**overrides: object) -> Assignment:
    values: dict[str, object] = {
        "id": ASSIGNMENT_ID,
        "course_id": COURSE_ID,
        "title": "Lab report 1",
        "deadline": DEADLINE,
    }
    values.update(overrides)
    return Assignment(**values)  # type: ignore[arg-type]


def test_assignment_holds_its_values() -> None:
    assignment = make(estimated_effort=timedelta(hours=3))
    assert assignment.course_id == COURSE_ID
    assert assignment.title == "Lab report 1"
    assert assignment.deadline == DEADLINE
    assert assignment.estimated_effort == timedelta(hours=3)


def test_estimated_effort_is_optional() -> None:
    assert make().estimated_effort is None


def test_naive_deadline_is_rejected() -> None:
    with pytest.raises(DomainValidationError, match="timezone-aware"):
        make(deadline=datetime(2026, 10, 1, 23, 59))


def test_deadline_is_normalised_to_utc() -> None:
    hanoi = timezone(timedelta(hours=7))
    assignment = make(deadline=datetime(2026, 10, 1, 23, 59, tzinfo=hanoi))
    assert assignment.deadline == DEADLINE
    assert assignment.deadline.utcoffset() == timedelta(0)


def test_blank_title_is_rejected() -> None:
    with pytest.raises(DomainValidationError):
        make(title=" ")


def test_negative_estimated_effort_is_rejected() -> None:
    with pytest.raises(DomainValidationError, match="must not be negative"):
        make(estimated_effort=timedelta(minutes=-5))

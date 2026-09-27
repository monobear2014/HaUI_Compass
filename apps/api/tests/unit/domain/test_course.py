from uuid import UUID

import pytest

from haui_compass.domain.courses.course import Course, CourseId
from haui_compass.domain.shared.errors import DomainValidationError

COURSE_ID = CourseId(UUID(int=1))


def test_course_holds_its_values() -> None:
    course = Course(id=COURSE_ID, name="Computer Networks")
    assert course.id == COURSE_ID
    assert course.name == "Computer Networks"


def test_course_name_is_stripped() -> None:
    assert Course(id=COURSE_ID, name="  Databases ").name == "Databases"


def test_blank_course_name_is_rejected() -> None:
    with pytest.raises(DomainValidationError):
        Course(id=COURSE_ID, name="  ")


def test_course_is_immutable() -> None:
    course = Course(id=COURSE_ID, name="Databases")
    with pytest.raises(AttributeError):
        course.name = "Other"  # type: ignore[misc]

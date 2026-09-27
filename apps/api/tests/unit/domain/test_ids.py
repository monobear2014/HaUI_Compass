from uuid import UUID

from haui_compass.domain.assignments.assignment import AssignmentId
from haui_compass.domain.courses.course import CourseId
from haui_compass.domain.students.ids import StudentId
from haui_compass.domain.tasks.task import TaskId


def test_ids_are_plain_uuids_at_runtime() -> None:
    raw = UUID(int=1)
    for make in (StudentId, CourseId, AssignmentId, TaskId):
        value = make(raw)
        assert value == raw
        assert isinstance(value, UUID)


def test_ids_are_hashable_dictionary_keys() -> None:
    course_id = CourseId(UUID(int=1))
    assert {course_id: "course"}[CourseId(UUID(int=1))] == "course"

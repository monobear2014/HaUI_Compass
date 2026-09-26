from datetime import timedelta
from uuid import UUID

import pytest

from haui_compass.domain.assignments.assignment import AssignmentId
from haui_compass.domain.shared.errors import DomainValidationError
from haui_compass.domain.tasks.task import Task, TaskId, TaskStatus

TASK_ID = TaskId(UUID(int=3))
ASSIGNMENT_ID = AssignmentId(UUID(int=2))


def make(**overrides: object) -> Task:
    values: dict[str, object] = {
        "id": TASK_ID,
        "assignment_id": ASSIGNMENT_ID,
        "title": "Draft introduction",
        "estimated_duration": timedelta(minutes=45),
    }
    values.update(overrides)
    return Task(**values)  # type: ignore[arg-type]


def test_task_defaults_to_not_started() -> None:
    task = make()
    assert task.status is TaskStatus.NOT_STARTED
    assert task.estimated_duration == timedelta(minutes=45)


def test_task_can_be_created_with_another_status() -> None:
    assert make(status=TaskStatus.COMPLETED).status is TaskStatus.COMPLETED


def test_negative_duration_is_rejected() -> None:
    with pytest.raises(DomainValidationError, match="must not be negative"):
        make(estimated_duration=timedelta(minutes=-1))


def test_blank_title_is_rejected() -> None:
    with pytest.raises(DomainValidationError):
        make(title="")


def test_task_is_immutable() -> None:
    task = make()
    with pytest.raises(AttributeError):
        task.status = TaskStatus.COMPLETED  # type: ignore[misc]

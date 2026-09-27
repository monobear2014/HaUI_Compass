"""Task: an action-sized unit of work, usually decomposed from an assignment."""

from dataclasses import dataclass
from datetime import timedelta
from enum import StrEnum
from typing import NewType
from uuid import UUID

from haui_compass.domain.assignments.assignment import AssignmentId
from haui_compass.domain.shared.validation import require_non_blank, require_non_negative

TaskId = NewType("TaskId", UUID)


class TaskStatus(StrEnum):
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


@dataclass(frozen=True, slots=True, kw_only=True)
class Task:
    id: TaskId
    assignment_id: AssignmentId
    title: str
    estimated_duration: timedelta
    status: TaskStatus = TaskStatus.NOT_STARTED

    def __post_init__(self) -> None:
        object.__setattr__(self, "title", require_non_blank(self.title, "Task.title"))
        require_non_negative(self.estimated_duration, "Task.estimated_duration")

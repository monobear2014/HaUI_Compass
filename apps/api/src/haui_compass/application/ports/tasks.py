"""Persistence contract for HaUI Compass-owned task state."""

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from haui_compass.domain.shared.validation import require_aware_utc
from haui_compass.domain.students.ids import StudentId
from haui_compass.domain.tasks.task import Task, TaskId


@dataclass(frozen=True, slots=True, kw_only=True)
class StoredTask:
    """Explicit ownership envelope; ``Task`` deliberately has no inferred student identity."""

    student_id: StudentId
    task: Task
    saved_at: datetime

    def __post_init__(self) -> None:
        object.__setattr__(
            self, "saved_at", require_aware_utc(self.saved_at, "StoredTask.saved_at")
        )


class TaskRepository(Protocol):
    def save(self, record: StoredTask) -> StoredTask:
        """Insert or replace current immutable task state for its explicit owner."""
        ...

    def get(self, student_id: StudentId, task_id: TaskId) -> StoredTask | None: ...

    def list_for_student(self, student_id: StudentId) -> tuple[StoredTask, ...]: ...

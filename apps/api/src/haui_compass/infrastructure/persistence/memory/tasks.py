"""In-memory current-state task persistence with explicit student ownership."""

from haui_compass.application.ports.persistence import (
    PersistenceError,
    PersistenceErrorCode,
)
from haui_compass.application.ports.tasks import StoredTask
from haui_compass.domain.students.ids import StudentId
from haui_compass.domain.tasks.task import TaskId


class InMemoryTaskRepository:
    def __init__(self) -> None:
        self._records: dict[TaskId, StoredTask] = {}

    def save(self, record: StoredTask) -> StoredTask:
        existing = self._records.get(record.task.id)
        if existing is not None and existing.student_id != record.student_id:
            raise PersistenceError(
                PersistenceErrorCode.OWNERSHIP_CONFLICT,
                f"task {record.task.id} already belongs to another student",
            )
        self._records[record.task.id] = record
        return record

    def get(self, student_id: StudentId, task_id: TaskId) -> StoredTask | None:
        record = self._records.get(task_id)
        return record if record is not None and record.student_id == student_id else None

    def list_for_student(self, student_id: StudentId) -> tuple[StoredTask, ...]:
        return tuple(
            sorted(
                (record for record in self._records.values() if record.student_id == student_id),
                key=lambda record: record.task.id,
            )
        )

"""In-memory append-only task-execution persistence."""

from haui_compass.application.ports.executions import (
    ExecutionRecordId,
    StoredTaskExecution,
)
from haui_compass.application.ports.persistence import (
    PersistenceError,
    PersistenceErrorCode,
)
from haui_compass.domain.students.ids import StudentId
from haui_compass.domain.tasks.task import TaskId


class InMemoryTaskExecutionRepository:
    def __init__(self) -> None:
        self._records: dict[ExecutionRecordId, StoredTaskExecution] = {}

    def append(self, record: StoredTaskExecution) -> StoredTaskExecution:
        existing = self._records.get(record.record_id)
        if existing is not None:
            if existing == record:
                return existing
            raise PersistenceError(
                PersistenceErrorCode.RECORD_CONFLICT,
                f"execution record id {record.record_id} already has different content",
            )
        self._records[record.record_id] = record
        return record

    def get(self, record_id: ExecutionRecordId) -> StoredTaskExecution | None:
        return self._records.get(record_id)

    def list_for_task(
        self, student_id: StudentId, task_id: TaskId
    ) -> tuple[StoredTaskExecution, ...]:
        return tuple(
            sorted(
                (
                    record
                    for record in self._records.values()
                    if record.student_id == student_id and record.execution.task_id == task_id
                ),
                key=lambda record: (
                    record.execution.started_at,
                    record.execution.ended_at,
                    record.record_id,
                ),
            )
        )

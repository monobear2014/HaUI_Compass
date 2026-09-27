"""Append-oriented persistence contract for observed task executions."""

from dataclasses import dataclass
from datetime import datetime
from typing import NewType, Protocol
from uuid import UUID

from haui_compass.domain.shared.errors import DomainValidationError
from haui_compass.domain.shared.validation import require_aware_utc
from haui_compass.domain.students.ids import StudentId
from haui_compass.domain.tasks.execution import TaskExecution
from haui_compass.domain.tasks.task import TaskId

ExecutionRecordId = NewType("ExecutionRecordId", UUID)


@dataclass(frozen=True, slots=True, kw_only=True)
class StoredTaskExecution:
    record_id: ExecutionRecordId
    student_id: StudentId
    execution: TaskExecution
    recorded_at: datetime

    def __post_init__(self) -> None:
        object.__setattr__(
            self,
            "recorded_at",
            require_aware_utc(self.recorded_at, "StoredTaskExecution.recorded_at"),
        )
        if self.recorded_at < self.execution.ended_at:
            raise DomainValidationError(
                "StoredTaskExecution.recorded_at must not precede execution end"
            )


class TaskExecutionRepository(Protocol):
    def append(self, record: StoredTaskExecution) -> StoredTaskExecution:
        """Append once; an identical record-id retry is idempotent."""
        ...

    def get(self, record_id: ExecutionRecordId) -> StoredTaskExecution | None: ...

    def list_for_task(
        self, student_id: StudentId, task_id: TaskId
    ) -> tuple[StoredTaskExecution, ...]: ...

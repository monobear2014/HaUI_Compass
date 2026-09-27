"""Application workflow that records an execution and persists the task transition."""

from dataclasses import dataclass
from datetime import datetime

from haui_compass.application.lms_mapping import student_id_for
from haui_compass.application.ports.clock import Clock
from haui_compass.application.ports.executions import (
    ExecutionRecordId,
    StoredTaskExecution,
    TaskExecutionRepository,
)
from haui_compass.application.ports.lms import ExternalRef
from haui_compass.application.ports.persistence import PersistenceError, PersistenceErrorCode
from haui_compass.application.ports.tasks import StoredTask, TaskRepository
from haui_compass.application.use_cases.record_task_execution import (
    RecordTaskExecution,
    RecordTaskExecutionRequest,
)
from haui_compass.domain.tasks.execution import ExecutionOutcome, TaskExecution
from haui_compass.domain.tasks.task import TaskId


@dataclass(frozen=True, slots=True, kw_only=True)
class RecordPersistedTaskExecutionRequest:
    student: ExternalRef
    task_id: TaskId
    record_id: ExecutionRecordId
    started_at: datetime
    ended_at: datetime
    outcome: ExecutionOutcome


@dataclass(frozen=True, slots=True, kw_only=True)
class RecordPersistedTaskExecutionResult:
    record: StoredTaskExecution
    updated_task: StoredTask
    idempotent_retry: bool


class RecordPersistedTaskExecution:
    """Append execution, then save the task snapshot; no cross-repository transaction."""

    def __init__(
        self,
        *,
        clock: Clock,
        task_repository: TaskRepository,
        execution_repository: TaskExecutionRepository,
        recorder: RecordTaskExecution | None = None,
    ) -> None:
        self._clock = clock
        self._task_repository = task_repository
        self._execution_repository = execution_repository
        self._recorder = recorder or RecordTaskExecution()

    def execute(
        self, request: RecordPersistedTaskExecutionRequest
    ) -> RecordPersistedTaskExecutionResult:
        student_id = student_id_for(request.student)
        current = self._task_repository.get(student_id, request.task_id)
        if current is None:
            raise PersistenceError(
                PersistenceErrorCode.RECORD_NOT_FOUND,
                "Task was not found for this student",
            )

        existing = self._execution_repository.get(request.record_id)
        if existing is not None:
            expected = TaskExecution(
                task_id=request.task_id,
                started_at=request.started_at,
                ended_at=request.ended_at,
                outcome=request.outcome,
            )
            if existing.student_id != student_id or existing.execution != expected:
                raise PersistenceError(
                    PersistenceErrorCode.RECORD_CONFLICT,
                    "Execution record id is already used for different content",
                )
            return RecordPersistedTaskExecutionResult(
                record=existing,
                updated_task=current,
                idempotent_retry=True,
            )

        result = self._recorder.execute(
            RecordTaskExecutionRequest(
                task=current.task,
                started_at=request.started_at,
                ended_at=request.ended_at,
                outcome=request.outcome,
            )
        )
        saved_at = self._clock.now()
        record = StoredTaskExecution(
            record_id=request.record_id,
            student_id=student_id,
            execution=result.execution,
            recorded_at=saved_at,
        )
        self._execution_repository.append(record)
        updated = self._task_repository.save(
            StoredTask(student_id=student_id, task=result.updated_task, saved_at=saved_at)
        )
        return RecordPersistedTaskExecutionResult(
            record=record,
            updated_task=updated,
            idempotent_retry=False,
        )

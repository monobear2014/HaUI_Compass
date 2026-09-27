from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest

from haui_compass.application.lms_mapping import student_id_for
from haui_compass.application.ports.executions import ExecutionRecordId
from haui_compass.application.ports.lms import ExternalRef
from haui_compass.application.ports.tasks import StoredTask
from haui_compass.application.use_cases.record_persisted_task_execution import (
    RecordPersistedTaskExecution,
    RecordPersistedTaskExecutionRequest,
)
from haui_compass.domain.tasks.execution import ExecutionOutcome
from haui_compass.infrastructure.persistence.memory import (
    InMemoryTaskExecutionRepository,
    InMemoryTaskRepository,
)
from haui_compass.infrastructure.persistence.memory.transactions import (
    InMemoryPersistenceTransactionManager,
)
from support.builders import make_task
from support.clocks import FixedClock

NOW = datetime(2026, 10, 5, 8, tzinfo=UTC)
STUDENT = ExternalRef("test", "student")


class FailingTaskRepository(InMemoryTaskRepository):
    def save(self, record: StoredTask) -> StoredTask:
        super().save(record)
        raise RuntimeError("simulated task write failure")


def test_execution_and_task_update_roll_back_together() -> None:
    tasks = FailingTaskRepository()
    executions = InMemoryTaskExecutionRepository()
    task = make_task(1, 1)
    tasks._records[task.id] = StoredTask(
        student_id=student_id_for(STUDENT), task=task, saved_at=NOW
    )
    workflow = RecordPersistedTaskExecution(
        clock=FixedClock(NOW),
        task_repository=tasks,
        execution_repository=executions,
        transaction_manager=InMemoryPersistenceTransactionManager(tasks, executions),
    )
    request = RecordPersistedTaskExecutionRequest(
        student=STUDENT,
        task_id=task.id,
        record_id=ExecutionRecordId(UUID(int=55)),
        started_at=NOW - timedelta(minutes=30),
        ended_at=NOW - timedelta(minutes=5),
        outcome=ExecutionOutcome.COMPLETED,
    )
    with pytest.raises(RuntimeError, match="simulated task write failure"):
        workflow.execute(request)
    assert executions.get(request.record_id) is None
    assert tasks.get(student_id_for(STUDENT), task.id).task == task  # type: ignore[union-attr]

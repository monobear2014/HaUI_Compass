from collections.abc import Callable

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from haui_compass.application.ports.executions import (
    ExecutionRecordId,
    StoredTaskExecution,
)
from haui_compass.application.ports.persistence import PersistenceError, PersistenceErrorCode
from haui_compass.domain.students.ids import StudentId
from haui_compass.domain.tasks.execution import ExecutionOutcome, TaskExecution
from haui_compass.domain.tasks.task import TaskId
from haui_compass.infrastructure.persistence.postgres.mapping import utc
from haui_compass.infrastructure.persistence.postgres.models import ExecutionRow


class PostgresTaskExecutionRepository:
    def __init__(self, session_provider: Callable[[], Session]) -> None:
        self._session_provider = session_provider

    def _session(self) -> Session:
        return self._session_provider()

    def append(self, record: StoredTaskExecution) -> StoredTaskExecution:
        session = self._session()
        row = ExecutionRow(
            record_id=record.record_id,
            student_id=record.student_id,
            task_id=record.execution.task_id,
            started_at=utc(record.execution.started_at),
            ended_at=utc(record.execution.ended_at),
            outcome=record.execution.outcome.value,
            recorded_at=utc(record.recorded_at),
        )
        try:
            with session.begin_nested():
                session.add(row)
                session.flush()
        except IntegrityError:
            existing = session.get(ExecutionRow, record.record_id)
            if existing is not None:
                found = self._to_domain(existing)
                if found == record:
                    return found
                raise PersistenceError(
                    PersistenceErrorCode.RECORD_CONFLICT,
                    "execution record id already has different content",
                ) from None
            raise
        return record

    def get(self, record_id: ExecutionRecordId) -> StoredTaskExecution | None:
        row = self._session().get(ExecutionRow, record_id)
        return None if row is None else self._to_domain(row)

    def list_for_task(
        self, student_id: StudentId, task_id: TaskId
    ) -> tuple[StoredTaskExecution, ...]:
        rows = self._session().scalars(
            select(ExecutionRow)
            .where(ExecutionRow.student_id == student_id, ExecutionRow.task_id == task_id)
            .order_by(ExecutionRow.started_at, ExecutionRow.ended_at, ExecutionRow.record_id)
        )
        return tuple(self._to_domain(row) for row in rows)

    @staticmethod
    def _to_domain(row: ExecutionRow) -> StoredTaskExecution:
        return StoredTaskExecution(
            record_id=ExecutionRecordId(row.record_id),
            student_id=StudentId(row.student_id),
            execution=TaskExecution(
                task_id=TaskId(row.task_id),
                started_at=utc(row.started_at),
                ended_at=utc(row.ended_at),
                outcome=ExecutionOutcome(row.outcome),
            ),
            recorded_at=utc(row.recorded_at),
        )

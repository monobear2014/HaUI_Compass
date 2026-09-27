from collections.abc import Callable

from sqlalchemy import select
from sqlalchemy.orm import Session

from haui_compass.application.ports.persistence import PersistenceError, PersistenceErrorCode
from haui_compass.application.ports.tasks import StoredTask
from haui_compass.domain.assignments.assignment import AssignmentId
from haui_compass.domain.students.ids import StudentId
from haui_compass.domain.tasks.task import Task, TaskId, TaskStatus
from haui_compass.infrastructure.persistence.postgres.mapping import duration, seconds, utc
from haui_compass.infrastructure.persistence.postgres.models import TaskRow


class PostgresTaskRepository:
    def __init__(self, session_provider: Callable[[], Session]) -> None:
        self._session_provider = session_provider

    def _session(self) -> Session:
        return self._session_provider()

    def save(self, record: StoredTask) -> StoredTask:
        session = self._session()
        row = session.get(TaskRow, record.task.id)
        if row is not None and row.student_id != record.student_id:
            raise PersistenceError(
                PersistenceErrorCode.OWNERSHIP_CONFLICT,
                "task id belongs to a different student",
            )
        if row is None:
            row = TaskRow(task_id=record.task.id, student_id=record.student_id)
            session.add(row)
        row.assignment_id = record.task.assignment_id
        row.title = record.task.title
        row.estimated_seconds = seconds(record.task.estimated_duration)
        row.status = record.task.status.value
        row.saved_at = utc(record.saved_at)
        session.flush()
        return record

    def get(self, student_id: StudentId, task_id: TaskId) -> StoredTask | None:
        row = self._session().get(TaskRow, task_id)
        if row is None or row.student_id != student_id:
            return None
        return self._to_domain(row)

    def list_for_student(self, student_id: StudentId) -> tuple[StoredTask, ...]:
        rows = self._session().scalars(
            select(TaskRow).where(TaskRow.student_id == student_id).order_by(TaskRow.task_id)
        )
        return tuple(self._to_domain(row) for row in rows)

    @staticmethod
    def _to_domain(row: TaskRow) -> StoredTask:
        return StoredTask(
            student_id=StudentId(row.student_id),
            task=Task(
                id=TaskId(row.task_id),
                assignment_id=AssignmentId(row.assignment_id),
                title=row.title,
                estimated_duration=duration(row.estimated_seconds),
                status=TaskStatus(row.status),
            ),
            saved_at=utc(row.saved_at),
        )

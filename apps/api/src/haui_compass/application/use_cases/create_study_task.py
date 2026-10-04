"""Explicitly create one study task from an existing academic assignment."""

from dataclasses import dataclass
from datetime import timedelta

from haui_compass.application.lms_mapping import assignment_id_for, student_id_for
from haui_compass.application.ports.clock import Clock
from haui_compass.application.ports.lms import ExternalRef, LMSProvider
from haui_compass.application.ports.tasks import StoredTask, TaskRepository
from haui_compass.application.ports.transactions import PersistenceTransactionManager
from haui_compass.domain.tasks.task import Task, TaskId


@dataclass(frozen=True, slots=True, kw_only=True)
class CreateStudyTaskRequest:
    student: ExternalRef
    assignment: ExternalRef
    task_id: TaskId
    title: str
    estimated_duration: timedelta


class CreateStudyTask:
    def __init__(
        self,
        *,
        lms: LMSProvider,
        tasks: TaskRepository,
        clock: Clock,
        transaction_manager: PersistenceTransactionManager | None = None,
    ) -> None:
        self._lms = lms
        self._tasks = tasks
        self._clock = clock
        self._transactions = transaction_manager

    def execute(self, request: CreateStudyTaskRequest) -> StoredTask:
        if self._transactions is not None:
            return self._transactions.run(lambda: self._execute(request))
        return self._execute(request)

    def execute_many(self, requests: tuple[CreateStudyTaskRequest, ...]) -> tuple[StoredTask, ...]:
        """Create a validated batch through the same boundary and one transaction."""

        def operation() -> tuple[StoredTask, ...]:
            return tuple(self._execute(request) for request in requests)

        if self._transactions is not None:
            return self._transactions.run(operation)
        return operation()

    def _execute(self, request: CreateStudyTaskRequest) -> StoredTask:
        # The provider validates both student scope and assignment ownership; no assignment-to-task
        # conversion happens unless the student calls this explicit use case.
        self._lms.get_submission_statuses(request.student, assignments=[request.assignment])
        task = Task(
            id=request.task_id,
            assignment_id=assignment_id_for(request.assignment),
            title=request.title,
            estimated_duration=request.estimated_duration,
        )
        record = StoredTask(
            student_id=student_id_for(request.student), task=task, saved_at=self._clock.now()
        )
        return self._tasks.save(record)

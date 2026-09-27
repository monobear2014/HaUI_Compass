from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest

from haui_compass.application.use_cases.record_task_execution import (
    RecordTaskExecution,
    RecordTaskExecutionRequest,
)
from haui_compass.domain.assignments.assignment import AssignmentId
from haui_compass.domain.shared.errors import DomainValidationError
from haui_compass.domain.tasks.execution import ExecutionOutcome, TaskAlreadyCompletedError
from haui_compass.domain.tasks.task import Task, TaskId, TaskStatus

ASSIGNMENT_ID = AssignmentId(UUID(int=2))
START = datetime(2026, 10, 5, 19, 0, tzinfo=UTC)


def task(status: TaskStatus = TaskStatus.NOT_STARTED) -> Task:
    return Task(
        id=TaskId(UUID(int=1)),
        assignment_id=ASSIGNMENT_ID,
        title="Draft introduction",
        estimated_duration=timedelta(hours=1),
        status=status,
    )


def request(t: Task, **overrides: object) -> RecordTaskExecutionRequest:
    values: dict[str, object] = {
        "task": t,
        "started_at": START,
        "ended_at": START + timedelta(minutes=30),
        "outcome": ExecutionOutcome.PARTIAL,
    }
    values.update(overrides)
    return RecordTaskExecutionRequest(**values)  # type: ignore[arg-type]


def test_records_the_execution_and_updates_the_task() -> None:
    t = task()
    result = RecordTaskExecution().execute(request(t, outcome=ExecutionOutcome.COMPLETED))
    assert result.execution.task_id == t.id
    assert result.execution.actual_duration == timedelta(minutes=30)
    assert result.updated_task.status is TaskStatus.COMPLETED
    assert result.updated_task.id == t.id


def test_partial_moves_a_not_started_task_to_in_progress() -> None:
    result = RecordTaskExecution().execute(request(task()))
    assert result.updated_task.status is TaskStatus.IN_PROGRESS


def test_the_original_task_is_untouched() -> None:
    t = task()
    RecordTaskExecution().execute(request(t))
    assert t.status is TaskStatus.NOT_STARTED


def test_a_completed_task_rejects_the_request() -> None:
    with pytest.raises(TaskAlreadyCompletedError):
        RecordTaskExecution().execute(request(task(TaskStatus.COMPLETED)))


def test_an_invalid_interval_is_rejected() -> None:
    with pytest.raises(DomainValidationError, match="ended_at must be strictly after"):
        RecordTaskExecution().execute(request(task(), ended_at=START))


def test_a_naive_timestamp_is_rejected() -> None:
    with pytest.raises(DomainValidationError, match="timezone-aware"):
        RecordTaskExecution().execute(request(task(), started_at=datetime(2026, 10, 5, 19, 0)))

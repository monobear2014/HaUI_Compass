from datetime import UTC, datetime, timedelta, timezone
from uuid import UUID

import pytest

from haui_compass.domain.shared.errors import DomainValidationError
from haui_compass.domain.tasks.execution import (
    ExecutionOutcome,
    TaskExecution,
    TaskExecutionSummary,
)
from haui_compass.domain.tasks.task import TaskId

HANOI = timezone(timedelta(hours=7))
TASK_ID = TaskId(UUID(int=5))
START = datetime(2026, 10, 5, 19, 0, tzinfo=UTC)


def execution(**overrides: object) -> TaskExecution:
    values: dict[str, object] = {
        "task_id": TASK_ID,
        "started_at": START,
        "ended_at": START + timedelta(minutes=45),
        "outcome": ExecutionOutcome.PARTIAL,
    }
    values.update(overrides)
    return TaskExecution(**values)  # type: ignore[arg-type]


class TestTaskExecution:
    def test_holds_its_values_and_derives_duration(self) -> None:
        e = execution()
        assert e.task_id == TASK_ID
        assert e.actual_duration == timedelta(minutes=45)

    def test_is_immutable(self) -> None:
        with pytest.raises(AttributeError):
            execution().outcome = ExecutionOutcome.COMPLETED  # type: ignore[misc]

    def test_naive_started_at_is_rejected(self) -> None:
        with pytest.raises(DomainValidationError, match="timezone-aware"):
            execution(started_at=datetime(2026, 10, 5, 19, 0))

    def test_naive_ended_at_is_rejected(self) -> None:
        with pytest.raises(DomainValidationError, match="timezone-aware"):
            execution(ended_at=datetime(2026, 10, 5, 19, 45))

    def test_timestamps_are_normalised_to_utc(self) -> None:
        e = execution(
            started_at=START.astimezone(HANOI),
            ended_at=(START + timedelta(hours=1)).astimezone(HANOI),
        )
        assert e.started_at == START
        assert e.started_at.utcoffset() == timedelta(0)
        assert e.actual_duration == timedelta(hours=1)

    def test_end_before_start_is_rejected(self) -> None:
        with pytest.raises(DomainValidationError, match="ended_at must be strictly after"):
            execution(ended_at=START - timedelta(minutes=1))

    def test_zero_duration_is_rejected(self) -> None:
        with pytest.raises(DomainValidationError, match="ended_at must be strictly after"):
            execution(ended_at=START)

    def test_both_outcomes_are_constructible(self) -> None:
        assert execution(outcome=ExecutionOutcome.PARTIAL).outcome is ExecutionOutcome.PARTIAL
        assert execution(outcome=ExecutionOutcome.COMPLETED).outcome is ExecutionOutcome.COMPLETED


class TestTaskExecutionSummary:
    def test_holds_its_values(self) -> None:
        s = TaskExecutionSummary(
            task_id=TASK_ID,
            session_count=2,
            total_actual_duration=timedelta(hours=1),
            first_started_at=START,
            last_activity_at=START + timedelta(hours=1),
            completed_at=None,
        )
        assert s.session_count == 2
        assert s.completed_at is None

    def test_is_immutable(self) -> None:
        s = TaskExecutionSummary(
            task_id=TASK_ID,
            session_count=1,
            total_actual_duration=timedelta(minutes=30),
            first_started_at=START,
            last_activity_at=START,
            completed_at=None,
        )
        with pytest.raises(AttributeError):
            s.session_count = 2  # type: ignore[misc]

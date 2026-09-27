"""Specification of summarize_task_executions (written before checking the engine)."""

import random
from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest

from haui_compass.domain.shared.errors import DomainValidationError
from haui_compass.domain.tasks.execution import ExecutionOutcome, TaskExecution
from haui_compass.domain.tasks.task import TaskId
from haui_compass.engines.execution.summary import summarize_task_executions

TASK = TaskId(UUID(int=5))
OTHER_TASK = TaskId(UUID(int=6))
START = datetime(2026, 10, 5, 19, 0, tzinfo=UTC)
P, C = ExecutionOutcome.PARTIAL, ExecutionOutcome.COMPLETED


def session(
    hour_offset: float, minutes: int, outcome: ExecutionOutcome = P, task_id: TaskId = TASK
) -> TaskExecution:
    start = START + timedelta(hours=hour_offset)
    return TaskExecution(
        task_id=task_id,
        started_at=start,
        ended_at=start + timedelta(minutes=minutes),
        outcome=outcome,
    )


def test_a_single_session() -> None:
    s = summarize_task_executions([session(0, 45)])
    assert s.task_id == TASK
    assert s.session_count == 1
    assert s.total_actual_duration == timedelta(minutes=45)
    assert s.first_started_at == START
    assert s.last_activity_at == START + timedelta(minutes=45)
    assert s.completed_at is None


def test_multiple_partial_sessions_sum_their_durations() -> None:
    s = summarize_task_executions([session(0, 30), session(2, 20), session(5, 40)])
    assert s.session_count == 3
    assert s.total_actual_duration == timedelta(minutes=90)
    assert s.completed_at is None


def test_partial_then_completed() -> None:
    sessions = [session(0, 30), session(2, 20), session(5, 15, C)]
    s = summarize_task_executions(sessions)
    assert s.session_count == 3
    assert s.completed_at == START + timedelta(hours=5, minutes=15)
    assert s.last_activity_at == s.completed_at


def test_last_activity_can_be_after_completion() -> None:
    # An edge case worth being explicit about: a later PARTIAL sitting after the one that
    # completed the task. The summary reports both facts as given; it does not judge them.
    s = summarize_task_executions([session(0, 30, C), session(3, 10, P)])
    assert s.completed_at == START + timedelta(minutes=30)
    assert s.last_activity_at == START + timedelta(hours=3, minutes=10)


def test_order_of_input_does_not_change_the_summary() -> None:
    sessions = [session(0, 30), session(2, 20), session(5, 15, C)]
    forward = summarize_task_executions(sessions)
    assert summarize_task_executions(list(reversed(sessions))) == forward
    shuffled = list(sessions)
    random.Random(1).shuffle(shuffled)
    assert summarize_task_executions(shuffled) == forward


def test_empty_history_is_rejected() -> None:
    with pytest.raises(DomainValidationError, match="at least one execution"):
        summarize_task_executions([])


def test_mixed_task_ids_are_rejected() -> None:
    with pytest.raises(DomainValidationError, match="same task"):
        summarize_task_executions([session(0, 30), session(1, 30, task_id=OTHER_TASK)])


def test_more_than_one_completed_execution_is_rejected() -> None:
    with pytest.raises(DomainValidationError, match="cannot finish twice"):
        summarize_task_executions([session(0, 30, C), session(2, 20, C)])


@pytest.mark.parametrize("seed", range(60))
def test_total_duration_never_decreases_as_sessions_are_added(seed: int) -> None:
    rng = random.Random(seed)
    sessions = [session(n, rng.randint(1, 60)) for n in range(rng.randint(1, 8))]
    running = timedelta(0)
    for count in range(1, len(sessions) + 1):
        total = summarize_task_executions(sessions[:count]).total_actual_duration
        assert total >= running
        running = total


@pytest.mark.parametrize("seed", range(40))
def test_summary_is_independent_of_input_order(seed: int) -> None:
    rng = random.Random(seed)
    sessions = [session(n, rng.randint(1, 60)) for n in range(rng.randint(1, 6))]
    shuffled = list(sessions)
    rng.shuffle(shuffled)
    assert summarize_task_executions(sessions) == summarize_task_executions(shuffled)

"""Specification of apply_task_execution's state machine (written before checking the engine)."""

import random
from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest

from haui_compass.domain.assignments.assignment import AssignmentId
from haui_compass.domain.tasks.execution import (
    ExecutionOutcome,
    ExecutionTaskMismatchError,
    TaskAlreadyCompletedError,
    TaskExecution,
)
from haui_compass.domain.tasks.task import Task, TaskId, TaskStatus
from haui_compass.engines.execution.transitions import apply_task_execution

ASSIGNMENT_ID = AssignmentId(UUID(int=2))
START = datetime(2026, 10, 5, 19, 0, tzinfo=UTC)
P, C = ExecutionOutcome.PARTIAL, ExecutionOutcome.COMPLETED
NOT_STARTED, IN_PROGRESS, DONE = (
    TaskStatus.NOT_STARTED,
    TaskStatus.IN_PROGRESS,
    TaskStatus.COMPLETED,
)


def task(n: int, status: TaskStatus = NOT_STARTED) -> Task:
    return Task(
        id=TaskId(UUID(int=n)),
        assignment_id=ASSIGNMENT_ID,
        title=f"Task {n}",
        estimated_duration=timedelta(hours=1),
        status=status,
    )


def execution(task_id: TaskId, outcome: ExecutionOutcome, minutes: int = 30) -> TaskExecution:
    return TaskExecution(
        task_id=task_id,
        started_at=START,
        ended_at=START + timedelta(minutes=minutes),
        outcome=outcome,
    )


@pytest.mark.parametrize(
    ("before", "outcome", "after"),
    [
        (NOT_STARTED, P, IN_PROGRESS),
        (NOT_STARTED, C, DONE),
        (IN_PROGRESS, P, IN_PROGRESS),
        (IN_PROGRESS, C, DONE),
    ],
    ids=[
        "not_started+partial",
        "not_started+completed",
        "in_progress+partial",
        "in_progress+completed",
    ],
)
def test_the_full_transition_table(
    before: TaskStatus, outcome: ExecutionOutcome, after: TaskStatus
) -> None:
    t = task(1, before)
    result = apply_task_execution(t, execution(t.id, outcome))
    assert result.status is after


def test_a_completed_task_rejects_any_further_execution() -> None:
    t = task(1, DONE)
    with pytest.raises(TaskAlreadyCompletedError):
        apply_task_execution(t, execution(t.id, P))
    with pytest.raises(TaskAlreadyCompletedError):
        apply_task_execution(t, execution(t.id, C))


def test_an_execution_for_a_different_task_is_rejected() -> None:
    t = task(1)
    other = execution(TaskId(UUID(int=99)), P)
    with pytest.raises(ExecutionTaskMismatchError):
        apply_task_execution(t, other)


def test_the_original_task_is_never_mutated() -> None:
    t = task(1, NOT_STARTED)
    apply_task_execution(t, execution(t.id, C))
    assert t.status is NOT_STARTED  # unchanged; a new Task was returned


def test_only_status_changes_everything_else_is_preserved() -> None:
    t = task(1, IN_PROGRESS)
    result = apply_task_execution(t, execution(t.id, C))
    assert result.id == t.id
    assert result.assignment_id == t.assignment_id
    assert result.title == t.title
    assert result.estimated_duration == t.estimated_duration


def test_result_is_immutable() -> None:
    result = apply_task_execution(task(1), execution(task(1).id, P))
    with pytest.raises(AttributeError):
        result.status = DONE  # type: ignore[misc]


@pytest.mark.parametrize("seed", range(60))
def test_partial_never_completes_and_completed_always_completes(seed: int) -> None:
    rng = random.Random(seed)
    status = rng.choice([NOT_STARTED, IN_PROGRESS])
    t = task(1, status)
    partial_result = apply_task_execution(t, execution(t.id, P))
    assert partial_result.status is not DONE
    completed_result = apply_task_execution(t, execution(t.id, C))
    assert completed_result.status is DONE


@pytest.mark.parametrize("seed", range(60))
def test_a_task_can_never_move_backward_out_of_completed(seed: int) -> None:
    rng = random.Random(seed)
    t = task(1, DONE)
    outcome = rng.choice([P, C])
    with pytest.raises(TaskAlreadyCompletedError):
        apply_task_execution(t, execution(t.id, outcome))

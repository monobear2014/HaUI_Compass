import random
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest

from haui_compass.domain.assignments.assignment import AssignmentId
from haui_compass.domain.shared.errors import DomainValidationError
from haui_compass.domain.students.ids import StudentId
from haui_compass.domain.students.state import STUDENT_STATE_SCHEMA_VERSION, StudentState
from haui_compass.domain.tasks.task import Task, TaskId, TaskStatus
from haui_compass.engines.student_state.derive import derive_student_state

MINUTE = timedelta(minutes=1)
STUDENT_ID = StudentId(UUID(int=10))
ASSIGNMENT_ID = AssignmentId(UUID(int=2))
NOW = datetime(2026, 10, 5, 8, 0, tzinfo=UTC)
CAPACITY = timedelta(hours=10)


def task(n: int, minutes: int, status: TaskStatus = TaskStatus.NOT_STARTED) -> Task:
    return Task(
        id=TaskId(UUID(int=1000 + n)),
        assignment_id=ASSIGNMENT_ID,
        title=f"Task {n}",
        estimated_duration=minutes * MINUTE,
        status=status,
    )


def derive(tasks: list[Task], available: timedelta = CAPACITY, now: datetime = NOW) -> StudentState:
    return derive_student_state(
        student_id=STUDENT_ID, tasks=tasks, available_capacity=available, now=now
    )


def test_no_tasks() -> None:
    state = derive([])
    assert state.progress.total == 0
    assert state.progress.completion_ratio is None
    assert state.capacity.committed == timedelta(0)
    assert state.capacity.remaining == CAPACITY


def test_all_not_started() -> None:
    state = derive([task(1, 60), task(2, 90)])
    assert (state.progress.not_started, state.progress.remaining) == (2, 2)
    assert state.progress.completion_ratio == 0.0
    assert state.capacity.committed == 150 * MINUTE


def test_mixed_statuses_and_committed_effort() -> None:
    state = derive(
        [
            task(1, 60, TaskStatus.COMPLETED),
            task(2, 45, TaskStatus.IN_PROGRESS),
            task(3, 30, TaskStatus.NOT_STARTED),
            task(4, 15, TaskStatus.NOT_STARTED),
        ]
    )
    assert (state.progress.not_started, state.progress.in_progress) == (2, 1)
    assert state.progress.completed == 1
    assert state.progress.completion_ratio == 0.25
    # completed work is not committed; in-progress work counts at its full estimate
    assert state.capacity.committed == 90 * MINUTE


def test_all_completed_commits_nothing() -> None:
    state = derive([task(1, 60, TaskStatus.COMPLETED), task(2, 30, TaskStatus.COMPLETED)])
    assert state.progress.completion_ratio == 1.0
    assert state.capacity.committed == timedelta(0)
    assert state.capacity.remaining == CAPACITY


def test_exactly_full_capacity() -> None:
    state = derive([task(1, 600)])
    assert state.capacity.remaining == timedelta(0)
    assert state.capacity.overcommitted_by == timedelta(0)


def test_overcommitted_capacity_is_visible() -> None:
    state = derive([task(1, 400), task(2, 300)])
    assert state.capacity.overcommitted_by == 100 * MINUTE
    assert state.capacity.remaining == timedelta(0)


def test_snapshot_carries_identity_time_and_version() -> None:
    state = derive([])
    assert state.student_id == STUDENT_ID
    assert state.as_of == NOW
    assert state.schema_version == STUDENT_STATE_SCHEMA_VERSION


def test_same_input_gives_same_output() -> None:
    tasks = [task(1, 60), task(2, 45, TaskStatus.IN_PROGRESS)]
    assert derive(tasks) == derive(tasks)


def test_accepts_any_iterable_of_tasks() -> None:
    def generate() -> Iterator[Task]:
        yield task(1, 60)
        yield task(2, 30)

    state = derive_student_state(
        student_id=STUDENT_ID, tasks=generate(), available_capacity=CAPACITY, now=NOW
    )
    assert state.progress.total == 2


def test_naive_now_is_rejected() -> None:
    with pytest.raises(DomainValidationError, match="timezone-aware"):
        derive([], now=datetime(2026, 10, 5, 8, 0))


def test_negative_available_capacity_is_rejected() -> None:
    with pytest.raises(DomainValidationError, match="must not be negative"):
        derive([], available=-MINUTE)


def test_engine_does_not_read_the_system_clock() -> None:
    # Two very different explicit instants must be reflected exactly, whatever the wall clock says.
    early = datetime(2001, 1, 1, tzinfo=UTC)
    late = datetime(2999, 1, 1, tzinfo=UTC)
    assert derive([], now=early).as_of == early
    assert derive([], now=late).as_of == late


def random_tasks(rng: random.Random) -> list[Task]:
    statuses = list(TaskStatus)
    return [task(n, rng.randint(0, 240), rng.choice(statuses)) for n in range(rng.randint(0, 25))]


@pytest.mark.parametrize("seed", range(50))
def test_invariants_hold_for_random_task_sets(seed: int) -> None:
    rng = random.Random(seed)
    tasks = random_tasks(rng)
    available = rng.randint(0, 3000) * MINUTE
    state = derive(tasks, available=available)

    p, c = state.progress, state.capacity
    assert p.total == len(tasks)
    assert p.remaining + p.completed == p.total
    if tasks:
        assert p.completion_ratio is not None
        assert 0.0 <= p.completion_ratio <= 1.0
    else:
        assert p.completion_ratio is None
    assert c.committed == sum(
        (t.estimated_duration for t in tasks if t.status is not TaskStatus.COMPLETED), timedelta(0)
    )
    # remaining and overcommitted_by are the two sides of one difference; never both non-zero
    assert c.remaining - c.overcommitted_by == c.available - c.committed
    assert c.remaining == timedelta(0) or c.overcommitted_by == timedelta(0)
    assert c.remaining >= timedelta(0)
    assert c.overcommitted_by >= timedelta(0)


@pytest.mark.parametrize("seed", range(20))
def test_result_does_not_depend_on_task_order(seed: int) -> None:
    rng = random.Random(seed)
    tasks = random_tasks(rng)
    shuffled = list(tasks)
    rng.shuffle(shuffled)
    assert derive(tasks) == derive(shuffled)

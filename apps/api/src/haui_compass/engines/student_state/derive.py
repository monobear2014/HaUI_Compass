"""Derive StudentState v0 from explicit facts. Pure: no clock, no I/O, no randomness."""

from collections.abc import Iterable
from datetime import datetime, timedelta

from haui_compass.domain.students.ids import StudentId
from haui_compass.domain.students.state import CapacityState, ProgressState, StudentState
from haui_compass.domain.tasks.task import Task, TaskStatus


def derive_student_state(
    *,
    student_id: StudentId,
    tasks: Iterable[Task],
    available_capacity: timedelta,
    now: datetime,
) -> StudentState:
    """Build the student's state for exactly the ``tasks`` supplied.

    Which tasks are in scope, and which period ``available_capacity`` covers, are the caller's
    decisions in v0; the engine describes what it is given and does not guess.

    ``committed`` is the estimated effort of tasks that are not completed. Tasks in progress count
    at their full estimate because v0 records no partial progress; this errs on the cautious side.
    ``now`` must be timezone-aware; it becomes ``as_of``.
    """
    counts = {status: 0 for status in TaskStatus}
    committed = timedelta(0)
    for task in tasks:
        counts[task.status] += 1
        if task.status is not TaskStatus.COMPLETED:
            committed += task.estimated_duration

    return StudentState(
        student_id=student_id,
        as_of=now,
        capacity=CapacityState(available=available_capacity, committed=committed),
        progress=ProgressState(
            not_started=counts[TaskStatus.NOT_STARTED],
            in_progress=counts[TaskStatus.IN_PROGRESS],
            completed=counts[TaskStatus.COMPLETED],
        ),
    )

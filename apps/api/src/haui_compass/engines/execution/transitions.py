"""apply_task_execution: the Task state machine driven by an observed execution.

Pure and total for every reachable (status, outcome) pair:

    NOT_STARTED + PARTIAL   -> IN_PROGRESS
    NOT_STARTED + COMPLETED -> COMPLETED
    IN_PROGRESS + PARTIAL   -> IN_PROGRESS
    IN_PROGRESS + COMPLETED -> COMPLETED
    COMPLETED   + anything  -> rejected (TaskAlreadyCompletedError)

Equivalently: a ``COMPLETED`` outcome always completes the task; a ``PARTIAL`` outcome always
leaves it ``IN_PROGRESS`` (whether it was ``NOT_STARTED`` or already ``IN_PROGRESS``); a task that
is already ``COMPLETED`` accepts no further execution, because a finished task has no more open
work for a sitting to describe.
"""

from dataclasses import replace

from haui_compass.domain.tasks.execution import (
    ExecutionOutcome,
    ExecutionTaskMismatchError,
    TaskAlreadyCompletedError,
    TaskExecution,
)
from haui_compass.domain.tasks.task import Task, TaskStatus


def apply_task_execution(task: Task, execution: TaskExecution) -> Task:
    """Return a new ``Task`` reflecting ``execution``. ``task`` itself is never mutated."""
    if execution.task_id != task.id:
        raise ExecutionTaskMismatchError(
            f"execution is for task {execution.task_id}, not {task.id}"
        )
    if task.status is TaskStatus.COMPLETED:
        raise TaskAlreadyCompletedError(f"task {task.id} is already completed")

    new_status = (
        TaskStatus.COMPLETED
        if execution.outcome is ExecutionOutcome.COMPLETED
        else TaskStatus.IN_PROGRESS
    )
    return replace(task, status=new_status)

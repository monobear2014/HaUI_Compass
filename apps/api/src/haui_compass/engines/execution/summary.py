"""summarize_task_executions: a plain factual aggregate over one task's execution history.

Pure and order-independent: the same set of executions summarises the same way regardless of the
order they are supplied in. No scoring, no calibration, no behavioural inference — only counts and
timestamps taken directly from the facts.

What v0 deliberately does NOT validate (see docs/research/intelliplan-execution-reference.md):
overlapping session times, and exact duplicate records (there is no ``ExecutionId`` to detect a
duplicate by; two identical ``TaskExecution`` values are simply counted as two sessions). What it
DOES reject as a logically contradictory history: executions for more than one task, and more than
one ``COMPLETED`` execution (a task does not finish twice).
"""

from collections.abc import Iterable
from datetime import timedelta

from haui_compass.domain.shared.errors import DomainValidationError
from haui_compass.domain.tasks.execution import (
    ExecutionOutcome,
    TaskExecution,
    TaskExecutionSummary,
)


def summarize_task_executions(executions: Iterable[TaskExecution]) -> TaskExecutionSummary:
    """Summarise a non-empty history of executions, all for the same task."""
    ordered = sorted(executions, key=lambda e: e.started_at)
    if not ordered:
        raise DomainValidationError("summarize_task_executions requires at least one execution")

    task_id = ordered[0].task_id
    if any(e.task_id != task_id for e in ordered):
        raise DomainValidationError("all executions in one summary must be for the same task")

    completed = [e for e in ordered if e.outcome is ExecutionOutcome.COMPLETED]
    if len(completed) > 1:
        raise DomainValidationError(
            f"task {task_id} has more than one completed execution: it cannot finish twice"
        )

    return TaskExecutionSummary(
        task_id=task_id,
        session_count=len(ordered),
        total_actual_duration=sum((e.actual_duration for e in ordered), timedelta(0)),
        first_started_at=ordered[0].started_at,
        last_activity_at=max(e.ended_at for e in ordered),
        completed_at=completed[0].ended_at if completed else None,
    )

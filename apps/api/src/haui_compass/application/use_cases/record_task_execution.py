"""RecordTaskExecution: turn an observed sitting into a TaskExecution and an updated Task.

Orchestration only. The execution's start and end times are explicit input, never derived from the
Clock: an execution describes an actually observed interval (a future timer UI would capture it),
and using the wall clock here would silently mean "now", which is not what happened. All
calculation is delegated to engines/execution/transitions.py.

This explicit-input use case remains persistence-independent: the caller receives the updated task
and execution. Persistence Foundation v0 provides separate application repository ports for a
workflow that chooses to store those results.
"""

from dataclasses import dataclass
from datetime import datetime

from haui_compass.domain.tasks.execution import ExecutionOutcome, TaskExecution
from haui_compass.domain.tasks.task import Task
from haui_compass.engines.execution.transitions import apply_task_execution


@dataclass(frozen=True, slots=True, kw_only=True)
class RecordTaskExecutionRequest:
    task: Task
    started_at: datetime
    ended_at: datetime
    outcome: ExecutionOutcome


@dataclass(frozen=True, slots=True, kw_only=True)
class RecordTaskExecutionResult:
    execution: TaskExecution
    updated_task: Task


class RecordTaskExecution:
    def execute(self, request: RecordTaskExecutionRequest) -> RecordTaskExecutionResult:
        """Raises the ``TaskExecution``/``apply_task_execution`` domain errors on invalid input:
        a malformed interval, a task already completed, or an id mismatch (never reachable here,
        since the execution is built from ``request.task.id``, but still enforced by the engine)."""
        execution = TaskExecution(
            task_id=request.task.id,
            started_at=request.started_at,
            ended_at=request.ended_at,
            outcome=request.outcome,
        )
        updated_task = apply_task_execution(request.task, execution)
        return RecordTaskExecutionResult(execution=execution, updated_task=updated_task)

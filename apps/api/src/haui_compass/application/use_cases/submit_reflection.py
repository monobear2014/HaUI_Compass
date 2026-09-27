"""SubmitReflection: turn a student's answers into a Reflection and its candidate signals.

    student answers + tasks in scope + their executions
        -> Reflection
        -> (existing execution engine) TaskExecutionSummary per task
        -> CandidateReflectionSignals

Orchestration only: ``summarize_task_executions`` (Execution Tracking v0) does the aggregation,
``generate_candidate_signals`` does the derivation. ``submitted_at`` is read from the Clock exactly
once, unlike a ``TaskExecution``'s own timestamps: a reflection submission genuinely is "now", not
an observed historical interval (contrast ``RecordTaskExecution``, which takes no Clock).

The result is *not* confirmed information; see ``ConfirmReflectionSignals``.
"""

from collections import defaultdict
from dataclasses import dataclass

from haui_compass.application.ports.clock import Clock
from haui_compass.domain.reflections.reflection import (
    Reflection,
    ReflectionPeriod,
    ReflectionResponses,
)
from haui_compass.domain.reflections.signals import CandidateReflectionSignals
from haui_compass.domain.students.ids import StudentId
from haui_compass.domain.tasks.execution import TaskExecution
from haui_compass.domain.tasks.task import Task, TaskId
from haui_compass.engines.execution.summary import summarize_task_executions
from haui_compass.engines.reflection.candidates import generate_candidate_signals


@dataclass(frozen=True, slots=True, kw_only=True)
class SubmitReflectionRequest:
    student_id: StudentId
    period: ReflectionPeriod
    responses: ReflectionResponses
    # Context for the tasks the responses refer to: the caller's remaining known task set and
    # every recorded execution for those tasks. Neither is filtered ahead of time by this use
    # case; only the tasks the responses actually reference need be present.
    tasks: tuple[Task, ...] = ()
    task_executions: tuple[TaskExecution, ...] = ()


@dataclass(frozen=True, slots=True, kw_only=True)
class SubmitReflectionResult:
    reflection: Reflection
    candidate_signals: CandidateReflectionSignals


class SubmitReflection:
    def __init__(self, *, clock: Clock) -> None:
        self._clock = clock

    def execute(self, request: SubmitReflectionRequest) -> SubmitReflectionResult:
        """Raises the ``Reflection``/``generate_candidate_signals`` domain errors on invalid
        input: an empty or backwards period, a submission before its own period starts, or a
        response referencing a task this request gave no context for."""
        now = self._clock.now()  # the only clock read; this is when the submission happened
        reflection = Reflection(
            student_id=request.student_id,
            period=request.period,
            submitted_at=now,
            responses=request.responses,
        )

        tasks_by_id = {task.id: task for task in request.tasks}
        executions_by_task: dict[TaskId, list[TaskExecution]] = defaultdict(list)
        for execution in request.task_executions:
            executions_by_task[execution.task_id].append(execution)
        summaries_by_task = {
            task_id: summarize_task_executions(executions)
            for task_id, executions in executions_by_task.items()
        }

        candidate = generate_candidate_signals(
            reflection,
            tasks_by_id=tasks_by_id,
            execution_summaries_by_task=summaries_by_task,
        )
        return SubmitReflectionResult(reflection=reflection, candidate_signals=candidate)

"""generate_candidate_signals: turn a submitted Reflection into CandidateReflectionSignals.

Pure and deterministic: the same reflection, task set, and execution summaries always produce the
same candidate signals in the same order, regardless of what order the caller's mappings happen to
iterate in (``ReflectionResponses`` already dedupes and sorts its id/topic fields; this engine
additionally emits estimation feedback in task-id order).

Execution facts are never re-aggregated here. The caller supplies one ``TaskExecutionSummary`` per
task (produced by ``engines.execution.summary.summarize_task_executions``); this engine only reads
the totals it already contains.
"""

from collections.abc import Mapping

from haui_compass.domain.reflections.reflection import Reflection, ReflectionUnknownTaskError
from haui_compass.domain.reflections.signals import (
    CandidateReflectionSignals,
    DeferredTaskSignal,
    DifficultTopicSignal,
    EstimationFeedbackSignal,
    ReflectionSignal,
    WorkloadFeedbackSignal,
)
from haui_compass.domain.tasks.execution import TaskExecutionSummary
from haui_compass.domain.tasks.task import Task, TaskId


def generate_candidate_signals(
    reflection: Reflection,
    *,
    tasks_by_id: Mapping[TaskId, Task],
    execution_summaries_by_task: Mapping[TaskId, TaskExecutionSummary],
) -> CandidateReflectionSignals:
    """Build the candidate signals for ``reflection``.

    Raises ``ReflectionUnknownTaskError`` if ``reflected_task_ids`` or ``deferred_task_ids``
    names a task not present in ``tasks_by_id``: the caller must supply context for every task it
    asks this engine to reason about. A task with no entry in ``execution_summaries_by_task`` is
    not an error (no sitting has been recorded for it yet); it simply yields no estimation
    feedback signal.
    """
    _require_known(reflection.responses.reflected_task_ids, tasks_by_id, "reflected_task_ids")
    _require_known(reflection.responses.deferred_task_ids, tasks_by_id, "deferred_task_ids")

    signals: list[ReflectionSignal] = []

    for task_id in reflection.responses.reflected_task_ids:  # already sorted, deduplicated
        summary = execution_summaries_by_task.get(task_id)
        if summary is None:
            continue
        task = tasks_by_id[task_id]
        signals.append(
            EstimationFeedbackSignal(
                task_id=task_id,
                estimated_duration=task.estimated_duration,
                actual_duration=summary.total_actual_duration,
            )
        )

    if reflection.responses.workload_feedback is not None:
        signals.append(WorkloadFeedbackSignal(reported=reflection.responses.workload_feedback))

    for topic in reflection.responses.difficult_topics:  # already sorted, deduplicated
        signals.append(DifficultTopicSignal(topic=topic))

    for task_id in reflection.responses.deferred_task_ids:  # already sorted, deduplicated
        signals.append(DeferredTaskSignal(task_id=task_id))

    return CandidateReflectionSignals(
        student_id=reflection.student_id,
        period=reflection.period,
        signals=tuple(signals),
    )


def _require_known(
    task_ids: tuple[TaskId, ...], tasks_by_id: Mapping[TaskId, Task], field_name: str
) -> None:
    unknown = [task_id for task_id in task_ids if task_id not in tasks_by_id]
    if unknown:
        raise ReflectionUnknownTaskError(
            f"responses.{field_name} references task(s) with no supplied context: {unknown}"
        )

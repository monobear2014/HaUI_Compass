"""Adaptive Replanning v0: preserve valid intent and replan only residual work."""

from collections import defaultdict
from collections.abc import Iterable
from dataclasses import replace
from datetime import datetime, timedelta

from haui_compass.domain.assignments.assignment import Assignment, AssignmentId
from haui_compass.domain.plans.plan import (
    StudyBlock,
    StudyPlan,
    StudyWindow,
)
from haui_compass.domain.plans.planning import (
    DEFAULT_PLANNING_POLICY,
    PlanningCandidate,
    PlanningPolicy,
)
from haui_compass.domain.plans.replanning import (
    DEFAULT_REPLANNING_POLICY,
    PlanChange,
    PlanChangeReason,
    ReflectionSignalKind,
    ReplanningPolicy,
    ReplanningResult,
    ReplanningSummary,
    TaskRemainingEffort,
)
from haui_compass.domain.reflections.signals import (
    ConfirmedReflectionSignals,
    DeferredTaskSignal,
    DifficultTopicSignal,
    EstimationFeedbackSignal,
    WorkloadFeedbackSignal,
)
from haui_compass.domain.shared.errors import DomainValidationError
from haui_compass.domain.shared.validation import require_aware_utc
from haui_compass.domain.students.ids import StudentId
from haui_compass.domain.tasks.execution import TaskExecutionSummary
from haui_compass.domain.tasks.task import Task, TaskId, TaskStatus
from haui_compass.engines.planning.availability import (
    clip_study_windows,
    normalize_study_windows,
    subtract_study_blocks_from_windows,
)
from haui_compass.engines.planning.schedule import generate_weekly_plan


def replan_study_plan(
    *,
    baseline_plan: StudyPlan,
    tasks: Iterable[Task],
    assignments: Iterable[Assignment],
    study_windows: Iterable[StudyWindow],
    remaining_efforts: Iterable[TaskRemainingEffort],
    execution_summaries: Iterable[TaskExecutionSummary],
    confirmed_reflections: Iterable[ConfirmedReflectionSignals],
    effective_at: datetime,
    policy: ReplanningPolicy = DEFAULT_REPLANNING_POLICY,
    planning_policy: PlanningPolicy = DEFAULT_PLANNING_POLICY,
) -> ReplanningResult:
    """Return a deterministic revision while freezing history and valid future blocks.

    Remaining effort is an explicit input for every open task. Execution duration and confirmed
    reflections are accepted only as audit context in v0 and never converted into an estimate.
    """
    effective_at = require_aware_utc(effective_at, "replan_study_plan.effective_at")
    _validate_effective_at(baseline_plan, effective_at)

    task_by_id = _unique_tasks(tasks)
    assignment_by_id = _unique_assignments(assignments)
    remaining_by_task = _unique_remaining(remaining_efforts)
    execution_by_task = _unique_execution_summaries(execution_summaries)
    windows = normalize_study_windows(study_windows, baseline_plan.period)

    _validate_current_inputs(
        task_by_id=task_by_id,
        assignment_by_id=assignment_by_id,
        remaining_by_task=remaining_by_task,
        execution_by_task=execution_by_task,
        effective_at=effective_at,
    )
    reflection_kinds = _validate_and_collect_reflections(
        confirmed_reflections,
        student_id=baseline_plan.student_id,
        effective_at=effective_at,
    )

    historical, crossing, baseline_future = _partition_blocks(baseline_plan.blocks, effective_at)
    current_scope = set(task_by_id)
    referenced_current = {block.task_id for block in crossing + baseline_future} | {
        item.task_id for item in baseline_plan.unplanned_tasks
    }
    unknown = referenced_current - current_scope
    if unknown:
        raise DomainValidationError("baseline current/future work refers to an unknown task")

    crossing_duration = _duration_by_task(crossing)
    future_by_task = _blocks_by_task(baseline_future)
    baseline_unplanned = {
        item.task_id: item.remaining_effort for item in baseline_plan.unplanned_tasks
    }

    preserved: list[StudyBlock] = []
    remaining_to_allocate: dict[TaskId, timedelta] = {}
    invalid_window_tasks: set[TaskId] = set()
    invalid_deadline_tasks: set[TaskId] = set()

    for task_id, task in task_by_id.items():
        if task.status is TaskStatus.COMPLETED:
            continue
        remaining = remaining_by_task[task_id].remaining_duration
        reserved = crossing_duration.get(task_id, timedelta(0))
        if reserved > remaining:
            raise DomainValidationError("crossing block duration exceeds explicit remaining effort")
        budget = remaining - reserved
        assignment = assignment_by_id[task.assignment_id]
        for block in future_by_task.get(task_id, ()):
            inside_window = _block_is_inside_window(block, windows)
            before_deadline = block.ends_at <= assignment.deadline
            if not inside_window:
                invalid_window_tasks.add(task_id)
            if not before_deadline:
                invalid_deadline_tasks.add(task_id)
            if inside_window and before_deadline and block.duration <= budget:
                preserved.append(block)
                budget -= block.duration
        remaining_to_allocate[task_id] = budget

    residual_windows = clip_study_windows(windows, effective_at)
    residual_windows = subtract_study_blocks_from_windows(residual_windows, (*crossing, *preserved))
    candidates = tuple(
        PlanningCandidate(
            task=replace(task, estimated_duration=remaining_to_allocate[task_id]),
            assignment=assignment_by_id[task.assignment_id],
        )
        for task_id, task in task_by_id.items()
        if task.status is not TaskStatus.COMPLETED and remaining_to_allocate[task_id] > timedelta(0)
    )
    residual_plan = generate_weekly_plan(
        student_id=baseline_plan.student_id,
        candidates=candidates,
        period=baseline_plan.period,
        study_windows=residual_windows,
        generated_at=effective_at,
        policy=planning_policy,
    )
    revised_plan = StudyPlan(
        student_id=baseline_plan.student_id,
        period=baseline_plan.period,
        generated_at=effective_at,
        blocks=(*historical, *crossing, *preserved, *residual_plan.blocks),
        unplanned_tasks=residual_plan.unplanned_tasks,
        planner_version=planning_policy.planner_version,
    )
    _validate_effort_conservation(
        revised_plan=revised_plan,
        task_by_id=task_by_id,
        remaining_by_task=remaining_by_task,
        crossing=crossing,
        effective_at=effective_at,
    )

    revised_future = tuple(
        block for block in revised_plan.blocks if block.starts_at >= effective_at
    )
    changes = _build_changes(
        task_by_id=task_by_id,
        execution_by_task=execution_by_task,
        remaining_by_task=remaining_by_task,
        crossing_duration=crossing_duration,
        baseline_future=future_by_task,
        revised_future=_blocks_by_task(revised_future),
        baseline_unplanned=baseline_unplanned,
        revised_unplanned={
            item.task_id: item.remaining_effort for item in revised_plan.unplanned_tasks
        },
        invalid_window_tasks=invalid_window_tasks,
        invalid_deadline_tasks=invalid_deadline_tasks,
    )
    summary = _build_summary(
        historical=historical,
        crossing=crossing,
        baseline_future=baseline_future,
        revised_future=revised_future,
        baseline_unplanned=baseline_unplanned,
        revised_unplanned={
            item.task_id: item.remaining_effort for item in revised_plan.unplanned_tasks
        },
        execution_count=len(execution_by_task),
    )
    return ReplanningResult(
        revised_plan=revised_plan,
        effective_at=effective_at,
        changes=changes,
        summary=summary,
        informational_reflection_signals=reflection_kinds,
        replanner_version=policy.replanner_version,
    )


def _validate_effective_at(plan: StudyPlan, effective_at: datetime) -> None:
    if not plan.period.start <= effective_at <= plan.period.end:
        raise DomainValidationError("effective_at must lie inside the baseline plan period")
    if plan.generated_at > effective_at:
        raise DomainValidationError("baseline plan cannot be generated after effective_at")


def _unique_tasks(items: Iterable[Task]) -> dict[TaskId, Task]:
    result: dict[TaskId, Task] = {}
    for item in items:
        if item.id in result:
            raise DomainValidationError("duplicate task ids")
        result[item.id] = item
    return result


def _unique_assignments(items: Iterable[Assignment]) -> dict[AssignmentId, Assignment]:
    result: dict[AssignmentId, Assignment] = {}
    for item in items:
        if item.id in result:
            raise DomainValidationError("duplicate assignment ids")
        result[item.id] = item
    return result


def _unique_remaining(
    efforts: Iterable[TaskRemainingEffort],
) -> dict[TaskId, TaskRemainingEffort]:
    result: dict[TaskId, TaskRemainingEffort] = {}
    for effort in efforts:
        if effort.task_id in result:
            raise DomainValidationError("duplicate remaining-effort task ids")
        result[effort.task_id] = effort
    return result


def _unique_execution_summaries(
    summaries: Iterable[TaskExecutionSummary],
) -> dict[TaskId, TaskExecutionSummary]:
    result: dict[TaskId, TaskExecutionSummary] = {}
    for summary in summaries:
        if summary.task_id in result:
            raise DomainValidationError("duplicate execution-summary task ids")
        result[summary.task_id] = summary
    return result


def _validate_current_inputs(
    *,
    task_by_id: dict[TaskId, Task],
    assignment_by_id: dict[AssignmentId, Assignment],
    remaining_by_task: dict[TaskId, TaskRemainingEffort],
    execution_by_task: dict[TaskId, TaskExecutionSummary],
    effective_at: datetime,
) -> None:
    task_ids = set(task_by_id)
    if set(remaining_by_task) - task_ids:
        raise DomainValidationError("remaining effort refers to an unknown task")
    if set(execution_by_task) - task_ids:
        raise DomainValidationError("execution summary refers to an unknown task")

    for task_id, task in task_by_id.items():
        if task.assignment_id not in assignment_by_id:
            raise DomainValidationError("task refers to an unknown assignment")
        remaining = remaining_by_task.get(task_id)
        if task.status is not TaskStatus.COMPLETED and remaining is None:
            raise DomainValidationError("explicit remaining effort is required for every open task")
        if (
            task.status is TaskStatus.COMPLETED
            and remaining is not None
            and remaining.remaining_duration > timedelta(0)
        ):
            raise DomainValidationError("completed task cannot have positive remaining effort")

    for task_id, summary in execution_by_task.items():
        if summary.last_activity_at > effective_at:
            raise DomainValidationError("execution summary contains activity after effective_at")
        if (
            summary.completed_at is not None
            and task_by_id[task_id].status is not TaskStatus.COMPLETED
        ):
            raise DomainValidationError("completed execution summary requires a completed task")


def _validate_and_collect_reflections(
    reflections: Iterable[ConfirmedReflectionSignals],
    *,
    student_id: StudentId,
    effective_at: datetime,
) -> tuple[ReflectionSignalKind, ...]:
    kinds: set[ReflectionSignalKind] = set()
    for confirmation in reflections:
        if confirmation.student_id != student_id:
            raise DomainValidationError("confirmed reflection belongs to another student")
        if confirmation.confirmed_at > effective_at:
            raise DomainValidationError("confirmed reflection occurs after effective_at")
        for signal in confirmation.signals:
            if isinstance(signal, EstimationFeedbackSignal):
                kinds.add(ReflectionSignalKind.ESTIMATION_FEEDBACK)
            elif isinstance(signal, WorkloadFeedbackSignal):
                kinds.add(ReflectionSignalKind.WORKLOAD_FEEDBACK)
            elif isinstance(signal, DifficultTopicSignal):
                kinds.add(ReflectionSignalKind.DIFFICULT_TOPIC)
            elif isinstance(signal, DeferredTaskSignal):
                kinds.add(ReflectionSignalKind.DEFERRED_TASK)
    return tuple(sorted(kinds, key=str))


def _partition_blocks(
    blocks: tuple[StudyBlock, ...], effective_at: datetime
) -> tuple[tuple[StudyBlock, ...], tuple[StudyBlock, ...], tuple[StudyBlock, ...]]:
    historical = tuple(block for block in blocks if block.ends_at <= effective_at)
    crossing = tuple(block for block in blocks if block.starts_at < effective_at < block.ends_at)
    future = tuple(block for block in blocks if block.starts_at >= effective_at)
    return historical, crossing, future


def _blocks_by_task(blocks: Iterable[StudyBlock]) -> dict[TaskId, tuple[StudyBlock, ...]]:
    grouped: dict[TaskId, list[StudyBlock]] = defaultdict(list)
    for block in blocks:
        grouped[block.task_id].append(block)
    return {task_id: tuple(items) for task_id, items in grouped.items()}


def _duration_by_task(blocks: Iterable[StudyBlock]) -> dict[TaskId, timedelta]:
    result: dict[TaskId, timedelta] = defaultdict(timedelta)
    for block in blocks:
        result[block.task_id] += block.duration
    return dict(result)


def _block_is_inside_window(block: StudyBlock, windows: tuple[StudyWindow, ...]) -> bool:
    return any(
        window.starts_at <= block.starts_at and block.ends_at <= window.ends_at
        for window in windows
    )


def _validate_effort_conservation(
    *,
    revised_plan: StudyPlan,
    task_by_id: dict[TaskId, Task],
    remaining_by_task: dict[TaskId, TaskRemainingEffort],
    crossing: tuple[StudyBlock, ...],
    effective_at: datetime,
) -> None:
    reserved = _duration_by_task(crossing)
    future = _duration_by_task(
        block for block in revised_plan.blocks if block.starts_at >= effective_at
    )
    unplanned = {item.task_id: item.remaining_effort for item in revised_plan.unplanned_tasks}
    for task_id, task in task_by_id.items():
        if task.status is TaskStatus.COMPLETED:
            if task_id in future or task_id in unplanned:
                raise AssertionError("completed task retained future work")
            continue
        accounted = (
            reserved.get(task_id, timedelta(0))
            + future.get(task_id, timedelta(0))
            + unplanned.get(task_id, timedelta(0))
        )
        if accounted != remaining_by_task[task_id].remaining_duration:
            raise AssertionError("replanner violated explicit remaining-effort conservation")


def _build_changes(
    *,
    task_by_id: dict[TaskId, Task],
    execution_by_task: dict[TaskId, TaskExecutionSummary],
    remaining_by_task: dict[TaskId, TaskRemainingEffort],
    crossing_duration: dict[TaskId, timedelta],
    baseline_future: dict[TaskId, tuple[StudyBlock, ...]],
    revised_future: dict[TaskId, tuple[StudyBlock, ...]],
    baseline_unplanned: dict[TaskId, timedelta],
    revised_unplanned: dict[TaskId, timedelta],
    invalid_window_tasks: set[TaskId],
    invalid_deadline_tasks: set[TaskId],
) -> tuple[PlanChange, ...]:
    changes: list[PlanChange] = []
    for task_id, task in task_by_id.items():
        before_blocks = baseline_future.get(task_id, ())
        after_blocks = revised_future.get(task_id, ())
        before_unplanned = baseline_unplanned.get(task_id, timedelta(0))
        after_unplanned = revised_unplanned.get(task_id, timedelta(0))
        if before_blocks == after_blocks and before_unplanned == after_unplanned:
            continue

        reasons: list[PlanChangeReason] = []
        if task.status is TaskStatus.COMPLETED:
            reasons.append(PlanChangeReason.TASK_COMPLETED)
        if task_id in invalid_window_tasks:
            reasons.append(PlanChangeReason.STUDY_WINDOW_CHANGED)
        if task_id in invalid_deadline_tasks:
            reasons.append(PlanChangeReason.ASSIGNMENT_DEADLINE_CHANGED)
        baseline_outstanding = (
            crossing_duration.get(task_id, timedelta(0))
            + sum((block.duration for block in before_blocks), timedelta(0))
            + before_unplanned
        )
        explicit_remaining = (
            remaining_by_task[task_id].remaining_duration
            if task_id in remaining_by_task
            else timedelta(0)
        )
        if task.status is not TaskStatus.COMPLETED and explicit_remaining != baseline_outstanding:
            reasons.append(PlanChangeReason.REMAINING_EFFORT_CHANGED)
        if after_unplanned > timedelta(0):
            reasons.append(PlanChangeReason.INSUFFICIENT_CAPACITY)
        if not reasons:
            reasons.append(PlanChangeReason.REMAINING_EFFORT_CHANGED)

        changes.append(
            PlanChange(
                task_id=task_id,
                reasons=tuple(reasons),
                baseline_future_blocks=before_blocks,
                revised_future_blocks=after_blocks,
                baseline_unplanned_effort=before_unplanned,
                revised_unplanned_effort=after_unplanned,
                had_execution_activity=task_id in execution_by_task,
            )
        )
    return tuple(changes)


def _build_summary(
    *,
    historical: tuple[StudyBlock, ...],
    crossing: tuple[StudyBlock, ...],
    baseline_future: tuple[StudyBlock, ...],
    revised_future: tuple[StudyBlock, ...],
    baseline_unplanned: dict[TaskId, timedelta],
    revised_unplanned: dict[TaskId, timedelta],
    execution_count: int,
) -> ReplanningSummary:
    baseline_set = set(baseline_future)
    revised_set = set(revised_future)
    preserved = baseline_set & revised_set
    removed = baseline_set - revised_set
    added = revised_set - baseline_set
    removed_duration = _duration_by_task(removed)
    added_duration = _duration_by_task(added)
    moved_duration = sum(
        (
            min(removed_duration.get(task_id, timedelta(0)), duration)
            for task_id, duration in added_duration.items()
        ),
        timedelta(0),
    )
    newly_unplanned = sum(
        (
            max(
                revised_unplanned.get(task_id, timedelta(0))
                - baseline_unplanned.get(task_id, timedelta(0)),
                timedelta(0),
            )
            for task_id in set(baseline_unplanned) | set(revised_unplanned)
        ),
        timedelta(0),
    )
    return ReplanningSummary(
        historical_block_count=len(historical),
        crossing_block_count=len(crossing),
        preserved_future_block_count=len(preserved),
        removed_future_block_count=len(removed),
        added_future_block_count=len(added),
        moved_duration=moved_duration,
        newly_unplanned_duration=newly_unplanned,
        execution_context_task_count=execution_count,
    )

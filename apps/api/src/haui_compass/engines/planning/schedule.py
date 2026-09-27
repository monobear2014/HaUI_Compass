"""Weekly Planner v0: place explicit task effort into explicit study windows.

The engine is a transparent earliest-deadline-first allocator. It performs no I/O, reads no
clock, generates no tasks, changes no estimates, and consumes no risk, execution, StudentState,
or reflection data.
"""

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime, timedelta
from uuid import UUID

from haui_compass.domain.plans.plan import (
    PlanPeriod,
    StudyBlock,
    StudyPlan,
    StudyWindow,
    UnplannedReason,
    UnplannedTask,
)
from haui_compass.domain.plans.planning import (
    DEFAULT_PLANNING_POLICY,
    PlanningCandidate,
    PlanningPolicy,
)
from haui_compass.domain.shared.errors import DomainValidationError
from haui_compass.domain.students.ids import StudentId
from haui_compass.domain.tasks.task import TaskId, TaskStatus


@dataclass(slots=True)
class _AvailableSlot:
    starts_at: datetime
    ends_at: datetime


def generate_weekly_plan(
    *,
    student_id: StudentId,
    candidates: Iterable[PlanningCandidate],
    period: PlanPeriod,
    study_windows: Iterable[StudyWindow],
    generated_at: datetime,
    policy: PlanningPolicy = DEFAULT_PLANNING_POLICY,
) -> StudyPlan:
    """Return a deterministic plan for the supplied task and availability facts.

    Open tasks are ordered by assignment deadline, then (when enabled) ``IN_PROGRESS`` before
    ``NOT_STARTED``, then assignment id and task id. Each task consumes the earliest free time
    before its deadline. Overlapping or touching input windows are merged before allocation, so a
    minute of availability can never be counted twice.

    Long tasks may span several blocks. If the complete estimate does not fit, the blocks that do
    fit remain planned and the exact remaining effort is returned as one ``UnplannedTask``.
    """
    candidate_list = list(candidates)
    _require_unique_task_ids(candidate_list)
    normalized_windows = _normalize_windows(study_windows, period)
    slots = [_AvailableSlot(window.starts_at, window.ends_at) for window in normalized_windows]

    blocks: list[StudyBlock] = []
    unplanned: list[UnplannedTask] = []
    ordered = sorted(
        (
            candidate
            for candidate in candidate_list
            if candidate.task.status is not TaskStatus.COMPLETED
        ),
        key=lambda candidate: _candidate_key(candidate, policy),
    )

    for candidate in ordered:
        remaining = candidate.task.estimated_duration
        if remaining == timedelta(0):
            continue

        deadline = candidate.assignment.deadline
        had_eligible_window = any(window.starts_at < deadline for window in normalized_windows)
        task_blocks, remaining = _allocate(
            task_id=candidate.task.id,
            effort=remaining,
            deadline=deadline,
            slots=slots,
        )
        blocks.extend(task_blocks)

        if remaining > timedelta(0):
            reason = (
                UnplannedReason.INSUFFICIENT_CAPACITY
                if had_eligible_window
                else UnplannedReason.NO_STUDY_WINDOW_BEFORE_DEADLINE
            )
            unplanned.append(
                UnplannedTask(
                    task_id=candidate.task.id,
                    remaining_effort=remaining,
                    reason=reason,
                )
            )

    return StudyPlan(
        student_id=student_id,
        period=period,
        generated_at=generated_at,
        blocks=tuple(blocks),
        unplanned_tasks=tuple(unplanned),
        planner_version=policy.planner_version,
    )


def _candidate_key(
    candidate: PlanningCandidate, policy: PlanningPolicy
) -> tuple[datetime, int, UUID, UUID]:
    status_rank = (
        0
        if policy.prefer_in_progress_when_deadlines_tie
        and candidate.task.status is TaskStatus.IN_PROGRESS
        else 1
    )
    return (
        candidate.assignment.deadline,
        status_rank,
        candidate.assignment.id,
        candidate.task.id,
    )


def _require_unique_task_ids(candidates: list[PlanningCandidate]) -> None:
    task_ids = [candidate.task.id for candidate in candidates]
    if len(set(task_ids)) != len(task_ids):
        raise DomainValidationError("duplicate task ids among planning candidates")


def _normalize_windows(
    study_windows: Iterable[StudyWindow], period: PlanPeriod
) -> tuple[StudyWindow, ...]:
    ordered = sorted(study_windows, key=lambda window: (window.starts_at, window.ends_at))
    for window in ordered:
        if window.starts_at < period.start or window.ends_at > period.end:
            raise DomainValidationError("StudyWindow must lie inside the planning period")

    merged: list[StudyWindow] = []
    for window in ordered:
        if not merged or window.starts_at > merged[-1].ends_at:
            merged.append(window)
            continue
        previous = merged[-1]
        merged[-1] = StudyWindow(
            starts_at=previous.starts_at,
            ends_at=max(previous.ends_at, window.ends_at),
        )
    return tuple(merged)


def _allocate(
    *,
    task_id: TaskId,
    effort: timedelta,
    deadline: datetime,
    slots: list[_AvailableSlot],
) -> tuple[list[StudyBlock], timedelta]:
    blocks: list[StudyBlock] = []
    remaining = effort

    for slot in slots:
        if remaining == timedelta(0) or slot.starts_at >= deadline:
            break
        available_end = min(slot.ends_at, deadline)
        available = available_end - slot.starts_at
        if available <= timedelta(0):
            continue

        allocated = min(remaining, available)
        block_end = slot.starts_at + allocated
        blocks.append(StudyBlock(task_id=task_id, starts_at=slot.starts_at, ends_at=block_end))
        slot.starts_at = block_end
        remaining -= allocated

    return blocks, remaining

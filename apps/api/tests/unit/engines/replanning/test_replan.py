from datetime import UTC, datetime, timedelta

import pytest

from haui_compass.domain.plans.plan import (
    PlanPeriod,
    StudyBlock,
    StudyPlan,
    StudyWindow,
    UnplannedReason,
    UnplannedTask,
)
from haui_compass.domain.plans.replanning import (
    PlanChangeReason,
    ReflectionSignalKind,
    TaskRemainingEffort,
)
from haui_compass.domain.reflections.reflection import ReflectionPeriod
from haui_compass.domain.reflections.signals import (
    CandidateReflectionSignals,
    DeferredTaskSignal,
)
from haui_compass.domain.shared.errors import DomainValidationError
from haui_compass.domain.students.ids import StudentId
from haui_compass.domain.tasks.execution import TaskExecutionSummary
from haui_compass.domain.tasks.task import TaskStatus
from haui_compass.engines.reflection.confirm import confirm_reflection_signals
from haui_compass.engines.replanning.replan import replan_study_plan
from support.builders import make_assignment, make_task, task_id

START = datetime(2026, 10, 5, tzinfo=UTC)
PERIOD = PlanPeriod(start=START, end=START + timedelta(days=7))
EFFECTIVE = START + timedelta(days=1, hours=18)
STUDENT_ID = StudentId(task_id(900))


def at(*, day: int = 0, hour: int = 0, minute: int = 0) -> datetime:
    return START + timedelta(days=day, hours=hour, minutes=minute)


def block(task_n: int, *, day: int, hour: int, minutes: int = 60) -> StudyBlock:
    starts_at = at(day=day, hour=hour)
    return StudyBlock(
        task_id=task_id(task_n),
        starts_at=starts_at,
        ends_at=starts_at + timedelta(minutes=minutes),
    )


def window(*, day: int, hour: int, minutes: int = 60) -> StudyWindow:
    starts_at = at(day=day, hour=hour)
    return StudyWindow(starts_at=starts_at, ends_at=starts_at + timedelta(minutes=minutes))


def baseline(
    *,
    blocks: tuple[StudyBlock, ...] = (),
    unplanned: tuple[UnplannedTask, ...] = (),
) -> StudyPlan:
    return StudyPlan(
        student_id=STUDENT_ID,
        period=PERIOD,
        generated_at=START,
        blocks=blocks,
        unplanned_tasks=unplanned,
        planner_version=1,
    )


def remaining(task_n: int, minutes: int) -> TaskRemainingEffort:
    return TaskRemainingEffort(
        task_id=task_id(task_n), remaining_duration=timedelta(minutes=minutes)
    )


def execution_summary(task_n: int, *, actual_minutes: int = 30) -> TaskExecutionSummary:
    return TaskExecutionSummary(
        task_id=task_id(task_n),
        session_count=1,
        total_actual_duration=timedelta(minutes=actual_minutes),
        first_started_at=EFFECTIVE - timedelta(hours=2),
        last_activity_at=EFFECTIVE - timedelta(hours=1),
        completed_at=None,
    )


def test_canonical_replan_preserves_valid_blocks_and_changes_only_affected_tasks() -> None:
    tasks = (
        make_task(1, 1, minutes=120),
        make_task(2, 2, minutes=120),
        make_task(3, 3, status=TaskStatus.COMPLETED),
    )
    assignments = tuple(make_assignment(n, deadline=at(day=7)) for n in (1, 2, 3))
    old_plan = baseline(
        blocks=(
            block(1, day=0, hour=19),
            block(1, day=2, hour=19),
            block(1, day=3, hour=19),
            block(2, day=4, hour=19),
            block(3, day=6, hour=19),
        ),
        unplanned=(
            UnplannedTask(
                task_id=task_id(2),
                remaining_effort=timedelta(hours=1),
                reason=UnplannedReason.INSUFFICIENT_CAPACITY,
            ),
        ),
    )

    result = replan_study_plan(
        baseline_plan=old_plan,
        tasks=tasks,
        assignments=assignments,
        study_windows=(
            window(day=2, hour=19),
            window(day=3, hour=19),
            window(day=5, hour=19, minutes=120),
        ),
        remaining_efforts=(remaining(1, 120), remaining(2, 120)),
        execution_summaries=(execution_summary(2),),
        confirmed_reflections=(),
        effective_at=EFFECTIVE,
    )

    assert result.revised_plan.blocks == (
        block(1, day=0, hour=19),
        block(1, day=2, hour=19),
        block(1, day=3, hour=19),
        StudyBlock(
            task_id=task_id(2),
            starts_at=at(day=5, hour=19),
            ends_at=at(day=5, hour=21),
        ),
    )
    assert result.revised_plan.unplanned_tasks == ()
    assert [change.task_id for change in result.changes] == [task_id(2), task_id(3)]
    assert PlanChangeReason.STUDY_WINDOW_CHANGED in result.changes[0].reasons
    assert result.changes[0].had_execution_activity is True
    assert result.changes[1].reasons == (PlanChangeReason.TASK_COMPLETED,)
    assert result.summary.historical_block_count == 1
    assert result.summary.preserved_future_block_count == 2
    assert result.summary.removed_future_block_count == 2
    assert result.summary.added_future_block_count == 1
    assert result.summary.moved_duration == timedelta(hours=1)
    assert result.summary.newly_unplanned_duration == timedelta(0)


def test_no_change_baseline_emits_no_change_event() -> None:
    old_plan = baseline(blocks=(block(1, day=2, hour=19),))
    result = replan_study_plan(
        baseline_plan=old_plan,
        tasks=(make_task(1, 1),),
        assignments=(make_assignment(1, deadline=at(day=4)),),
        study_windows=(window(day=2, hour=19),),
        remaining_efforts=(remaining(1, 60),),
        execution_summaries=(),
        confirmed_reflections=(),
        effective_at=EFFECTIVE,
    )
    assert result.revised_plan.blocks == old_plan.blocks
    assert result.revised_plan.unplanned_tasks == old_plan.unplanned_tasks
    assert result.changes == ()
    assert result.summary.preserved_future_block_count == 1
    assert result.summary.removed_future_block_count == 0


def test_reduced_remaining_effort_preserves_earliest_baseline_blocks_first() -> None:
    earlier = block(1, day=2, hour=19)
    later = block(1, day=3, hour=19)
    result = replan_study_plan(
        baseline_plan=baseline(blocks=(earlier, later)),
        tasks=(make_task(1, 1, minutes=120),),
        assignments=(make_assignment(1, deadline=at(day=5)),),
        study_windows=(window(day=2, hour=19), window(day=3, hour=19)),
        remaining_efforts=(remaining(1, 60),),
        execution_summaries=(),
        confirmed_reflections=(),
        effective_at=EFFECTIVE,
    )
    assert result.revised_plan.blocks == (earlier,)
    assert result.changes[0].reasons == (PlanChangeReason.REMAINING_EFFORT_CHANGED,)
    assert result.summary.preserved_future_block_count == 1
    assert result.summary.removed_future_block_count == 1
    assert result.summary.added_future_block_count == 0


def test_crossing_block_is_frozen_whole_and_reserves_full_duration() -> None:
    effective = at(day=1, hour=19, minute=30)
    crossing = block(1, day=1, hour=19)
    old_future = block(1, day=2, hour=19)
    result = replan_study_plan(
        baseline_plan=baseline(blocks=(crossing, old_future)),
        tasks=(make_task(1, 1),),
        assignments=(make_assignment(1, deadline=at(day=5)),),
        study_windows=(window(day=1, hour=19), window(day=2, hour=19)),
        remaining_efforts=(remaining(1, 90),),
        execution_summaries=(),
        confirmed_reflections=(),
        effective_at=effective,
    )
    assert result.revised_plan.blocks[0] == crossing
    assert result.revised_plan.blocks[1].starts_at == old_future.starts_at
    assert result.revised_plan.blocks[1].duration == timedelta(minutes=30)
    assert result.summary.crossing_block_count == 1
    accounted = sum((item.duration for item in result.revised_plan.blocks), timedelta(0))
    assert accounted == timedelta(minutes=90)


def test_past_blocks_are_immutable_even_when_task_is_now_completed() -> None:
    past = block(1, day=0, hour=19)
    future = block(1, day=2, hour=19)
    result = replan_study_plan(
        baseline_plan=baseline(blocks=(past, future)),
        tasks=(make_task(1, 1, status=TaskStatus.COMPLETED),),
        assignments=(make_assignment(1, deadline=at(day=4)),),
        study_windows=(),
        remaining_efforts=(),
        execution_summaries=(),
        confirmed_reflections=(),
        effective_at=EFFECTIVE,
    )
    assert result.revised_plan.blocks == (past,)
    assert result.changes[0].reasons == (PlanChangeReason.TASK_COMPLETED,)


def test_deadline_change_removes_late_block_and_reports_unplanned_effort() -> None:
    result = replan_study_plan(
        baseline_plan=baseline(blocks=(block(1, day=3, hour=19),)),
        tasks=(make_task(1, 1),),
        assignments=(make_assignment(1, deadline=at(day=3, hour=18)),),
        study_windows=(window(day=3, hour=19),),
        remaining_efforts=(remaining(1, 60),),
        execution_summaries=(),
        confirmed_reflections=(),
        effective_at=EFFECTIVE,
    )
    assert result.revised_plan.blocks == ()
    assert result.revised_plan.unplanned_tasks[0].remaining_effort == timedelta(hours=1)
    assert result.changes[0].reasons == (
        PlanChangeReason.ASSIGNMENT_DEADLINE_CHANGED,
        PlanChangeReason.INSUFFICIENT_CAPACITY,
    )


def test_execution_duration_never_infers_remaining_effort() -> None:
    without_execution = replan_study_plan(
        baseline_plan=baseline(),
        tasks=(make_task(1, 1, minutes=600),),
        assignments=(make_assignment(1, deadline=at(day=5)),),
        study_windows=(window(day=2, hour=19, minutes=120),),
        remaining_efforts=(remaining(1, 60),),
        execution_summaries=(),
        confirmed_reflections=(),
        effective_at=EFFECTIVE,
    )
    with_execution = replan_study_plan(
        baseline_plan=baseline(),
        tasks=(make_task(1, 1, minutes=600),),
        assignments=(make_assignment(1, deadline=at(day=5)),),
        study_windows=(window(day=2, hour=19, minutes=120),),
        remaining_efforts=(remaining(1, 60),),
        execution_summaries=(execution_summary(1, actual_minutes=500),),
        confirmed_reflections=(),
        effective_at=EFFECTIVE,
    )
    assert with_execution.revised_plan == without_execution.revised_plan
    assert with_execution.changes[0].had_execution_activity is True
    assert with_execution.summary.execution_context_task_count == 1


def test_confirmed_deferred_signal_is_explicitly_informational() -> None:
    signal = DeferredTaskSignal(task_id=task_id(1))
    candidate = CandidateReflectionSignals(
        student_id=STUDENT_ID,
        period=ReflectionPeriod(start=START, end=at(day=1)),
        signals=(signal,),
    )
    confirmed = confirm_reflection_signals(
        candidate, selected=(signal,), confirmed_at=at(day=1, hour=1)
    )
    without_reflection = replan_study_plan(
        baseline_plan=baseline(blocks=(block(1, day=2, hour=19),)),
        tasks=(make_task(1, 1),),
        assignments=(make_assignment(1, deadline=at(day=5)),),
        study_windows=(window(day=2, hour=19),),
        remaining_efforts=(remaining(1, 60),),
        execution_summaries=(),
        confirmed_reflections=(),
        effective_at=EFFECTIVE,
    )
    with_reflection = replan_study_plan(
        baseline_plan=baseline(blocks=(block(1, day=2, hour=19),)),
        tasks=(make_task(1, 1),),
        assignments=(make_assignment(1, deadline=at(day=5)),),
        study_windows=(window(day=2, hour=19),),
        remaining_efforts=(remaining(1, 60),),
        execution_summaries=(),
        confirmed_reflections=(confirmed,),
        effective_at=EFFECTIVE,
    )
    assert with_reflection.revised_plan == without_reflection.revised_plan
    assert with_reflection.informational_reflection_signals == (ReflectionSignalKind.DEFERRED_TASK,)


def test_every_open_task_requires_explicit_remaining_effort() -> None:
    with pytest.raises(DomainValidationError, match="required for every open task"):
        replan_study_plan(
            baseline_plan=baseline(),
            tasks=(make_task(1, 1),),
            assignments=(make_assignment(1, deadline=at(day=5)),),
            study_windows=(),
            remaining_efforts=(),
            execution_summaries=(),
            confirmed_reflections=(),
            effective_at=EFFECTIVE,
        )


def test_crossing_duration_cannot_exceed_explicit_remaining_effort() -> None:
    effective = at(day=1, hour=19, minute=30)
    with pytest.raises(DomainValidationError, match="crossing block duration exceeds"):
        replan_study_plan(
            baseline_plan=baseline(blocks=(block(1, day=1, hour=19),)),
            tasks=(make_task(1, 1),),
            assignments=(make_assignment(1, deadline=at(day=5)),),
            study_windows=(window(day=1, hour=19),),
            remaining_efforts=(remaining(1, 30),),
            execution_summaries=(),
            confirmed_reflections=(),
            effective_at=effective,
        )


def test_replan_is_deterministic_across_input_order() -> None:
    tasks = (make_task(2, 2), make_task(1, 1))
    assignments = (
        make_assignment(2, deadline=at(day=5)),
        make_assignment(1, deadline=at(day=4)),
    )
    windows = (window(day=3, hour=19), window(day=2, hour=19))
    efforts = (remaining(2, 60), remaining(1, 60))
    forward = replan_study_plan(
        baseline_plan=baseline(),
        tasks=tasks,
        assignments=assignments,
        study_windows=windows,
        remaining_efforts=efforts,
        execution_summaries=(),
        confirmed_reflections=(),
        effective_at=EFFECTIVE,
    )
    backward = replan_study_plan(
        baseline_plan=baseline(),
        tasks=tuple(reversed(tasks)),
        assignments=tuple(reversed(assignments)),
        study_windows=tuple(reversed(windows)),
        remaining_efforts=tuple(reversed(efforts)),
        execution_summaries=(),
        confirmed_reflections=(),
        effective_at=EFFECTIVE,
    )
    assert forward == backward


def test_capacity_shortfall_conserves_exact_remaining_effort() -> None:
    result = replan_study_plan(
        baseline_plan=baseline(),
        tasks=(make_task(1, 1),),
        assignments=(make_assignment(1, deadline=at(day=5)),),
        study_windows=(window(day=2, hour=19),),
        remaining_efforts=(remaining(1, 150),),
        execution_summaries=(),
        confirmed_reflections=(),
        effective_at=EFFECTIVE,
    )
    planned = sum((item.duration for item in result.revised_plan.blocks), timedelta(0))
    unplanned = result.revised_plan.unplanned_tasks[0]
    assert planned + unplanned.remaining_effort == timedelta(minutes=150)
    assert unplanned.reason is UnplannedReason.INSUFFICIENT_CAPACITY
    assert PlanChangeReason.INSUFFICIENT_CAPACITY in result.changes[0].reasons


def test_changed_unplanned_reason_is_audited_even_when_effort_is_unchanged() -> None:
    old_unplanned = UnplannedTask(
        task_id=task_id(1),
        remaining_effort=timedelta(hours=1),
        reason=UnplannedReason.INSUFFICIENT_CAPACITY,
    )
    result = replan_study_plan(
        baseline_plan=baseline(unplanned=(old_unplanned,)),
        tasks=(make_task(1, 1),),
        assignments=(make_assignment(1, deadline=at(day=5)),),
        study_windows=(),
        remaining_efforts=(remaining(1, 60),),
        execution_summaries=(),
        confirmed_reflections=(),
        effective_at=EFFECTIVE,
    )
    assert result.revised_plan.unplanned_tasks[0].reason is (
        UnplannedReason.NO_STUDY_WINDOW_BEFORE_DEADLINE
    )
    assert result.changes[0].baseline_unplanned_reason is (UnplannedReason.INSUFFICIENT_CAPACITY)
    assert result.changes[0].revised_unplanned_reason is (
        UnplannedReason.NO_STUDY_WINDOW_BEFORE_DEADLINE
    )

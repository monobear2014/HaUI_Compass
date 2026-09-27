from datetime import UTC, datetime, timedelta
from itertools import pairwise

import pytest

from haui_compass.domain.plans.plan import (
    PlanPeriod,
    StudyPlan,
    StudyWindow,
    UnplannedReason,
)
from haui_compass.domain.plans.planning import (
    DEFAULT_PLANNING_POLICY,
    PlanningCandidate,
    PlanningPolicy,
)
from haui_compass.domain.shared.errors import DomainValidationError
from haui_compass.domain.students.ids import StudentId
from haui_compass.domain.tasks.task import TaskStatus
from haui_compass.engines.planning.schedule import generate_weekly_plan
from support.builders import assignment_id, make_assignment, make_task, task_id

PERIOD_START = datetime(2026, 10, 5, 0, 0, tzinfo=UTC)
PERIOD = PlanPeriod(start=PERIOD_START, end=PERIOD_START + timedelta(days=7))
GENERATED_AT = PERIOD_START - timedelta(hours=1)
STUDENT_ID = StudentId(task_id(900))


def at(*, days: int = 0, hours: int = 0, minutes: int = 0) -> datetime:
    return PERIOD_START + timedelta(days=days, hours=hours, minutes=minutes)


def window(*, day: int, start_hour: int, hours: int) -> StudyWindow:
    starts_at = at(days=day, hours=start_hour)
    return StudyWindow(starts_at=starts_at, ends_at=starts_at + timedelta(hours=hours))


def candidate(
    n: int,
    *,
    assignment_n: int | None = None,
    minutes: int = 60,
    deadline: datetime | None = None,
    status: TaskStatus = TaskStatus.NOT_STARTED,
) -> PlanningCandidate:
    assignment_number = assignment_n if assignment_n is not None else n
    return PlanningCandidate(
        task=make_task(n, assignment_number, minutes=minutes, status=status),
        assignment=make_assignment(
            assignment_number,
            deadline=deadline if deadline is not None else at(days=5),
        ),
    )


def plan(
    candidates: tuple[PlanningCandidate, ...],
    windows: tuple[StudyWindow, ...],
    policy: PlanningPolicy | None = None,
) -> StudyPlan:
    return generate_weekly_plan(
        student_id=STUDENT_ID,
        candidates=candidates,
        period=PERIOD,
        study_windows=windows,
        generated_at=GENERATED_AT,
        policy=policy if policy is not None else DEFAULT_PLANNING_POLICY,
    )


def test_one_task_uses_one_window() -> None:
    result = plan((candidate(1, minutes=60),), (window(day=0, start_hour=19, hours=2),))
    assert [(block.task_id, block.starts_at, block.ends_at) for block in result.blocks] == [
        (task_id(1), at(hours=19), at(hours=20))
    ]
    assert result.unplanned_tasks == ()


def test_canonical_three_task_plan_is_feasible_and_ordered() -> None:
    candidates = (
        candidate(1, minutes=120, deadline=at(days=1, hours=23)),
        candidate(2, minutes=180, deadline=at(days=4, hours=23)),
        candidate(3, minutes=60, deadline=at(days=4, hours=23)),
    )
    windows = tuple(window(day=day, start_hour=19, hours=2) for day in range(4))
    result = plan(candidates, windows)

    assert [(block.task_id, block.duration) for block in result.blocks] == [
        (task_id(1), timedelta(hours=2)),
        (task_id(2), timedelta(hours=2)),
        (task_id(2), timedelta(hours=1)),
        (task_id(3), timedelta(hours=1)),
    ]
    assert result.unplanned_tasks == ()
    assert sum((block.duration for block in result.blocks), timedelta(0)) == timedelta(hours=6)


def test_long_task_splits_across_windows() -> None:
    result = plan(
        (candidate(1, minutes=180),),
        (
            window(day=0, start_hour=19, hours=1),
            window(day=1, start_hour=18, hours=2),
        ),
    )
    assert [block.duration for block in result.blocks] == [timedelta(hours=1), timedelta(hours=2)]
    assert {block.task_id for block in result.blocks} == {task_id(1)}


def test_completed_task_is_ignored() -> None:
    result = plan(
        (candidate(1, status=TaskStatus.COMPLETED),),
        (window(day=0, start_hour=19, hours=1),),
    )
    assert result.blocks == ()
    assert result.unplanned_tasks == ()


def test_in_progress_task_wins_when_deadlines_tie() -> None:
    result = plan(
        (
            candidate(1, status=TaskStatus.NOT_STARTED),
            candidate(2, status=TaskStatus.IN_PROGRESS),
        ),
        (window(day=0, start_hour=19, hours=1),),
    )
    assert result.blocks[0].task_id == task_id(2)
    assert result.unplanned_tasks[0].task_id == task_id(1)


def test_policy_can_disable_in_progress_preference() -> None:
    result = plan(
        (
            candidate(2, status=TaskStatus.IN_PROGRESS),
            candidate(1, status=TaskStatus.NOT_STARTED),
        ),
        (window(day=0, start_hour=19, hours=1),),
        PlanningPolicy(planner_version=8, prefer_in_progress_when_deadlines_tie=False),
    )
    assert result.planner_version == 8
    assert result.blocks[0].task_id == task_id(1)


def test_deadline_is_a_hard_block_end() -> None:
    result = plan(
        (candidate(1, minutes=120, deadline=at(hours=20)),),
        (window(day=0, start_hour=19, hours=3),),
    )
    assert result.blocks[0].ends_at == at(hours=20)
    assert result.unplanned_tasks[0].remaining_effort == timedelta(hours=1)
    assert result.unplanned_tasks[0].reason is UnplannedReason.INSUFFICIENT_CAPACITY


def test_insufficient_capacity_reports_exact_remaining_effort() -> None:
    result = plan(
        (candidate(1, minutes=180),),
        (window(day=0, start_hour=19, hours=2),),
    )
    assert sum((block.duration for block in result.blocks), timedelta(0)) == timedelta(hours=2)
    assert result.unplanned_tasks[0].remaining_effort == timedelta(hours=1)
    assert result.unplanned_tasks[0].reason is UnplannedReason.INSUFFICIENT_CAPACITY


def test_no_window_before_deadline_has_typed_reason() -> None:
    result = plan(
        (candidate(1, deadline=at(hours=18)),),
        (window(day=0, start_hour=19, hours=2),),
    )
    assert result.blocks == ()
    assert result.unplanned_tasks[0].reason is UnplannedReason.NO_STUDY_WINDOW_BEFORE_DEADLINE


def test_exact_fit_consumes_capacity_without_unplanned_work() -> None:
    result = plan(
        (candidate(1, minutes=120),),
        (window(day=0, start_hour=19, hours=2),),
    )
    assert result.blocks[0].duration == timedelta(hours=2)
    assert result.unplanned_tasks == ()


def test_unused_capacity_does_not_create_blocks() -> None:
    result = plan(
        (candidate(1, minutes=30),),
        (window(day=0, start_hour=19, hours=2),),
    )
    assert len(result.blocks) == 1
    assert result.blocks[0].ends_at == at(hours=19, minutes=30)


def test_overlapping_and_touching_windows_are_merged_without_double_counting() -> None:
    result = plan(
        (candidate(1, minutes=240),),
        (
            window(day=0, start_hour=19, hours=2),
            window(day=0, start_hour=20, hours=2),
            window(day=0, start_hour=22, hours=1),
        ),
    )
    assert len(result.blocks) == 1
    assert result.blocks[0].duration == timedelta(hours=4)
    assert result.unplanned_tasks == ()


def test_stable_ids_break_complete_tie_independently_of_input_order() -> None:
    first = plan(
        (candidate(2, assignment_n=2), candidate(1, assignment_n=1)),
        (window(day=0, start_hour=19, hours=1),),
    )
    second = plan(
        (candidate(1, assignment_n=1), candidate(2, assignment_n=2)),
        (window(day=0, start_hour=19, hours=1),),
    )
    assert first == second
    assert first.blocks[0].task_id == task_id(1)


def test_window_input_order_does_not_change_plan() -> None:
    windows = (
        window(day=1, start_hour=19, hours=1),
        window(day=0, start_hour=19, hours=1),
    )
    forward = plan((candidate(1, minutes=120),), windows)
    backward = plan((candidate(1, minutes=120),), tuple(reversed(windows)))
    assert forward == backward


def test_empty_task_set_is_valid() -> None:
    result = plan((), (window(day=0, start_hour=19, hours=1),))
    assert result.blocks == ()
    assert result.unplanned_tasks == ()


def test_empty_window_set_reports_open_work() -> None:
    result = plan((candidate(1),), ())
    assert result.blocks == ()
    assert result.unplanned_tasks[0].reason is UnplannedReason.NO_STUDY_WINDOW_BEFORE_DEADLINE


def test_zero_duration_task_needs_no_block() -> None:
    result = plan((candidate(1, minutes=0),), ())
    assert result.blocks == ()
    assert result.unplanned_tasks == ()


def test_window_must_be_inside_period() -> None:
    outside = StudyWindow(
        starts_at=PERIOD.start - timedelta(hours=1),
        ends_at=PERIOD.start + timedelta(hours=1),
    )
    with pytest.raises(DomainValidationError, match="inside the planning period"):
        plan((), (outside,))


def test_duplicate_task_ids_are_rejected() -> None:
    duplicated = candidate(1)
    with pytest.raises(DomainValidationError, match="duplicate task ids"):
        plan((duplicated, duplicated), ())


def test_blocks_never_overlap() -> None:
    result = plan(
        (candidate(1), candidate(2), candidate(3)),
        (window(day=0, start_hour=19, hours=3),),
    )
    assert all(
        previous.ends_at <= current.starts_at for previous, current in pairwise(result.blocks)
    )


def test_assignment_id_breaks_tie_before_task_id() -> None:
    result = plan(
        (
            PlanningCandidate(
                task=make_task(1, 2),
                assignment=make_assignment(2, deadline=at(days=3)),
            ),
            PlanningCandidate(
                task=make_task(2, 1),
                assignment=make_assignment(1, deadline=at(days=3)),
            ),
        ),
        (window(day=0, start_hour=19, hours=1),),
    )
    assert result.blocks[0].task_id == task_id(2)
    assert result.unplanned_tasks[0].task_id == task_id(1)
    assert assignment_id(1) < assignment_id(2)

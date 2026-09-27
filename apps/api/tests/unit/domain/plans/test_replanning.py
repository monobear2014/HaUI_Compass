from dataclasses import FrozenInstanceError
from datetime import UTC, datetime, timedelta, timezone

import pytest

from haui_compass.domain.plans.plan import PlanPeriod, StudyBlock, StudyPlan
from haui_compass.domain.plans.replanning import (
    PlanChange,
    PlanChangeReason,
    ReflectionSignalKind,
    ReplanningPolicy,
    ReplanningResult,
    ReplanningSummary,
    TaskRemainingEffort,
)
from haui_compass.domain.shared.errors import DomainValidationError
from haui_compass.domain.students.ids import StudentId
from support.builders import task_id

START = datetime(2026, 10, 5, 0, 0, tzinfo=UTC)
PERIOD = PlanPeriod(start=START, end=START + timedelta(days=7))
STUDENT_ID = StudentId(task_id(800))


def block(n: int, hour: int = 19) -> StudyBlock:
    starts_at = START + timedelta(hours=hour)
    return StudyBlock(
        task_id=task_id(n),
        starts_at=starts_at,
        ends_at=starts_at + timedelta(hours=1),
    )


def empty_plan() -> StudyPlan:
    return StudyPlan(
        student_id=STUDENT_ID,
        period=PERIOD,
        generated_at=START,
        blocks=(),
        unplanned_tasks=(),
        planner_version=1,
    )


def summary() -> ReplanningSummary:
    return ReplanningSummary(
        historical_block_count=0,
        crossing_block_count=0,
        preserved_future_block_count=0,
        removed_future_block_count=0,
        added_future_block_count=0,
        moved_duration=timedelta(0),
        newly_unplanned_duration=timedelta(0),
        execution_context_task_count=0,
    )


def test_remaining_effort_is_non_negative_and_immutable() -> None:
    effort = TaskRemainingEffort(task_id=task_id(1), remaining_duration=timedelta(minutes=30))
    with pytest.raises(FrozenInstanceError):
        effort.remaining_duration = timedelta(0)  # type: ignore[misc]
    with pytest.raises(DomainValidationError, match="must not be negative"):
        TaskRemainingEffort(task_id=task_id(1), remaining_duration=timedelta(minutes=-1))


def test_replanning_policy_requires_positive_version() -> None:
    with pytest.raises(DomainValidationError, match="at least 1"):
        ReplanningPolicy(replanner_version=0)


def test_plan_change_requires_reason_and_real_difference() -> None:
    with pytest.raises(DomainValidationError, match="at least one reason"):
        PlanChange(
            task_id=task_id(1),
            reasons=(),
            baseline_future_blocks=(block(1),),
            revised_future_blocks=(),
            baseline_unplanned_effort=timedelta(0),
            revised_unplanned_effort=timedelta(0),
            baseline_unplanned_reason=None,
            revised_unplanned_reason=None,
            had_execution_activity=False,
        )
    with pytest.raises(DomainValidationError, match="actual plan modification"):
        PlanChange(
            task_id=task_id(1),
            reasons=(PlanChangeReason.REMAINING_EFFORT_CHANGED,),
            baseline_future_blocks=(),
            revised_future_blocks=(),
            baseline_unplanned_effort=timedelta(0),
            revised_unplanned_effort=timedelta(0),
            baseline_unplanned_reason=None,
            revised_unplanned_reason=None,
            had_execution_activity=False,
        )


def test_result_normalizes_time_and_reflection_kinds() -> None:
    vietnam = timezone(timedelta(hours=7))
    result = ReplanningResult(
        revised_plan=empty_plan(),
        effective_at=datetime(2026, 10, 5, 8, 0, tzinfo=vietnam),
        changes=(),
        summary=summary(),
        informational_reflection_signals=(
            ReflectionSignalKind.WORKLOAD_FEEDBACK,
            ReflectionSignalKind.DEFERRED_TASK,
            ReflectionSignalKind.WORKLOAD_FEEDBACK,
        ),
        replanner_version=1,
    )
    assert result.effective_at == datetime(2026, 10, 5, 1, 0, tzinfo=UTC)
    assert result.informational_reflection_signals == (
        ReflectionSignalKind.DEFERRED_TASK,
        ReflectionSignalKind.WORKLOAD_FEEDBACK,
    )


@pytest.mark.parametrize(
    "effective_at",
    [START - timedelta(microseconds=1), PERIOD.end + timedelta(microseconds=1)],
)
def test_result_requires_effective_at_inside_period(effective_at: datetime) -> None:
    with pytest.raises(DomainValidationError, match="inside plan period"):
        ReplanningResult(
            revised_plan=empty_plan(),
            effective_at=effective_at,
            changes=(),
            summary=summary(),
            informational_reflection_signals=(),
            replanner_version=1,
        )

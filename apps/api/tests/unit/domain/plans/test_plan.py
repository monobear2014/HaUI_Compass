from collections.abc import Callable
from dataclasses import FrozenInstanceError
from datetime import UTC, datetime, timedelta, timezone
from typing import Any

import pytest

from haui_compass.domain.plans.plan import (
    PlanPeriod,
    StudyBlock,
    StudyPlan,
    StudyWindow,
    UnplannedReason,
    UnplannedTask,
)
from haui_compass.domain.shared.errors import DomainValidationError
from haui_compass.domain.students.ids import StudentId
from support.builders import task_id

START = datetime(2026, 10, 5, 0, 0, tzinfo=UTC)
END = START + timedelta(days=7)
STUDENT_ID = StudentId(task_id(999))


@pytest.mark.parametrize("type_", [PlanPeriod, StudyWindow, StudyBlock])
def test_time_range_rejects_naive_start(type_: Callable[..., Any]) -> None:
    kwargs = (
        {"start": START.replace(tzinfo=None), "end": END}
        if type_ is PlanPeriod
        else {
            "starts_at": START.replace(tzinfo=None),
            "ends_at": END,
            **({"task_id": task_id(1)} if type_ is StudyBlock else {}),
        }
    )
    with pytest.raises(DomainValidationError, match="timezone-aware"):
        type_(**kwargs)


@pytest.mark.parametrize("type_", [PlanPeriod, StudyWindow, StudyBlock])
def test_time_range_must_have_positive_duration(type_: Callable[..., Any]) -> None:
    kwargs = (
        {"start": START, "end": START}
        if type_ is PlanPeriod
        else {
            "starts_at": START,
            "ends_at": START,
            **({"task_id": task_id(1)} if type_ is StudyBlock else {}),
        }
    )
    with pytest.raises(DomainValidationError, match="strictly after"):
        type_(**kwargs)


def test_study_window_normalizes_to_utc_and_derives_duration() -> None:
    vietnam = timezone(timedelta(hours=7))
    window = StudyWindow(
        starts_at=datetime(2026, 10, 5, 19, 0, tzinfo=vietnam),
        ends_at=datetime(2026, 10, 5, 21, 0, tzinfo=vietnam),
    )
    assert window.starts_at == datetime(2026, 10, 5, 12, 0, tzinfo=UTC)
    assert window.duration == timedelta(hours=2)


def test_study_block_is_immutable() -> None:
    block = StudyBlock(task_id=task_id(1), starts_at=START, ends_at=START + timedelta(hours=1))
    with pytest.raises(FrozenInstanceError):
        block.starts_at = START + timedelta(hours=2)  # type: ignore[misc]


def test_unplanned_task_requires_positive_effort() -> None:
    with pytest.raises(DomainValidationError, match="must be positive"):
        UnplannedTask(
            task_id=task_id(1),
            remaining_effort=timedelta(0),
            reason=UnplannedReason.INSUFFICIENT_CAPACITY,
        )


def test_study_plan_normalizes_order_and_generation_time() -> None:
    later = StudyBlock(
        task_id=task_id(2), starts_at=START + timedelta(hours=2), ends_at=START + timedelta(hours=3)
    )
    earlier = StudyBlock(task_id=task_id(1), starts_at=START, ends_at=START + timedelta(hours=1))
    vietnam = timezone(timedelta(hours=7))
    plan = StudyPlan(
        student_id=STUDENT_ID,
        period=PlanPeriod(start=START, end=END),
        generated_at=datetime(2026, 10, 5, 19, 0, tzinfo=vietnam),
        blocks=(later, earlier),
        unplanned_tasks=(),
        planner_version=1,
    )
    assert plan.blocks == (earlier, later)
    assert plan.generated_at == datetime(2026, 10, 5, 12, 0, tzinfo=UTC)


def test_study_plan_rejects_overlapping_blocks() -> None:
    with pytest.raises(DomainValidationError, match="must not overlap"):
        StudyPlan(
            student_id=STUDENT_ID,
            period=PlanPeriod(start=START, end=END),
            generated_at=START,
            blocks=(
                StudyBlock(task_id=task_id(1), starts_at=START, ends_at=START + timedelta(hours=2)),
                StudyBlock(
                    task_id=task_id(2),
                    starts_at=START + timedelta(hours=1),
                    ends_at=START + timedelta(hours=3),
                ),
            ),
            unplanned_tasks=(),
            planner_version=1,
        )


def test_study_plan_rejects_block_outside_period() -> None:
    with pytest.raises(DomainValidationError, match="inside the planning period"):
        StudyPlan(
            student_id=STUDENT_ID,
            period=PlanPeriod(start=START, end=END),
            generated_at=START,
            blocks=(
                StudyBlock(
                    task_id=task_id(1),
                    starts_at=START - timedelta(minutes=1),
                    ends_at=START + timedelta(minutes=30),
                ),
            ),
            unplanned_tasks=(),
            planner_version=1,
        )


def test_study_plan_rejects_duplicate_unplanned_tasks() -> None:
    item = UnplannedTask(
        task_id=task_id(1),
        remaining_effort=timedelta(minutes=30),
        reason=UnplannedReason.INSUFFICIENT_CAPACITY,
    )
    with pytest.raises(DomainValidationError, match="at most one"):
        StudyPlan(
            student_id=STUDENT_ID,
            period=PlanPeriod(start=START, end=END),
            generated_at=START,
            blocks=(),
            unplanned_tasks=(item, item),
            planner_version=1,
        )

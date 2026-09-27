from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path

import pytest

from haui_compass.application.use_cases.generate_weekly_plan import (
    GenerateWeeklyPlan,
    GenerateWeeklyPlanRequest,
    WeeklyPlanInputError,
    WeeklyPlanInputErrorCode,
)
from haui_compass.domain.assignments.assignment import Assignment
from haui_compass.domain.plans.plan import PlanPeriod, StudyWindow, UnplannedReason
from haui_compass.domain.plans.planning import PlanningPolicy
from haui_compass.domain.students.ids import StudentId
from haui_compass.domain.tasks.task import Task, TaskStatus
from support.builders import make_assignment, make_task, task_id

START = datetime(2026, 10, 5, 0, 0, tzinfo=UTC)
PERIOD = PlanPeriod(start=START, end=START + timedelta(days=7))
STUDENT_ID = StudentId(task_id(950))


def request(
    *,
    tasks: tuple[Task, ...] = (),
    assignments: tuple[Assignment, ...] = (),
    windows: tuple[StudyWindow, ...] = (),
    generated_at: datetime = START,
) -> GenerateWeeklyPlanRequest:
    return GenerateWeeklyPlanRequest(
        student_id=STUDENT_ID,
        tasks=tasks,
        assignments=assignments,
        period=PERIOD,
        study_windows=windows,
        generated_at=generated_at,
    )


def test_successful_weekly_plan() -> None:
    assignment = make_assignment(1, deadline=START + timedelta(days=3))
    task = make_task(1, 1, minutes=90)
    starts_at = START + timedelta(hours=19)
    result = GenerateWeeklyPlan().execute(
        request(
            tasks=(task,),
            assignments=(assignment,),
            windows=(StudyWindow(starts_at=starts_at, ends_at=starts_at + timedelta(hours=2)),),
        )
    )
    assert len(result.blocks) == 1
    assert result.blocks[0].task_id == task.id
    assert result.blocks[0].duration == timedelta(minutes=90)
    assert result.unplanned_tasks == ()


def test_infeasible_workload_is_returned_not_raised_or_dropped() -> None:
    assignment = make_assignment(1, deadline=START + timedelta(days=1))
    starts_at = START + timedelta(hours=19)
    result = GenerateWeeklyPlan().execute(
        request(
            tasks=(make_task(1, 1, minutes=180),),
            assignments=(assignment,),
            windows=(StudyWindow(starts_at=starts_at, ends_at=starts_at + timedelta(hours=1)),),
        )
    )
    assert result.blocks[0].duration == timedelta(hours=1)
    assert result.unplanned_tasks[0].remaining_effort == timedelta(hours=2)
    assert result.unplanned_tasks[0].reason is UnplannedReason.INSUFFICIENT_CAPACITY


def test_generation_time_is_explicit_and_normalized_consistently() -> None:
    vietnam = timezone(timedelta(hours=7))
    generated_at = datetime(2026, 10, 5, 12, 30, tzinfo=vietnam)
    result = GenerateWeeklyPlan().execute(request(generated_at=generated_at))
    assert result.generated_at == datetime(2026, 10, 5, 5, 30, tzinfo=UTC)


def test_injected_policy_is_honored() -> None:
    deadline = START + timedelta(days=3)
    assignments = (
        make_assignment(1, deadline=deadline),
        make_assignment(2, deadline=deadline),
    )
    tasks = (
        make_task(2, 2, status=TaskStatus.IN_PROGRESS),
        make_task(1, 1, status=TaskStatus.NOT_STARTED),
    )
    starts_at = START + timedelta(hours=19)
    result = GenerateWeeklyPlan(
        policy=PlanningPolicy(
            planner_version=7,
            prefer_in_progress_when_deadlines_tie=False,
        )
    ).execute(
        request(
            tasks=tasks,
            assignments=assignments,
            windows=(StudyWindow(starts_at=starts_at, ends_at=starts_at + timedelta(hours=1)),),
        )
    )
    assert result.planner_version == 7
    assert result.blocks[0].task_id == task_id(1)


@pytest.mark.parametrize(
    ("tasks", "assignments", "code"),
    [
        (
            (make_task(1, 1), make_task(1, 1)),
            (make_assignment(1, deadline=START + timedelta(days=1)),),
            WeeklyPlanInputErrorCode.DUPLICATE_TASK_ID,
        ),
        (
            (make_task(1, 1),),
            (),
            WeeklyPlanInputErrorCode.TASK_FOR_UNKNOWN_ASSIGNMENT,
        ),
        (
            (),
            (
                make_assignment(1, deadline=START + timedelta(days=1)),
                make_assignment(1, deadline=START + timedelta(days=2)),
            ),
            WeeklyPlanInputErrorCode.DUPLICATE_ASSIGNMENT_ID,
        ),
    ],
)
def test_contradictory_input_has_typed_error(
    tasks: tuple[Task, ...],
    assignments: tuple[Assignment, ...],
    code: WeeklyPlanInputErrorCode,
) -> None:
    with pytest.raises(WeeklyPlanInputError) as error:
        GenerateWeeklyPlan().execute(request(tasks=tasks, assignments=assignments))
    assert error.value.code is code


def test_use_case_has_no_outer_layer_or_forbidden_capability_imports() -> None:
    source = Path("src/haui_compass/application/use_cases/generate_weekly_plan.py").read_text()
    assert "haui_compass.infrastructure" not in source
    assert "application.ports.lms" not in source
    assert "application.ports.clock" not in source
    assert "haui_compass.ai" not in source
    assert "domain.reflections" not in source

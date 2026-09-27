from datetime import UTC, datetime, timedelta
from pathlib import Path

from haui_compass.application.use_cases.replan_study_plan import (
    ReplanStudyPlan,
    ReplanStudyPlanRequest,
)
from haui_compass.domain.plans.plan import PlanPeriod, StudyPlan, StudyWindow
from haui_compass.domain.plans.planning import PlanningPolicy
from haui_compass.domain.plans.replanning import ReplanningPolicy, TaskRemainingEffort
from haui_compass.domain.students.ids import StudentId
from support.builders import make_assignment, make_task, task_id

START = datetime(2026, 10, 5, tzinfo=UTC)
PERIOD = PlanPeriod(start=START, end=START + timedelta(days=7))
STUDENT_ID = StudentId(task_id(990))


def test_use_case_delegates_complete_explicit_request_and_policies() -> None:
    task = make_task(1, 1, minutes=180)
    assignment = make_assignment(1, deadline=START + timedelta(days=3))
    window_start = START + timedelta(days=1, hours=19)
    result = ReplanStudyPlan(
        policy=ReplanningPolicy(replanner_version=4),
        planning_policy=PlanningPolicy(
            planner_version=8,
            prefer_in_progress_when_deadlines_tie=True,
        ),
    ).execute(
        ReplanStudyPlanRequest(
            baseline_plan=StudyPlan(
                student_id=STUDENT_ID,
                period=PERIOD,
                generated_at=START,
                blocks=(),
                unplanned_tasks=(),
                planner_version=1,
            ),
            tasks=(task,),
            assignments=(assignment,),
            study_windows=(
                StudyWindow(
                    starts_at=window_start,
                    ends_at=window_start + timedelta(hours=1),
                ),
            ),
            remaining_efforts=(
                TaskRemainingEffort(
                    task_id=task.id,
                    remaining_duration=timedelta(hours=2),
                ),
            ),
            execution_summaries=(),
            confirmed_reflections=(),
            effective_at=START + timedelta(hours=12),
        )
    )
    assert result.replanner_version == 4
    assert result.revised_plan.planner_version == 8
    assert result.revised_plan.blocks[0].duration == timedelta(hours=1)
    assert result.revised_plan.unplanned_tasks[0].remaining_effort == timedelta(hours=1)


def test_use_case_has_no_outer_layer_or_forbidden_capability_imports() -> None:
    source = Path("src/haui_compass/application/use_cases/replan_study_plan.py").read_text()
    assert "haui_compass.infrastructure" not in source
    assert "application.ports.lms" not in source
    assert "application.ports.clock" not in source
    assert "haui_compass.ai" not in source

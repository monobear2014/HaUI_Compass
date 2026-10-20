"""Workspace context snapshot shared by the showcase demo and per-user simulated workspaces.

Pure read-side composition over existing repositories and the fixture records: no seeding, no
clock control and no app construction happen here.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Literal
from uuid import UUID

from haui_compass.api.dependencies import AppContainer
from haui_compass.api.schemas.common import ApiModel
from haui_compass.application.lms_mapping import assignment_id_for, student_id_for
from haui_compass.domain.plans.plan import PlanPeriod, StudyWindow
from haui_compass.infrastructure.demo.scenarios import LABELS as DEMO_LABELS
from haui_compass.infrastructure.demo.scenarios import Scenario, ScenarioId

DEMO_MODE = "fictional_in_memory_demo"
SIMULATED_WORKSPACE_MODE = "simulated_canvas_workspace"


class DemoTaskDTO(ApiModel):
    id: UUID
    title: str
    assignment_id: UUID
    assignment_title: str
    course: str
    deadline: datetime
    estimated_duration_seconds: int
    status: str


class DemoAssignmentDTO(ApiModel):
    assignment_id: UUID
    provider: str
    external_id: str
    title: str
    course: str
    deadline: datetime
    existing_task_count: int
    instructions: str | None = None
    source_label: str | None = None
    submitted_at: datetime | None = None


class DemoContextDTO(ApiModel):
    mode: str = DEMO_MODE
    scenario_id: str
    scenario_label: str
    generation: int
    student: dict[str, str]
    period: dict[str, datetime]
    study_windows: list[dict[str, datetime]]
    available_minutes: int
    assignment_capacities: list[dict[str, UUID | int]]
    now: datetime
    assignments: list[DemoAssignmentDTO]
    tasks: list[DemoTaskDTO]


class SelectScenarioDTO(ApiModel):
    scenario_id: ScenarioId


class AdvanceClockDTO(ApiModel):
    to: Literal["next_day", "next_week"]


@dataclass(frozen=True)
class DemoSession:
    container: AppContainer
    scenario: Scenario
    generation: int
    mode: str = DEMO_MODE


def current_week(scenario: Scenario, now: datetime) -> tuple[PlanPeriod, int]:
    weeks = max(0, (now - scenario.period.start) // timedelta(days=7))
    shift = timedelta(days=7 * weeks)
    return (
        PlanPeriod(start=scenario.period.start + shift, end=scenario.period.end + shift),
        weeks,
    )


def current_windows(
    session: "DemoSession", period: PlanPeriod, weeks: int
) -> tuple[StudyWindow, ...]:
    """The student's saved free time for this week, else the fixture's usual free time."""
    container, scenario = session.container, session.scenario
    goal = container.weekly_cycle.goals(scenario.student)
    saved = next((g for g in goal if g.period == period), None)
    if saved is not None:
        return saved.study_windows
    shift = timedelta(days=7 * weeks)
    return tuple(
        StudyWindow(starts_at=w.starts_at + shift, ends_at=w.ends_at + shift)
        for w in scenario.windows
    )


def snapshot(session: DemoSession) -> DemoContextDTO:
    container, scenario = session.container, session.scenario
    now = container.clock.now()
    period, weeks = current_week(scenario, now)
    windows = current_windows(session, period, weeks)
    courses = {c.ref: c.name for c in scenario.records[0]}
    assignments = {assignment_id_for(a.ref): a for a in scenario.records[1]}
    tasks = []
    for record in container.task_repository.list_for_student(student_id_for(scenario.student)):
        task = record.task
        assignment = assignments[task.assignment_id]
        assert assignment.deadline is not None
        tasks.append(
            DemoTaskDTO(
                id=task.id,
                title=task.title,
                assignment_id=task.assignment_id,
                assignment_title=assignment.title,
                course=courses[assignment.course_ref],
                deadline=assignment.deadline,
                estimated_duration_seconds=int(task.estimated_duration.total_seconds()),
                status=task.status.value,
            )
        )
    assignment_rows = [
        DemoAssignmentDTO(
            assignment_id=assignment_id_for(assignment.ref),
            provider=assignment.ref.provider,
            external_id=assignment.ref.id,
            title=assignment.title,
            course=courses[assignment.course_ref],
            deadline=assignment.deadline,
            instructions=assignment.instructions,
            source_label=assignment.source_label,
            existing_task_count=sum(
                1 for task in tasks if task.assignment_id == assignment_id_for(assignment.ref)
            ),
        )
        for assignment in scenario.records[1]
        if assignment.deadline is not None
    ]
    # Explicit fixture capacity from authored non-overlapping windows. This is input preparation,
    # not risk computation or reserved time per assignment. Risk inputs remain seed estimates.
    capacities: list[dict[str, UUID | int]] = []
    for aid, assignment in assignments.items():
        assert assignment.deadline is not None
        duration = sum(
            (
                max(timedelta(0), min(w.ends_at, assignment.deadline) - max(w.starts_at, now))
                for w in windows
            ),
            timedelta(0),
        )
        capacities.append(
            {"assignment_id": aid, "available_minutes": int(duration.total_seconds() / 60)}
        )
    return DemoContextDTO(
        mode=session.mode,
        scenario_id=scenario.id.value,
        scenario_label=DEMO_LABELS[scenario.id],
        generation=session.generation,
        student={"provider": scenario.student.provider, "id": scenario.student.id},
        period={"start": period.start, "end": period.end},
        study_windows=[{"starts_at": w.starts_at, "ends_at": w.ends_at} for w in windows],
        available_minutes=int(
            sum((w.ends_at - w.starts_at for w in windows), timedelta(0)).total_seconds() / 60
        ),
        assignment_capacities=capacities,
        now=now,
        assignments=assignment_rows,
        tasks=tasks,
    )

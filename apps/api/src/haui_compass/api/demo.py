"""Opt-in, fictional, single-presenter showcase. No reset route in the normal API."""

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import cast
from uuid import UUID

from fastapi import FastAPI

from haui_compass.api.dependencies import (
    AppContainer,
    build_container,
)
from haui_compass.api.main import create_app
from haui_compass.api.schemas.common import ApiModel
from haui_compass.api.v1.routes import container_from_app
from haui_compass.application.lms_mapping import assignment_id_for, student_id_for
from haui_compass.application.ports.clock import Clock
from haui_compass.application.ports.study_plans import PlanRecordId
from haui_compass.application.ports.tasks import StoredTask
from haui_compass.application.use_cases.persisted_learning_loop import (
    GeneratePersistedWeeklyPlanRequest,
)
from haui_compass.infrastructure.demo.scenarios import (
    LABELS as DEMO_LABELS,
)
from haui_compass.infrastructure.demo.scenarios import (
    DemoClock,
    Scenario,
    ScenarioId,
    scenario_data,
)
from haui_compass.infrastructure.lms.mock import MockLMSProvider


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


class DemoContextDTO(ApiModel):
    mode: str = "fictional_in_memory_demo"
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


@dataclass(frozen=True)
class DemoSession:
    container: AppContainer
    scenario: Scenario
    generation: int


def build_demo_container(
    identifier: ScenarioId,
    clock: Clock | None = None,
) -> tuple[AppContainer, Scenario]:
    """Compose one isolated fixture at the opt-in demo boundary."""
    resolved_clock = DemoClock((clock or DemoClock()).now())
    scenario = scenario_data(identifier, resolved_clock.now())
    container = build_container(
        clock=resolved_clock,
        lms=MockLMSProvider({scenario.student: scenario.records}),
    )
    for task in scenario.tasks:
        container.task_repository.save(
            StoredTask(
                student_id=student_id_for(scenario.student),
                task=task,
                saved_at=resolved_clock.now(),
            )
        )
    container.generate_persisted_weekly_plan.execute(
        GeneratePersistedWeeklyPlanRequest(
            student=scenario.student,
            period=scenario.period,
            study_windows=scenario.windows,
            record_id=PlanRecordId(UUID(int=201)),
        )
    )
    return container, scenario


def snapshot(session: DemoSession) -> DemoContextDTO:
    container, scenario = session.container, session.scenario
    now = container.clock.now()
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
                for w in scenario.windows
            ),
            timedelta(0),
        )
        capacities.append(
            {"assignment_id": aid, "available_minutes": int(duration.total_seconds() / 60)}
        )
    return DemoContextDTO(
        scenario_id=scenario.id.value,
        scenario_label=DEMO_LABELS[scenario.id],
        generation=session.generation,
        student={"provider": scenario.student.provider, "id": scenario.student.id},
        period={"start": scenario.period.start, "end": scenario.period.end},
        study_windows=[{"starts_at": w.starts_at, "ends_at": w.ends_at} for w in scenario.windows],
        available_minutes=int(
            sum((w.ends_at - w.starts_at for w in scenario.windows), timedelta(0)).total_seconds()
            / 60
        ),
        assignment_capacities=capacities,
        now=now,
        assignments=assignment_rows,
        tasks=tasks,
    )


def create_demo_app(clock: Clock | None = None) -> FastAPI:
    container, scenario = build_demo_container(ScenarioId.CRUNCH, clock)
    app = create_app(container)
    app.state.demo = DemoSession(container, scenario, 1)

    def session() -> DemoSession:
        return cast(DemoSession, app.state.demo)

    # Each request captures a complete container; reset never mutates repositories in place.
    app.dependency_overrides[container_from_app] = lambda: session().container

    @app.get("/api/v1/demo/context", response_model=DemoContextDTO)
    def demo_context() -> DemoContextDTO:
        return snapshot(session())

    @app.get("/api/v1/demo/scenarios")
    def scenarios() -> list[dict[str, str]]:
        return [{"id": key.value, "label": label} for key, label in DEMO_LABELS.items()]

    @app.post("/api/v1/demo/scenarios/select", response_model=DemoContextDTO)
    async def select(request: SelectScenarioDTO) -> DemoContextDTO:
        # Build first, swap only on success. Single process, single presenter, in-memory only.
        fresh, selected = build_demo_container(request.scenario_id, clock)
        next_session = DemoSession(fresh, selected, session().generation + 1)
        result = snapshot(next_session)
        app.state.demo = next_session
        return result

    return app


app = create_demo_app()

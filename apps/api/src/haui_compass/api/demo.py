"""Opt-in, fictional, single-presenter showcase. No reset route in the normal API."""

from typing import cast
from uuid import UUID

from fastapi import FastAPI

from haui_compass.api.demo_context import (
    AdvanceClockDTO,
    DemoAssignmentDTO,
    DemoContextDTO,
    DemoSession,
    DemoTaskDTO,
    SelectScenarioDTO,
    current_week,
    current_windows,
    snapshot,
)
from haui_compass.api.dependencies import (
    AppContainer,
    build_container,
)
from haui_compass.api.main import create_app
from haui_compass.api.v1.routes import container_from_app
from haui_compass.application.lms_mapping import student_id_for
from haui_compass.application.ports.clock import Clock
from haui_compass.application.ports.study_plans import PlanRecordId
from haui_compass.application.ports.tasks import StoredTask
from haui_compass.application.use_cases.persisted_learning_loop import (
    GeneratePersistedWeeklyPlanRequest,
)
from haui_compass.infrastructure.config.llm import LLMSettings
from haui_compass.infrastructure.demo.scenarios import (
    LABELS as DEMO_LABELS,
)
from haui_compass.infrastructure.demo.scenarios import (
    DemoClock,
    Scenario,
    ScenarioId,
    SteppingDemoClock,
    scenario_data,
)
from haui_compass.infrastructure.lms.mock import MockLMSProvider

__all__ = [
    "DemoAssignmentDTO",
    "DemoContextDTO",
    "DemoSession",
    "DemoTaskDTO",
    "build_demo_container",
    "create_demo_app",
    "current_week",
    "current_windows",
    "snapshot",
]


def build_demo_container(
    identifier: ScenarioId,
    clock: Clock | None = None,
    llm_settings: LLMSettings | None = None,
) -> tuple[AppContainer, Scenario]:
    """Compose one isolated fixture at the opt-in demo boundary."""
    resolved_clock = SteppingDemoClock((clock or DemoClock()).now())
    scenario = scenario_data(identifier, resolved_clock.now())
    container = build_container(
        clock=resolved_clock,
        lms=MockLMSProvider({scenario.student: scenario.records}),
        llm_settings=llm_settings,
    )
    for task in scenario.tasks:
        container.task_repository.save(
            StoredTask(
                student_id=student_id_for(scenario.student),
                task=task,
                saved_at=resolved_clock.now(),
            )
        )
    if identifier is not ScenarioId.WEEK:
        # The weekly-cycle scenario starts unplanned so the student proposes and approves it.
        container.generate_persisted_weekly_plan.execute(
            GeneratePersistedWeeklyPlanRequest(
                student=scenario.student,
                period=scenario.period,
                study_windows=scenario.windows,
                record_id=PlanRecordId(UUID(int=201)),
            )
        )
    return container, scenario


def create_demo_app(
    clock: Clock | None = None,
    llm_settings: LLMSettings | None = None,
    initial: ScenarioId = ScenarioId.WEEK,
) -> FastAPI:
    container, scenario = build_demo_container(initial, clock, llm_settings)
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
        fresh, selected = build_demo_container(request.scenario_id, clock, llm_settings)
        next_session = DemoSession(fresh, selected, session().generation + 1)
        result = snapshot(next_session)
        app.state.demo = next_session
        return result

    @app.post("/api/v1/demo/clock/advance", response_model=DemoContextDTO)
    def advance(request: AdvanceClockDTO) -> DemoContextDTO:
        # Demo-only time travel so one presenter can walk through a whole week.
        current = session()
        demo_clock = current.container.clock
        assert isinstance(demo_clock, SteppingDemoClock)
        if request.to == "next_day":
            demo_clock.advance_to_next_day()
        else:
            demo_clock.advance_to_next_week()
        return snapshot(current)

    return app


app = create_demo_app(llm_settings=LLMSettings.from_env())

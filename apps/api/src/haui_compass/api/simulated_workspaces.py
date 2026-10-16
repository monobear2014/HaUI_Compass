"""Staging composition: every signed-in account works in its own simulated Canvas workspace.

Opt-in with ``HAUI_COMPASS_SIMULATED_WORKSPACES=1``. The web backend authenticates the browser
session and forwards the account id in ``X-Compass-User`` together with the shared
``X-Compass-Service-Key``. This API then:

* rejects any request without the service key (the learning API is never directly public);
* rejects any student reference, in the query or JSON body, that the account does not own; and
* binds that account's workspace (fixture + virtual clock) to the current request only.

The existing learning-loop routes are reused unchanged. The ``demo/*`` routes keep the showcase
contract so the same frontend works, but every read and write is per account and persisted.
"""

import json
import os
import secrets
from typing import Annotated, Any

from fastapi import Depends, FastAPI, Header, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from haui_compass.api.demo_context import (
    SIMULATED_WORKSPACE_MODE,
    AdvanceClockDTO,
    DemoContextDTO,
    DemoSession,
    SelectScenarioDTO,
    snapshot,
)
from haui_compass.api.dependencies import (
    AppContainer,
    build_container,
    database_url_configured,
)
from haui_compass.api.main import create_app
from haui_compass.application.academic_import import AcademicSource
from haui_compass.application.ports.simulated_workspaces import (
    OWNER_PATTERN,
    SimulatedWorkspace,
    SimulatedWorkspaceRepository,
)
from haui_compass.infrastructure.clock import SystemClock
from haui_compass.infrastructure.config.llm import LLMSettings
from haui_compass.infrastructure.demo.scenarios import LABELS, ScenarioId
from haui_compass.infrastructure.demo.simulated_workspaces import (
    ACTIVE_WORKSPACE,
    SimulatedCanvasLMSProvider,
    SimulatedWorkspaces,
    WorkspaceClock,
    scenario_for,
)
from haui_compass.infrastructure.persistence.memory.simulated_workspaces import (
    InMemorySimulatedWorkspaceRepository,
)

PUBLIC_PATHS = frozenset({"/api/v1/health"})
INTERNAL_PREFIX = "/api/v1/internal/"
BODY_METHODS = frozenset({"POST", "PUT", "PATCH"})


class WorkspaceAccessError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def _forbidden_student() -> WorkspaceAccessError:
    return WorkspaceAccessError(
        403, "forbidden_student", "This workspace belongs to another account."
    )


def _check_student(
    owner: str, providers: frozenset[str], *, provider: object, identifier: object
) -> None:
    if identifier is not None and identifier != owner:
        raise _forbidden_student()
    if provider is not None and provider not in providers:
        raise _forbidden_student()


def _check_body(owner: str, providers: frozenset[str], body: bytes) -> None:
    try:
        payload: Any = json.loads(body) if body else None
    except ValueError:
        return  # request validation rejects malformed JSON with its usual error
    if not isinstance(payload, dict):
        return
    student = payload.get("student")
    if student is not None:
        if not isinstance(student, dict):
            raise _forbidden_student()
        _check_student(
            owner, providers, provider=student.get("provider"), identifier=student.get("id")
        )
    _check_student(
        owner,
        providers,
        provider=payload.get("source"),
        identifier=payload.get("student_external_id"),
    )


def create_simulated_workspace_app(
    *, container: AppContainer, workspaces: SimulatedWorkspaces, service_key: str
) -> FastAPI:
    if not service_key:
        raise RuntimeError("COMPASS_SERVICE_KEY is required for simulated workspaces")
    imported_sources = frozenset(source.value for source in AcademicSource)

    async def authorize(
        request: Request,
        key: Annotated[str | None, Header(alias="X-Compass-Service-Key")] = None,
        user: Annotated[str | None, Header(alias="X-Compass-User")] = None,
    ) -> None:
        path = request.url.path
        if path in PUBLIC_PATHS or path.startswith(INTERNAL_PREFIX):
            return  # internal routes keep their own service-key check
        if not key or not secrets.compare_digest(key.encode(), service_key.encode()):
            raise WorkspaceAccessError(403, "forbidden", "Request rejected.")
        if not user or not OWNER_PATTERN.fullmatch(user):
            raise WorkspaceAccessError(401, "unauthorized", "Please sign in again.")
        workspace = await run_in_threadpool(workspaces.get, user)
        providers = imported_sources | (
            frozenset({workspace.student.provider}) if workspace is not None else frozenset()
        )
        query = request.query_params
        _check_student(
            user,
            providers,
            provider=query.get("student_provider"),
            identifier=query.get("student_id"),
        )
        _check_student(
            user,
            providers,
            provider=query.get("source"),
            identifier=query.get("student_external_id"),
        )
        if request.method in BODY_METHODS and "json" in request.headers.get("content-type", ""):
            _check_body(user, providers, await request.body())
        request.state.owner = user
        # Visible to this request's handler (and its worker thread) only.
        ACTIVE_WORKSPACE.set(workspace)

    app = create_app(container, dependencies=(Depends(authorize),))

    @app.exception_handler(WorkspaceAccessError)
    async def access_error(_: Request, exc: WorkspaceAccessError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status, content={"error": {"code": exc.code, "message": exc.message}}
        )

    def context_for(workspace: SimulatedWorkspace) -> DemoContextDTO:
        ACTIVE_WORKSPACE.set(workspace)
        session = DemoSession(
            container, scenario_for(workspace), workspace.generation, SIMULATED_WORKSPACE_MODE
        )
        return container.transaction_manager.run(lambda: snapshot(session))

    @app.get("/api/v1/demo/context", response_model=DemoContextDTO)
    def demo_context(request: Request) -> DemoContextDTO:
        return context_for(workspaces.ensure(request.state.owner))

    @app.get("/api/v1/demo/scenarios")
    def scenarios() -> list[dict[str, str]]:
        return [{"id": ScenarioId.WEEK.value, "label": LABELS[ScenarioId.WEEK]}]

    @app.post("/api/v1/demo/scenarios/select", response_model=DemoContextDTO)
    def select(request: Request, body: SelectScenarioDTO) -> DemoContextDTO:
        if body.scenario_id is not ScenarioId.WEEK:
            raise WorkspaceAccessError(
                400, "unsupported_scenario", "Only the simulated study week is available."
            )
        # Reset = a new, empty generation for this account only.
        return context_for(workspaces.reset(request.state.owner))

    @app.post("/api/v1/demo/clock/advance", response_model=DemoContextDTO)
    def advance(request: Request, body: AdvanceClockDTO) -> DemoContextDTO:
        workspaces.ensure(request.state.owner)
        return context_for(workspaces.advance(request.state.owner, body.to))

    return app


def build_simulated_workspace_app() -> FastAPI:
    """Runtime composition selected by ``HAUI_COMPASS_SIMULATED_WORKSPACES=1``."""
    service_key = os.getenv("COMPASS_SERVICE_KEY", "")
    if not service_key:
        raise RuntimeError("COMPASS_SERVICE_KEY is required for simulated workspaces")
    llm_settings = LLMSettings.from_env()
    clock = WorkspaceClock(SystemClock())
    lms = SimulatedCanvasLMSProvider()
    if database_url_configured():
        from haui_compass.api.postgres_dependencies import build_postgres_container
        from haui_compass.infrastructure.persistence.postgres.session import (
            PostgresPersistenceTransactionManager,
        )
        from haui_compass.infrastructure.persistence.postgres.simulated_workspaces import (
            PostgresSimulatedWorkspaceRepository,
        )

        container = build_postgres_container(lms=lms, clock=clock, llm_settings=llm_settings)
        assert isinstance(container.transaction_manager, PostgresPersistenceTransactionManager)
        repository: SimulatedWorkspaceRepository = PostgresSimulatedWorkspaceRepository(
            container.transaction_manager.current_session
        )
    elif os.getenv("VERCEL") == "1":
        raise RuntimeError("HAUI_COMPASS_DATABASE_URL is required on Vercel")
    else:
        container = build_container(lms=lms, clock=clock, llm_settings=llm_settings)
        repository = InMemorySimulatedWorkspaceRepository()
    workspaces = SimulatedWorkspaces(
        repository=repository,
        tasks=container.task_repository,
        transaction_manager=container.transaction_manager,
        clock=SystemClock(),
    )
    return create_simulated_workspace_app(
        container=container, workspaces=workspaces, service_key=service_key
    )

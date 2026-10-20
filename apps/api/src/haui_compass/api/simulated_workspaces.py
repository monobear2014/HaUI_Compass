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

import email.message
import json
import os
import secrets
from typing import Annotated, Any
from uuid import UUID

from fastapi import Depends, FastAPI, Header, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from starlette.datastructures import QueryParams

from haui_compass.api.app_factory import create_app
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
from haui_compass.api.schemas.common import ApiModel
from haui_compass.application.academic_import import AcademicSource
from haui_compass.application.ports.simulated_submissions import SimulatedSubmissionRepository
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


class WorkspaceAccessError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


class SubmitSimulationDTO(ApiModel):
    """The server owns the timestamp; client-supplied submission dates are rejected."""


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


def _check_query(owner: str, providers: frozenset[str], query: QueryParams) -> None:
    # Every value counts: a repeated parameter must not hide another account's student.
    for identifier in (*query.getlist("student_id"), *query.getlist("student_external_id")):
        _check_student(owner, providers, provider=None, identifier=identifier)
    for provider in (*query.getlist("student_provider"), *query.getlist("source")):
        _check_student(owner, providers, provider=provider, identifier=None)


def _is_json_media_type(content_type: str) -> bool:
    """Exactly the media types FastAPI decodes as a JSON body (case-insensitive, any params)."""
    message = email.message.Message()
    message["content-type"] = content_type
    subtype = message.get_content_subtype()
    return message.get_content_maintype() == "application" and (
        subtype == "json" or subtype.endswith("+json")
    )


def _json_body(request_body: bytes, content_type: str | None) -> Any:
    """Decode a non-empty body as FastAPI would, or refuse it before any handler runs."""
    if not content_type or not _is_json_media_type(content_type):
        raise WorkspaceAccessError(415, "unsupported_media_type", "Request body must be JSON.")
    try:
        return json.loads(request_body)
    except ValueError as error:
        raise WorkspaceAccessError(
            400, "invalid_json", "Request body is not valid JSON."
        ) from error


def _check_body(owner: str, providers: frozenset[str], payload: Any) -> None:
    """Every student reference, at any depth, must be the signed-in account's own."""
    pending = [payload]
    while pending:
        node = pending.pop()
        if isinstance(node, list):
            pending.extend(node)
            continue
        if not isinstance(node, dict):
            continue
        if "student" in node:
            student = node["student"]
            if not isinstance(student, dict):
                raise _forbidden_student()
            _check_student(
                owner, providers, provider=student.get("provider"), identifier=student.get("id")
            )
        if "student_id" in node or "student_provider" in node:
            _check_student(
                owner,
                providers,
                provider=node.get("student_provider"),
                identifier=node.get("student_id"),
            )
        if "student_external_id" in node:
            _check_student(
                owner,
                providers,
                provider=node.get("source"),
                identifier=node["student_external_id"],
            )
        pending.extend(node.values())


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
        from haui_compass.api.lecturer import lecturer_classes

        if lecturer_classes(user) is not None and not path.startswith("/api/v1/lecturer/"):
            raise WorkspaceAccessError(403, "forbidden_role", "Student role required.")
        workspace = await run_in_threadpool(workspaces.get, user)
        providers = imported_sources | (
            frozenset({workspace.student.provider}) if workspace is not None else frozenset()
        )
        _check_query(user, providers, request.query_params)
        # Any non-empty body, whatever the method, is checked on the very bytes and media type
        # the handler will decode; anything the handler would not decode as JSON is refused.
        body = await request.body()
        if body:
            _check_body(user, providers, _json_body(body, request.headers.get("content-type")))
        request.state.owner = user
        # Visible to this request's handler (and its worker thread) only.
        ACTIVE_WORKSPACE.set(workspace)

    app = create_app(container, dependencies=(Depends(authorize),))
    from haui_compass.api.lecturer_activity import activity_summary, class_insights

    app.state.lecturer_activity = lambda owners: activity_summary(owners, container, workspaces)
    app.state.lecturer_insights = lambda owners, minimum: class_insights(
        owners, container, workspaces, minimum=minimum
    )

    @app.get("/api/v1/demo/submissions")
    def submissions(request: Request) -> dict[str, object]:
        return {
            "submissions": [
                {"assignment_id": row.assignment_id, "submitted_at": row.submitted_at}
                for row in workspaces.submissions_for(request.state.owner)
            ]
        }

    @app.post("/api/v1/demo/submissions/{assignment_id}")
    def submit_assignment(
        request: Request, assignment_id: UUID, body: SubmitSimulationDTO
    ) -> dict[str, object]:
        row = workspaces.submit(request.state.owner, assignment_id)
        return {
            "assignment_id": row.assignment_id,
            "submitted_at": row.submitted_at,
            "simulated": True,
        }

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
        result = container.transaction_manager.run(lambda: snapshot(session))
        events = {
            row.assignment_id: row.submitted_at
            for row in workspaces.submissions_for(workspace.owner)
        }
        return result.model_copy(
            update={
                "assignments": [
                    row.model_copy(
                        update={
                            "submitted_at": events.get(row.assignment_id),
                        }
                    )
                    for row in result.assignments
                ]
            }
        )

    app.state.companion_context = lambda owner: context_for(workspaces.ensure(owner))

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
        from haui_compass.infrastructure.persistence.postgres.simulated_submissions import (
            PostgresSimulatedSubmissionRepository,
        )

        submissions_repository: SimulatedSubmissionRepository = (
            PostgresSimulatedSubmissionRepository(container.transaction_manager.current_session)
        )
    elif os.getenv("VERCEL") == "1":
        raise RuntimeError("HAUI_COMPASS_DATABASE_URL is required on Vercel")
    else:
        container = build_container(lms=lms, clock=clock, llm_settings=llm_settings)
        repository = InMemorySimulatedWorkspaceRepository()
        from haui_compass.infrastructure.persistence.memory.simulated_submissions import (
            InMemorySimulatedSubmissionRepository,
        )

        submissions_repository = InMemorySimulatedSubmissionRepository()
    workspaces = SimulatedWorkspaces(
        repository=repository,
        tasks=container.task_repository,
        transaction_manager=container.transaction_manager,
        clock=SystemClock(),
        submissions=submissions_repository,
    )
    return create_simulated_workspace_app(
        container=container, workspaces=workspaces, service_key=service_key
    )

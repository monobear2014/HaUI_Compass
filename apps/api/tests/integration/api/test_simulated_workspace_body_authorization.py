"""Security regression: a signed-in account can never act on another account's student.

The guard and FastAPI must agree on which bodies are JSON. Any JSON media type FastAPI parses is
checked, recursively; any other non-empty body is refused before a handler runs. Every refusal
leaves both accounts' persisted state unchanged.
"""

import json
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from haui_compass.api.dependencies import AppContainer, build_container
from haui_compass.api.simulated_workspaces import create_simulated_workspace_app
from haui_compass.application.lms_mapping import student_id_for
from haui_compass.application.ports.lms import ExternalRef
from haui_compass.infrastructure.demo.simulated_workspaces import (
    SimulatedCanvasLMSProvider,
    SimulatedWorkspaces,
    WorkspaceClock,
)
from haui_compass.infrastructure.persistence.memory.simulated_workspaces import (
    InMemorySimulatedWorkspaceRepository,
)
from support.clocks import FixedClock
from support.weekly_flow import at, context, history, plan_week, scope

KEY = "test-service-key"
REAL_NOW = datetime(2026, 10, 15, 8, 30, tzinfo=UTC)

JSON_TYPES = (
    "application/json",
    "application/JSON",
    "Application/Json",
    "application/json; charset=utf-8",
    "APPLICATION/JSON; Charset=UTF-8",
    "application/vnd.compass+JSON",
)
UNSUPPORTED_TYPES = (
    "text/plain",
    "text/json",
    "application/x-www-form-urlencoded",
    "multipart/form-data; boundary=x",
    "application/jsonx",
    "json",
    "",
)


@pytest.fixture
def stack() -> tuple[AppContainer, TestClient, TestClient]:
    real = FixedClock(REAL_NOW)
    container = build_container(lms=SimulatedCanvasLMSProvider(), clock=WorkspaceClock(real))
    workspaces = SimulatedWorkspaces(
        repository=InMemorySimulatedWorkspaceRepository(),
        tasks=container.task_repository,
        transaction_manager=container.transaction_manager,
        clock=real,
    )
    app = create_simulated_workspace_app(
        container=container, workspaces=workspaces, service_key=KEY
    )
    return container, as_user(app, "student-a"), as_user(app, "student-b")


def as_user(app: Any, owner: str) -> TestClient:
    return TestClient(app, headers={"X-Compass-Service-Key": KEY, "X-Compass-User": owner})


def persisted(container: AppContainer, student: dict[str, str]) -> dict[str, Any]:
    """Everything a learning-loop write could change for one student."""
    student_id = student_id_for(ExternalRef(student["provider"], student["id"]))
    tasks = container.task_repository.list_for_student(student_id)
    return {
        "tasks": tasks,
        "executions": {
            t.task.id: container.execution_repository.list_for_task(student_id, t.task.id)
            for t in tasks
        },
        "reflections": container.reflection_repository.list_for_student(student_id),
        "goals": container.weekly_goal_repository.list_for_student(student_id),
    }


def execution_of(ctx: dict[str, Any], task_id: str, student: dict[str, str]) -> dict[str, Any]:
    now = at(ctx["now"])
    return {
        "student": student,
        "task_id": task_id,
        "record_id": str(uuid4()),
        "started_at": (now - timedelta(minutes=30)).isoformat(),
        "ended_at": now.isoformat(),
        "outcome": "partial",
    }


def raw_post(client: TestClient, path: str, payload: Any, content_type: str | None) -> Any:
    headers = {} if content_type is None else {"Content-Type": content_type}
    return client.post(path, content=json.dumps(payload), headers=headers)


@pytest.mark.parametrize("content_type", JSON_TYPES)
def test_every_json_media_type_is_checked_and_a_refusal_mutates_nothing(
    stack: tuple[AppContainer, TestClient, TestClient], content_type: str
) -> None:
    container, a, b = stack
    ctx_a, ctx_b = plan_week(a), context(b)
    before = persisted(container, ctx_a["student"]), persisted(container, ctx_b["student"])
    history_a = history(a, ctx_a)

    forged = raw_post(
        b,
        "/api/v1/task-executions",
        execution_of(ctx_a, ctx_a["tasks"][0]["id"], ctx_a["student"]),
        content_type,
    )

    assert forged.status_code == 403, forged.text
    assert forged.json()["error"]["code"] == "forbidden_student"
    after = persisted(container, ctx_a["student"]), persisted(container, ctx_b["student"])
    assert after == before
    assert history(a, ctx_a) == history_a
    assert context(a)["tasks"] == ctx_a["tasks"]


@pytest.mark.parametrize("content_type", JSON_TYPES)
def test_the_owner_still_writes_with_every_json_media_type(
    stack: tuple[AppContainer, TestClient, TestClient], content_type: str
) -> None:
    _, a, _ = stack
    ctx_a = context(a)
    task = ctx_a["tasks"][0]
    response = raw_post(
        a,
        "/api/v1/task-executions",
        execution_of(ctx_a, task["id"], ctx_a["student"]),
        content_type,
    )
    assert response.status_code == 200, response.text
    assert response.json()["task_status"] == "in_progress"


@pytest.mark.parametrize("content_type", (*UNSUPPORTED_TYPES, None))
def test_a_non_json_body_is_refused_before_any_handler(
    stack: tuple[AppContainer, TestClient, TestClient], content_type: str | None
) -> None:
    container, a, b = stack
    ctx_a, ctx_b = context(a), context(b)
    before = persisted(container, ctx_a["student"]), persisted(container, ctx_b["student"])
    for client, ctx in ((b, ctx_a), (a, ctx_a)):  # forged and even the owner's own payload
        response = raw_post(
            client,
            "/api/v1/task-executions",
            execution_of(ctx, ctx["tasks"][0]["id"], ctx["student"]),
            content_type,
        )
        assert response.status_code == 415, (content_type, response.text)
        assert response.json()["error"]["code"] == "unsupported_media_type"
    assert (
        persisted(container, ctx_a["student"]),
        persisted(container, ctx_b["student"]),
    ) == before


def test_another_accounts_task_id_is_not_found_under_ones_own_student(
    stack: tuple[AppContainer, TestClient, TestClient],
) -> None:
    container, a, b = stack
    ctx_a, ctx_b = plan_week(a), context(b)
    before = persisted(container, ctx_a["student"]), persisted(container, ctx_b["student"])
    for content_type in ("application/json", "application/JSON"):
        response = raw_post(
            b,
            "/api/v1/task-executions",
            execution_of(ctx_b, ctx_a["tasks"][0]["id"], ctx_b["student"]),
            content_type,
        )
        assert response.status_code == 404, response.text
    assert (
        persisted(container, ctx_a["student"]),
        persisted(container, ctx_b["student"]),
    ) == before


def test_a_replayed_execution_record_of_another_account_is_rejected(
    stack: tuple[AppContainer, TestClient, TestClient],
) -> None:
    container, a, b = stack
    ctx_a, ctx_b = context(a), context(b)
    owned = execution_of(ctx_a, ctx_a["tasks"][0]["id"], ctx_a["student"])
    assert a.post("/api/v1/task-executions", json=owned).status_code == 200
    before = persisted(container, ctx_a["student"]), persisted(container, ctx_b["student"])
    replay = {**owned, "student": ctx_b["student"], "task_id": ctx_b["tasks"][0]["id"]}
    assert b.post("/api/v1/task-executions", json=replay).status_code in (400, 409)
    assert (
        persisted(container, ctx_a["student"]),
        persisted(container, ctx_b["student"]),
    ) == before


@pytest.mark.parametrize(
    "forge",
    (
        pytest.param(lambda s: {"student": s}, id="top-level student"),
        pytest.param(lambda s: {"wrapper": {"student": s}}, id="nested student"),
        pytest.param(lambda s: {"items": [{"x": {"student": s}}]}, id="student in a list"),
        pytest.param(lambda s: {"student": {**s, "id": s["id"]}, "extra": 1}, id="extra field"),
        pytest.param(lambda s: {"student": s["id"]}, id="student as a string"),
        pytest.param(lambda s: {"student": [s]}, id="student as a list"),
        pytest.param(lambda s: {"student_id": s["id"]}, id="student_id"),
        pytest.param(
            lambda s: {"student_provider": s["provider"], "student_id": s["id"]},
            id="student_provider + student_id",
        ),
        pytest.param(
            lambda s: {"x": [{"source": "json", "student_external_id": s["id"]}]},
            id="nested student_external_id",
        ),
        pytest.param(lambda s: {"student_external_id": 7}, id="non-string id"),
    ),
)
def test_spoofed_student_references_anywhere_in_the_body_are_rejected(
    stack: tuple[AppContainer, TestClient, TestClient], forge: Any
) -> None:
    container, a, b = stack
    ctx_a, ctx_b = context(a), context(b)
    before = persisted(container, ctx_a["student"]), persisted(container, ctx_b["student"])
    payload = {**execution_of(ctx_b, ctx_b["tasks"][0]["id"], ctx_b["student"])}
    payload.update(forge(ctx_a["student"]))
    for content_type in ("application/json", "application/JSON; charset=utf-8"):
        response = raw_post(b, "/api/v1/task-executions", payload, content_type)
        assert response.status_code == 403, response.text
    assert (
        persisted(container, ctx_a["student"]),
        persisted(container, ctx_b["student"]),
    ) == before


def test_duplicate_json_keys_cannot_hide_a_forged_student(
    stack: tuple[AppContainer, TestClient, TestClient],
) -> None:
    container, a, b = stack
    ctx_a, ctx_b = context(a), context(b)
    before = persisted(container, ctx_a["student"]), persisted(container, ctx_b["student"])
    body = execution_of(ctx_a, ctx_a["tasks"][0]["id"], ctx_a["student"])
    own = json.dumps(ctx_b["student"])
    text = json.dumps(body).replace('"student": ', f'"student": {own}, "student": ', 1)
    response = b.post(
        "/api/v1/task-executions", content=text, headers={"Content-Type": "application/JSON"}
    )
    assert response.status_code == 403, response.text
    assert (
        persisted(container, ctx_a["student"]),
        persisted(container, ctx_b["student"]),
    ) == before


def test_spoofed_query_students_are_rejected_including_repeated_parameters(
    stack: tuple[AppContainer, TestClient, TestClient],
) -> None:
    _, a, b = stack
    ctx_a, ctx_b = plan_week(a), context(b)
    own, theirs = scope(ctx_b), scope(ctx_a)
    attempts: tuple[list[tuple[str, str]], ...] = (
        [*theirs.items()],
        [*own.items(), ("student_id", theirs["student_id"])],
        [("student_id", theirs["student_id"]), *own.items()],
        [*own.items(), ("student_provider", "mock-canvas")],
    )
    for params in attempts:
        response = b.get("/api/v1/weekly-plans/history", params=tuple(params))
        assert response.status_code == 403, (params, response.text)
    assert b.get("/api/v1/weekly-plans/history", params=own).status_code == 200


def test_malformed_json_is_refused_without_mutation(
    stack: tuple[AppContainer, TestClient, TestClient],
) -> None:
    container, a, b = stack
    ctx_a = context(a)
    before = persisted(container, ctx_a["student"])
    for content_type in ("application/json", "application/JSON"):
        response = b.post(
            "/api/v1/task-executions",
            content=b'{"student": {"provider": "x", "id": "student-a"',
            headers={"Content-Type": content_type},
        )
        assert response.status_code in (400, 422), response.text
    assert persisted(container, ctx_a["student"]) == before


def test_internal_routes_and_the_service_key_are_unchanged(
    stack: tuple[AppContainer, TestClient, TestClient],
) -> None:
    _, a, _ = stack
    forged = raw_post(
        a, "/api/v1/internal/compass/answer", {"message": "x", "evidence": []}, "application/JSON"
    )
    assert forged.status_code in (401, 403)
    keyless = TestClient(a.app, headers={"X-Compass-User": "student-a"})
    assert keyless.get("/api/v1/demo/context").status_code == 403
    assert keyless.get("/api/v1/health").status_code == 200

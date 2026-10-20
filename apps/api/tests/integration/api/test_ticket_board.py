import json
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from haui_compass.api.dependencies import build_container
from haui_compass.api.simulated_workspaces import create_simulated_workspace_app
from haui_compass.application.ports.companion import AgentAdviceInput
from haui_compass.infrastructure.demo.simulated_workspaces import (
    SimulatedCanvasLMSProvider,
    SimulatedWorkspaces,
    WorkspaceClock,
)
from haui_compass.infrastructure.persistence.memory.simulated_workspaces import (
    InMemorySimulatedWorkspaceRepository,
)
from support.clocks import FixedClock

KEY = "companion-test-key"
PATH = "/api/v1/companion"


class Provider:
    def __init__(self) -> None:
        self.calls: list[AgentAdviceInput] = []

    async def advise(self, request: AgentAdviceInput) -> str:
        self.calls.append(request)
        return "Gợi ý chỉ đọc: xem lại thời gian học và chọn một bước nhỏ phù hợp."


def instance(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("COMPASS_SERVICE_KEY", KEY)
    monkeypatch.setenv("COMPASS_LECTURER_GRANTS", json.dumps({"teacher": ["class"]}))
    clock = FixedClock(datetime(2026, 10, 19, 2, tzinfo=UTC))
    provider = Provider()
    container = replace(
        build_container(lms=SimulatedCanvasLMSProvider(), clock=WorkspaceClock(clock)),
        agent_advice=provider,
    )
    workspaces = SimulatedWorkspaces(
        repository=InMemorySimulatedWorkspaceRepository(),
        tasks=container.task_repository,
        transaction_manager=container.transaction_manager,
        clock=clock,
    )
    app = create_simulated_workspace_app(
        container=container, workspaces=workspaces, service_key=KEY
    )

    def client(owner: str):
        return TestClient(app, headers={"X-Compass-Service-Key": KEY, "X-Compass-User": owner})

    return client, provider


def test_ticket_board_ownership_version_focus_and_day_scope(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, _ = instance(monkeypatch)
    a, b = client("tickets-a"), client("tickets-b")
    path = "/api/v1/ticket-board"
    context = a.get("/api/v1/demo/context").json()
    task = context["tasks"][0]
    first = a.get(path).json()
    assert first["board"] is None
    body = {
        "scope": first["scope"],
        "version": 0,
        "task_ids": [task["id"]],
        "active_task_id": task["id"],
        "planned_minutes": {task["id"]: 25},
        "capacity_minutes": 60,
    }
    result = a.post(path, json=body)
    assert result.status_code == 200
    assert result.json()["board"]["version"] == 1
    assert a.get(path).json() == result.json()
    assert b.get(path).json()["board"] is None
    assert b.post(path, json=body).status_code == 409
    assert a.post(path, json=body).status_code == 409
    assert client("teacher").get(path).status_code == 403
    assert (
        a.post(
            path,
            json={
                **body,
                "version": 1,
                "task_ids": [str(uuid4())],
                "active_task_id": None,
                "planned_minutes": {},
            },
        ).status_code
        == 404
    )
    assert (
        a.post(path, json={**body, "version": 1, "task_ids": [task["id"], task["id"]]}).status_code
        == 422
    )
    assert a.post(path, json={**body, "version": 1, "capacity_minutes": 1441}).status_code == 422
    assert a.post(path, json={**body, "version": 1, "owner": "other"}).status_code == 422
    # Focus is organization metadata, never a fabricated study execution.
    assert a.get("/api/v1/demo/context").json()["tasks"][0]["status"] == task["status"]
    end = datetime.fromisoformat(context["now"])
    execution = {
        "student": context["student"],
        "task_id": task["id"],
        "record_id": str(uuid4()),
        "started_at": (end - timedelta(minutes=25)).isoformat(),
        "ended_at": end.isoformat(),
        "outcome": "completed",
    }
    assert a.post("/api/v1/task-executions", json=execution).status_code == 200
    assert a.get(path).json()["actual_minutes"][task["id"]] == 25
    assert a.post(path, json={**body, "version": 1}).status_code == 409
    assert a.post("/api/v1/demo/clock/advance", json={"to": "next_day"}).status_code == 200
    assert a.get(path).json()["board"] is None
    assert a.post(path, json={**body, "version": 1}).status_code == 409


def test_ticket_columns_are_reversible_and_owned(monkeypatch: pytest.MonkeyPatch) -> None:
    client, _ = instance(monkeypatch)
    a = client("column-owner")
    path = "/api/v1/ticket-board"
    task = a.get("/api/v1/demo/context").json()["tasks"][0]
    state = a.get(path).json()
    for version, column in enumerate(["progress", "review", "done", "review", "progress", "todo"]):
        response = a.post(
            path,
            json={
                "scope": state["scope"],
                "version": version,
                "task_ids": [],
                "active_task_id": None,
                "planned_minutes": {},
                "capacity_minutes": 60,
                "columns": {task["id"]: column},
            },
        )
        assert response.status_code == 200
        assert a.get(path).json()["board"]["columns"][task["id"]] == column
    assert a.get("/api/v1/demo/context").json()["tasks"][0]["status"] == task["status"]
    assert client("other-owner").get(path).json()["board"] is None
    assert (
        a.post(
            path,
            json={
                "scope": state["scope"],
                "version": 6,
                "task_ids": [],
                "capacity_minutes": 60,
                "columns": {str(uuid4()): "todo"},
            },
        ).status_code
        == 404
    )


def test_ticket_details_persist_next_day_and_reject_stale_edits(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, _ = instance(monkeypatch)
    a = client("details-owner")
    path = "/api/v1/ticket-board"
    task = a.get("/api/v1/demo/context").json()["tasks"][0]
    body = {
        "scope": a.get(path).json()["details_scope"],
        "version": 0,
        "task_id": task["id"],
        "title": "Updated study task",
        "description": "Review the definitions first.",
    }
    assert a.post(path + "/details", json=body).status_code == 200
    assert a.post(path + "/details", json=body).status_code == 409
    assert client("another-owner").get(path).json()["details"]["edits"] == {}
    assert a.post(path + "/details", json={**body, "task_id": str(uuid4())}).status_code == 404
    assert a.post(path + "/details", json={**body, "title": "  "}).status_code == 422
    assert a.post("/api/v1/demo/clock/advance", json={"to": "next_day"}).status_code == 200
    assert a.get(path).json()["details"]["edits"][task["id"]]["title"] == body["title"]
    assert a.get("/api/v1/demo/context").json()["tasks"][0]["title"] == task["title"]


def test_ticket_order_is_owned_unique_and_versioned(monkeypatch: pytest.MonkeyPatch) -> None:
    client, _ = instance(monkeypatch)
    a = client("ordered-owner")
    path = "/api/v1/ticket-board"
    tasks = [t["id"] for t in a.get("/api/v1/demo/context").json()["tasks"]]
    state = a.get(path).json()
    body = {
        "scope": state["scope"],
        "version": 0,
        "task_ids": [],
        "capacity_minutes": 60,
        "ticket_order": tasks[::-1],
    }
    assert a.post(path, json=body).status_code == 200
    assert a.get(path).json()["board"]["ticket_order"] == tasks[::-1]
    assert client("other-ordered-owner").get(path).json()["board"] is None
    assert a.post(path, json=body).status_code == 409
    assert (
        a.post(path, json={**body, "version": 1, "ticket_order": [tasks[0], tasks[0]]}).status_code
        == 422
    )
    assert (
        a.post(path, json={**body, "version": 1, "ticket_order": [str(uuid4())]}).status_code == 404
    )


def test_manual_tickets_many_in_each_column_and_owned_persistence(monkeypatch):
    client, _ = instance(monkeypatch)
    a, b = client("manual-a"), client("manual-b")
    path = "/api/v1/ticket-board"
    context = a.get("/api/v1/demo/context").json()
    state = a.get(path).json()
    assignment = context["assignments"][0]
    ids = []
    for index in range(12):
        identifier = str(uuid4())
        body = {
            "scope": state["details_scope"],
            "task_id": identifier,
            "assignment_id": assignment["assignment_id"],
            "title": f"Personal study step {index}",
            "description": "My own notes",
            "estimated_minutes": 25,
        }
        response = a.post(path + "/tasks", json=body)
        assert response.status_code == 200, response.text
        assert a.post(path + "/tasks", json=body).status_code == 200
        assert b.post(path + "/tasks", json=body).status_code in (404, 409)
        ids.append(identifier)
    restored = a.get("/api/v1/demo/context").json()
    assert set(ids).issubset({t["id"] for t in restored["tasks"]})
    assert not set(ids).intersection(t["id"] for t in b.get("/api/v1/demo/context").json()["tasks"])
    for column in ("todo", "progress", "review", "done", "todo"):
        state = a.get(path).json()
        body = {
            "scope": state["scope"],
            "version": (state["board"] or {}).get("version", 0),
            "task_ids": ids,
            "active_task_id": None,
            "capacity_minutes": 90,
            "planned_minutes": {},
            "ticket_order": ids,
            "columns": dict.fromkeys(ids, column),
        }
        result = a.post(path, json=body)
        assert result.status_code == 200
        assert a.get(path).json()["board"]["columns"] == dict.fromkeys(ids, column)
    assert a.get(path).json()["details"]["edits"][ids[0]]["description"] == "My own notes"

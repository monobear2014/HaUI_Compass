import os
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from haui_compass.api.postgres_dependencies import build_postgres_container
from haui_compass.api.simulated_workspaces import create_simulated_workspace_app
from haui_compass.infrastructure.config.database import DatabaseSettings
from haui_compass.infrastructure.demo.simulated_workspaces import (
    SimulatedCanvasLMSProvider,
    SimulatedWorkspaces,
    WorkspaceClock,
)
from haui_compass.infrastructure.persistence.postgres.session import (
    PostgresPersistenceTransactionManager,
)
from haui_compass.infrastructure.persistence.postgres.simulated_workspaces import (
    PostgresSimulatedWorkspaceRepository,
)
from support.clocks import FixedClock


@pytest.mark.postgres
def test_daily_ticket_order_and_focus_survive_new_instances(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    key = "postgres-companion-key"
    monkeypatch.setenv("COMPASS_SERVICE_KEY", key)

    def client(owner: str):
        clock = FixedClock(datetime(2026, 10, 19, 2, tzinfo=UTC))
        container = build_postgres_container(
            settings=DatabaseSettings(url=os.environ["HAUI_COMPASS_TEST_DATABASE_URL"]),
            lms=SimulatedCanvasLMSProvider(),
            clock=WorkspaceClock(clock),
        )
        assert isinstance(container.transaction_manager, PostgresPersistenceTransactionManager)
        workspaces = SimulatedWorkspaces(
            repository=PostgresSimulatedWorkspaceRepository(
                container.transaction_manager.current_session
            ),
            tasks=container.task_repository,
            transaction_manager=container.transaction_manager,
            clock=clock,
        )
        return TestClient(
            create_simulated_workspace_app(
                container=container, workspaces=workspaces, service_key=key
            ),
            headers={"X-Compass-Service-Key": key, "X-Compass-User": owner},
        )

    path = "/api/v1/ticket-board"
    a = client("ticket-owner")
    ctx = a.get("/api/v1/demo/context").json()
    tasks = [t["id"] for t in ctx["tasks"][:2]]
    state = a.get(path).json()
    body = {
        "scope": state["scope"],
        "version": 0,
        "task_ids": tasks,
        "active_task_id": tasks[0],
        "capacity_minutes": 90,
        "planned_minutes": {tasks[0]: 25},
    }
    saved = a.post(path, json=body)
    assert saved.status_code == 200
    assert client("ticket-owner").get(path).json() == saved.json()
    assert client("someone-else").get(path).json()["board"] is None
    assert client("ticket-owner").post(path, json=body).status_code == 409
    reordered = client("ticket-owner").post(
        path, json={**body, "version": 1, "task_ids": tasks[::-1], "ticket_order": tasks[::-1]}
    )
    assert reordered.status_code == 200
    assert client("ticket-owner").get(path).json()["board"]["task_ids"] == tasks[::-1]

    assert client("ticket-owner").get(path).json()["board"]["ticket_order"] == tasks[::-1]

    from uuid import uuid4

    identifier = str(uuid4())
    created = a.post(
        path + "/tasks",
        json={
            "scope": state["details_scope"],
            "task_id": identifier,
            "assignment_id": ctx["assignments"][0]["assignment_id"],
            "title": "Review matrix operations",
            "description": "Personal review notes",
            "estimated_minutes": 30,
        },
    )
    assert created.status_code == 200
    fresh = client("ticket-owner")
    assert identifier in {t["id"] for t in fresh.get("/api/v1/demo/context").json()["tasks"]}
    assert (
        fresh.get(path).json()["details"]["edits"][identifier]["description"]
        == "Personal review notes"
    )
    assert identifier not in {
        t["id"] for t in client("someone-else").get("/api/v1/demo/context").json()["tasks"]
    }

import os
from datetime import UTC, datetime
from uuid import uuid4

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
def test_confirmed_memory_and_conversation_survive_fresh_instances_and_workspace_reset(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    key = "postgres-companion-key"
    monkeypatch.setenv("COMPASS_SERVICE_KEY", key)

    def client(owner: str) -> TestClient:
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

    path = "/api/v1/companion"
    identifier = str(uuid4())
    memory = {
        "identifier": identifier,
        "kind": "learning_goal",
        "content": "Tôi muốn hiểu Bayes trước khi làm bài.",
        "confirmed": True,
    }
    assert client("a").post(path + "/memory", json=memory).status_code == 200
    message = {
        "request_id": str(uuid4()),
        "text": "Giúp tôi lên kế hoạch tuần sau.",
        "mode": "plan",
        "course_id": "ai",
    }
    response = client("a").post(path + "/messages", json=message)
    assert response.status_code == 200
    again = client("a")
    assert again.get(path).json()["memories"][0]["content"] == memory["content"]
    assert again.post(path + "/messages", json=message).json() == response.json()
    assert client("b").get(path).json() == {"memories": [], "exchanges": []}
    assert (
        again.post("/api/v1/demo/scenarios/select", json={"scenario_id": "week"}).status_code == 200
    )
    assert len(client("a").get(path).json()["memories"]) == 1
    assert client("a").delete(path + "/history").status_code == 200
    assert client("a").get(path).json()["exchanges"] == []
    assert len(client("a").get(path).json()["memories"]) == 1
    assert client("a").delete(path + "/memory/" + identifier).status_code == 200
    assert client("a").get(path).json()["memories"] == []

    # Real conversation IDs and their transcripts survive independent workers.
    conversation = str(uuid4())
    assert (
        client("a").post(path + "/conversations", json={"identifier": conversation}).status_code
        == 200
    )
    threaded = {**message, "request_id": str(uuid4()), "conversation_id": conversation}
    saved = client("a").post(path + "/messages", json=threaded)
    assert saved.status_code == 200
    page = client("a").get(path + "/conversations/" + conversation).json()
    assert page["exchanges"] == [saved.json()]
    assert page["conversation"]["title"] == message["text"]
    assert client("b").get(path + "/conversations/" + conversation).status_code == 404
    assert client("a").post(path + "/messages", json=threaded).json() == saved.json()

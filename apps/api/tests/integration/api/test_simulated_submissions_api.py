import json
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from haui_compass.api.dependencies import build_container
from haui_compass.api.simulated_workspaces import create_simulated_workspace_app
from haui_compass.infrastructure.demo.simulated_workspaces import (
    SimulatedCanvasLMSProvider,
    SimulatedWorkspaces,
    WorkspaceClock,
)
from haui_compass.infrastructure.persistence.memory.simulated_workspaces import (
    InMemorySimulatedWorkspaceRepository,
)
from support.clocks import FixedClock


def test_explicit_submissions_drive_kpi_without_counting_completed_tasks(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("COMPASS_SERVICE_KEY", "submission-test")
    monkeypatch.setenv("COMPASS_LECTURER_GRANTS", '{"teacher":["canvas-demo-ai"]}')
    monkeypatch.setenv(
        "COMPASS_SIMULATED_CLASS_ROSTERS",
        json.dumps({"canvas-demo-ai": [f"s{i}" for i in range(5)]}),
    )
    clock = FixedClock(datetime(2026, 10, 19, 2, tzinfo=UTC))
    container = build_container(lms=SimulatedCanvasLMSProvider(), clock=WorkspaceClock(clock))
    workspaces = SimulatedWorkspaces(
        repository=InMemorySimulatedWorkspaceRepository(),
        tasks=container.task_repository,
        transaction_manager=container.transaction_manager,
        clock=clock,
    )
    app = create_simulated_workspace_app(
        container=container, workspaces=workspaces, service_key="submission-test"
    )

    def client(owner: str) -> TestClient:
        return TestClient(
            app, headers={"X-Compass-Service-Key": "submission-test", "X-Compass-User": owner}
        )

    students = [client(f"s{i}") for i in range(5)]
    contexts = [student.get("/api/v1/demo/context").json() for student in students]
    teacher = client("teacher")
    student = students[0]
    assignment = contexts[0]["assignments"][0]["assignment_id"]
    path = f"/api/v1/demo/submissions/{assignment}"
    initial = teacher.get("/api/v1/lecturer/classes").json()["classes"][0]
    assert initial["progress"]["on_time_rate"] is None
    assert initial["comparison"]["before"]["due_obligations"] == 5
    assert student.post(path, json={"submitted_at": "2020-01-01T00:00:00Z"}).status_code == 422
    first = student.post(path, json={})
    assert first.status_code == 200 and first.json()["submitted_at"] == contexts[0]["now"]
    assert students[1].post(path, json={}).status_code == 404
    assert students[1].get("/api/v1/demo/submissions").json()["submissions"] == []
    for _ in range(4):
        assert (
            student.post("/api/v1/demo/clock/advance", json={"to": "next_day"}).status_code == 200
        )
    assert student.post(path, json={}).json() == first.json()  # no re-dating on retry
    second = contexts[0]["assignments"][1]["assignment_id"]
    assert student.post(f"/api/v1/demo/submissions/{second}", json={}).status_code == 200
    student.post("/api/v1/demo/clock/advance", json={"to": "next_day"})
    report = teacher.get("/api/v1/lecturer/classes").json()["classes"][0]
    assert report["progress"]["due_obligations"] == 3
    assert report["progress"]["on_time_due"] == 1 and report["progress"]["late"] == 1
    assert report["progress"]["not_submitted"] == 1
    assert report["progress"]["on_time_rate"] == 33.3
    assert report["activity"]["completed_tasks"] == 0
    assert "student_id" not in teacher.get("/api/v1/lecturer/classes").text
    assert teacher.post(path, json={}).status_code == 403
    student.post("/api/v1/demo/scenarios/select", json={"scenario_id": "week"})
    assert student.get("/api/v1/demo/submissions").json()["submissions"] == []
    assert student.post(path, json={}).status_code == 404

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


def test_assignment_insights_are_live_scoped_and_suppressed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("COMPASS_LECTURER_FIXTURE", raising=False)
    monkeypatch.setenv("COMPASS_SERVICE_KEY", "insights-test")
    monkeypatch.setenv(
        "COMPASS_LECTURER_GRANTS", '{"teacher":["canvas-demo-ai","canvas-demo-small"]}'
    )
    owners = [f"insights-{i}" for i in range(5)]
    monkeypatch.setenv(
        "COMPASS_SIMULATED_CLASS_ROSTERS",
        json.dumps(
            {
                "canvas-demo-ai": [*owners, owners[0], "teacher"],
                "canvas-demo-small": owners[:4],
            }
        ),
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
        container=container, workspaces=workspaces, service_key="insights-test"
    )

    def client(owner: str) -> TestClient:
        return TestClient(
            app, headers={"X-Compass-Service-Key": "insights-test", "X-Compass-User": owner}
        )

    teacher = client("teacher")
    path = "/api/v1/lecturer/classes/canvas-demo-ai/insights"
    assert teacher.get(path).json()["detail"] is None  # GET never initializes learners
    learners = [client(owner) for owner in owners]
    contexts = [learner.get("/api/v1/demo/context").json() for learner in learners]
    initial = teacher.get(path)
    assert initial.status_code == 200 and initial.headers["cache-control"] == "no-store"
    detail = initial.json()["detail"]
    assert detail["enrollment_count"] == 5
    assert len(detail["assignments"]) == 5
    assert sum(a["tasks"] for a in detail["assignments"]) == 25
    assert detail["support"] == {
        "learners_overdue": 0,
        "learners_due_soon": 0,
        "learners_without_plan": 5,
    }
    # Early first submission, then a late second submission; the third stays missing.
    ids = [a["assignment_id"] for a in contexts[0]["assignments"]]
    learners[0].post(f"/api/v1/demo/submissions/{ids[0]}", json={})
    for _ in range(5):
        learners[0].post("/api/v1/demo/clock/advance", json={"to": "next_day"})
    learners[0].post(f"/api/v1/demo/submissions/{ids[1]}", json={})
    response = teacher.get(path)
    detail = response.json()["detail"]
    assert detail["support"]["learners_overdue"] == 1  # unique learner, not two obligations
    first, second, third, *_ = detail["assignments"]
    assert first["progress"]["on_time_rate"] == 100
    assert second["progress"]["late"] == 1
    assert third["progress"]["not_submitted"] == 1
    assert sum(a["completed_tasks"] for a in detail["assignments"]) == 0
    for forbidden in ["insights-", "student_id", "assignment_id", "goal_text", "reflection_text"]:
        assert forbidden not in response.text
    small = teacher.get("/api/v1/lecturer/classes/canvas-demo-small/insights").json()
    assert small["suppressed"] and small["detail"] is None
    assert learners[0].get(path).status_code == 403
    assert teacher.get("/api/v1/lecturer/classes/canvas-demo-other/insights").status_code == 404
    # Browser-selected owners cannot replace the explicit roster; an outsider doesn't count.
    client("outsider").get("/api/v1/demo/context")
    assert teacher.get(path + "?owners=outsider").json()["detail"] == detail
    learners[0].post("/api/v1/demo/scenarios/select", json={"scenario_id": "week"})
    assert teacher.get(path).json()["detail"]["support"]["learners_overdue"] == 0
    # A single learner advancing to Tuesday creates exactly one upcoming-deadline signal.
    learners[0].post("/api/v1/demo/clock/advance", json={"to": "next_day"})
    assert teacher.get(path).json()["detail"]["support"]["learners_due_soon"] == 1

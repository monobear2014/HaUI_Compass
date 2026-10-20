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
from support.weekly_flow import complete_week


def test_rostered_student_actions_change_only_authorized_aggregate(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("COMPASS_LECTURER_FIXTURE", raising=False)
    monkeypatch.setenv("COMPASS_SERVICE_KEY", "live-test-key")
    monkeypatch.setenv(
        "COMPASS_LECTURER_GRANTS", json.dumps({"teacher": ["canvas-demo-ai", "canvas-demo-small"]})
    )
    owners = [f"learner-{i}" for i in range(5)]
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
        container=container, workspaces=workspaces, service_key="live-test-key"
    )

    def client(owner: str) -> TestClient:
        return TestClient(
            app, headers={"X-Compass-Service-Key": "live-test-key", "X-Compass-User": owner}
        )

    teacher = client("teacher")
    path = "/api/v1/lecturer/classes"
    assert teacher.get(path).json()["classes"][0]["suppressed"] is True
    for owner in owners:
        assert client(owner).get("/api/v1/demo/context").status_code == 200
    initial = teacher.get(path).json()
    assert initial["mode"] == "live_activity"
    assert initial["classes"][0]["activity"]["tasks"] == 25
    assert initial["classes"][0]["activity"]["completed_tasks"] == 0
    assert initial["classes"][0]["enrollment_count"] == 5
    complete_week(client(owners[0]))
    after = teacher.get(path)
    live, small = after.json()["classes"]
    assert live["activity"] == dict(
        tasks=26, completed_tasks=1, study_minutes=80, learners_with_plan=1, learners_reflected=1
    )
    assert live["progress"]["on_time_due"] == 0  # completion is not submission
    assert live["comparison"]["before"]["due_obligations"] == 5
    assert small["activity"] is None and small["enrollment_count"] is None
    for forbidden in ["learner-", "Chuẩn hoá 3NF", "goal_text", "student_id"]:
        assert forbidden not in after.text
    # Unrostered activity and a client-supplied roster cannot change the result.
    complete_week(client("outsider"))
    assert teacher.get(path + "?owners=outsider").json()["classes"] == after.json()["classes"]
    assert client(owners[0]).get(path).status_code == 403
    assert teacher.get(path + "/canvas-demo-other/progress").status_code == 404
    # Reset retires the old generation; reads never seed or resurrect its activity.
    assert (
        client(owners[0])
        .post("/api/v1/demo/scenarios/select", json={"scenario_id": "week"})
        .status_code
        == 200
    )
    reset = teacher.get(path).json()["classes"][0]["activity"]
    assert reset["tasks"] == 25 and reset["completed_tasks"] == 0 and reset["study_minutes"] == 0
    monkeypatch.setenv("COMPASS_SIMULATED_CLASS_ROSTERS", '{"canvas-demo-ai":"invalid"}')
    assert teacher.get(path).json()["classes"][0]["activity"] is None

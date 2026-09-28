"""The opt-in demo uses the real HTTP/application loop, not browser fixtures."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi.testclient import TestClient

from haui_compass.api.demo import create_demo_app
from haui_compass.api.main import create_app
from support.clocks import FixedClock


def test_demo_is_opt_in() -> None:
    with TestClient(create_app()) as client:
        assert client.get("/api/v1/demo/context").status_code == 404


def test_seeded_context_tracks_execution_and_plan_history() -> None:
    now = datetime(2026, 9, 29, 8, tzinfo=UTC)
    with TestClient(create_demo_app(FixedClock(now))) as client:
        context = client.get("/api/v1/demo/context").json()
        assert context["mode"] == "fictional_in_memory_demo"
        assert len(context["tasks"]) == 4
        task = context["tasks"][0]
        execution = {
            "student": context["student"],
            "record_id": str(uuid4()),
            "task_id": task["id"],
            "started_at": (now - timedelta(minutes=25)).isoformat(),
            "ended_at": now.isoformat(),
            "outcome": "partial",
        }
        assert client.post("/api/v1/task-executions", json=execution).status_code == 200
        assert client.post("/api/v1/task-executions", json=execution).status_code == 200
        current = client.get("/api/v1/demo/context").json()
        assert current["tasks"][0]["status"] == "in_progress"
        response = client.post(
            "/api/v1/weekly-plans/replan",
            json={
                "student": context["student"],
                "record_id": str(uuid4()),
                "period": context["period"],
                "study_windows": context["study_windows"],
                "effective_at": now.isoformat(),
                "remaining_efforts": [
                    {
                        "task_id": row["id"],
                        "remaining_duration_seconds": row["estimated_duration_seconds"],
                    }
                    for row in current["tasks"]
                ],
            },
        )
        assert response.status_code == 200, response.text
        assert response.json()["plan"]["revision"] == 2
        assert response.json()["plan"]["unplanned_tasks"]
        history = client.get(
            "/api/v1/weekly-plans/history",
            params={
                "student_provider": context["student"]["provider"],
                "student_id": context["student"]["id"],
                "period_start": context["period"]["start"],
                "period_end": context["period"]["end"],
            },
        ).json()
        assert [row["revision"] for row in history] == [1, 2]

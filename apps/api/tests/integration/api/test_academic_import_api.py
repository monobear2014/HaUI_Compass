from datetime import UTC, datetime
from uuid import UUID

from fastapi.testclient import TestClient

from haui_compass.api.dependencies import build_container
from haui_compass.api.main import create_app
from support.clocks import FixedClock


def payload() -> dict[str, object]:
    return {
        "schema_version": "haui-compass-academic-import-v1",
        "student_external_id": "pilot",
        "source": "json",
        "courses": [{"external_id": "db", "name": "Databases", "code": "DB101"}],
        "assignments": [
            {
                "external_id": "schema",
                "course_external_id": "db",
                "title": "Schema report",
                "deadline": "2026-10-08T17:00:00+07:00",
                "estimated_effort_minutes": 90,
            }
        ],
        "submissions": [],
    }


def test_import_then_explicit_task_creation_drives_existing_recommendation() -> None:
    app = create_app(build_container(clock=FixedClock(datetime(2026, 10, 1, tzinfo=UTC))))
    client = TestClient(app)
    imported = client.post("/api/v1/academic-data/import", json=payload())
    assert imported.status_code == 200
    assert imported.json()["assignments"] == 1
    task = client.post(
        "/api/v1/tasks",
        json={
            "student": {"provider": "json", "id": "pilot"},
            "assignment": {"provider": "json", "id": "schema"},
            "task_id": str(UUID(int=55)),
            "title": "Draft the schema",
            "estimated_effort_minutes": 45,
        },
    )
    assert task.status_code == 200
    recommendation = client.post(
        "/api/v1/daily-recommendation",
        json={
            "student": {"provider": "json", "id": "pilot"},
            "available_minutes": 180,
            "assignment_capacities": [],
        },
    )
    assert recommendation.status_code == 200
    assert recommendation.json()["recommendation"]["task_id"] == str(UUID(int=55))


def test_changed_reimport_is_a_conflict_and_clear_protects_referenced_data() -> None:
    client = TestClient(
        create_app(build_container(clock=FixedClock(datetime(2026, 10, 1, tzinfo=UTC))))
    )
    assert client.post("/api/v1/academic-data/import", json=payload()).status_code == 200
    changed = payload()
    changed["assignments"] = [
        {
            "external_id": "schema",
            "course_external_id": "db",
            "title": "Changed title",
            "deadline": "2026-10-08T17:00:00+07:00",
            "estimated_effort_minutes": 90,
        }
    ]
    assert client.post("/api/v1/academic-data/import", json=changed).status_code == 409

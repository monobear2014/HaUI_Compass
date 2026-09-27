from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from fastapi.testclient import TestClient

from haui_compass.api.dependencies import build_container
from haui_compass.api.main import create_app
from haui_compass.application.lms_mapping import assignment_id_for, student_id_for
from haui_compass.application.ports.lms import ExternalRef
from haui_compass.application.ports.tasks import StoredTask
from haui_compass.domain.tasks.task import Task, TaskId
from haui_compass.infrastructure.lms.mock import MockLMSProvider

NOW = datetime(2026, 10, 1, 8, tzinfo=UTC)
STUDENT = ExternalRef("mock-lms", "student-001")


def client_with_task() -> tuple[TestClient, UUID]:
    clock = type("FixedClock", (), {"now": lambda self: NOW})()
    lms = MockLMSProvider.canonical(anchor=NOW)
    assignment = lms.get_assignments(STUDENT)[0]
    task_id = uuid4()
    task = Task(
        id=TaskId(task_id),
        assignment_id=assignment_id_for(assignment.ref),
        title="Read chapter",
        estimated_duration=timedelta(minutes=25),
    )
    container = build_container(lms=lms, clock=clock)
    container.task_repository.save(
        StoredTask(student_id=student_id_for(STUDENT), task=task, saved_at=NOW)
    )
    return TestClient(create_app(container)), task_id


def test_health_and_openapi_are_stable() -> None:
    client, _ = client_with_task()
    assert client.get("/api/v1/health").json() == {"status": "ok"}
    document = client.get("/openapi.json").json()
    assert "/api/v1/health" in document["paths"]
    assert "/api/v1/daily-recommendation" in document["paths"]
    assert "/api/v1/task-executions" in document["paths"]


def test_recommendation_execution_and_idempotency_flow() -> None:
    client, task_id = client_with_task()
    request = {
        "student": {"provider": "mock-lms", "id": "student-001"},
        "available_minutes": 60,
        "assignment_capacities": [],
    }
    recommendation = client.post("/api/v1/daily-recommendation", json=request)
    assert recommendation.status_code == 200
    assert recommendation.json()["recommendation"]["kind"] == "recommendation"

    execution = {
        "student": request["student"],
        "task_id": str(task_id),
        "record_id": str(uuid4()),
        "started_at": "2026-10-01T07:00:00+00:00",
        "ended_at": "2026-10-01T07:25:00+00:00",
        "outcome": "completed",
    }
    first = client.post("/api/v1/task-executions", json=execution)
    assert first.status_code == 200
    assert first.json()["idempotent_retry"] is False
    second = client.post("/api/v1/task-executions", json=execution)
    assert second.status_code == 200
    assert second.json()["idempotent_retry"] is True

    after = client.post("/api/v1/daily-recommendation", json=request)
    assert after.status_code == 200
    assert after.json()["recommendation"]["kind"] == "no_recommendation"


def test_error_envelope_and_aware_datetime_validation() -> None:
    client, task_id = client_with_task()
    malformed = {
        "student": {"provider": "mock-lms", "id": "student-001"},
        "task_id": str(task_id),
        "record_id": str(uuid4()),
        "started_at": "2026-10-01T09:00:00",
        "ended_at": "2026-10-01T09:25:00+00:00",
        "outcome": "completed",
    }
    response = client.post("/api/v1/task-executions", json=malformed)
    assert response.status_code == 422
    assert set(response.json()) == {"error"}
    assert set(response.json()["error"]) == {"code", "message"}

    missing = client.post(
        "/api/v1/daily-recommendation",
        json={
            "student": {"provider": "mock-lms", "id": "unknown"},
            "available_minutes": 1,
            "assignment_capacities": [],
        },
    )
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "not_found"


def test_conflicting_record_id_and_invalid_intervals_are_safe_errors() -> None:
    client, task_id = client_with_task()
    record_id = str(uuid4())
    base = {
        "student": {"provider": "mock-lms", "id": "student-001"},
        "task_id": str(task_id),
        "record_id": record_id,
        "started_at": "2026-10-01T07:00:00+00:00",
        "ended_at": "2026-10-01T07:25:00+00:00",
        "outcome": "partial",
    }
    assert client.post("/api/v1/task-executions", json=base).status_code == 200
    conflict = {**base, "outcome": "completed"}
    response = client.post("/api/v1/task-executions", json=conflict)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "record_conflict"

    invalid_interval = {**base, "record_id": str(uuid4()), "ended_at": base["started_at"]}
    response = client.post("/api/v1/task-executions", json=invalid_interval)
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_request"

    negative_capacity = {
        "student": {"provider": "mock-lms", "id": "student-001"},
        "available_minutes": -1,
        "assignment_capacities": [],
    }
    assert client.post("/api/v1/daily-recommendation", json=negative_capacity).status_code == 422

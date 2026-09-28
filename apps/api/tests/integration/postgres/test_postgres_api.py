import os
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from haui_compass.api.main import create_app
from haui_compass.api.postgres_dependencies import build_postgres_container
from haui_compass.application.lms_mapping import assignment_id_for, student_id_for
from haui_compass.application.ports.lms import ExternalRef
from haui_compass.application.ports.tasks import StoredTask
from haui_compass.domain.tasks.task import Task, TaskId
from haui_compass.infrastructure.config.database import DatabaseSettings
from haui_compass.infrastructure.lms.mock import MockLMSProvider


@pytest.mark.postgres
def test_postgres_http_learning_loop() -> None:
    url = os.getenv("HAUI_COMPASS_TEST_DATABASE_URL") or os.getenv("DATABASE_URL")
    if not url or not url.startswith("postgresql"):
        pytest.skip("real PostgreSQL test database is not configured")
    now = datetime(2026, 10, 1, 8, tzinfo=UTC)
    student = ExternalRef("mock-lms", "student-001")
    lms = MockLMSProvider.canonical(anchor=now)
    container = build_postgres_container(
        settings=DatabaseSettings(url=url),
        lms=lms,
        clock=type("FixedClock", (), {"now": lambda self: now})(),
    )
    assignment = lms.get_assignments(student)[0]
    task = Task(
        id=TaskId(uuid4()),
        assignment_id=assignment_id_for(assignment.ref),
        title="Postgres task",
        estimated_duration=timedelta(minutes=20),
    )
    container.record_persisted_task_execution._transaction_manager.run(  # type: ignore[union-attr]
        lambda: container.task_repository.save(
            StoredTask(student_id=student_id_for(student), task=task, saved_at=now)
        )
    )
    client = TestClient(create_app(container))
    student_payload: dict[str, str] = {"provider": student.provider, "id": student.id}
    payload: dict[str, object] = {
        "student": student_payload,
        "available_minutes": 60,
        "assignment_capacities": [],
    }
    assert client.post("/api/v1/daily-recommendation", json=payload).status_code == 200
    execution = {
        "student": student_payload,
        "task_id": str(task.id),
        "record_id": str(uuid4()),
        "started_at": "2026-10-01T07:00:00+00:00",
        "ended_at": "2026-10-01T07:20:00+00:00",
        "outcome": "completed",
    }
    assert client.post("/api/v1/task-executions", json=execution).status_code == 200
    assert (
        client.post("/api/v1/daily-recommendation", json=payload).json()["recommendation"]["kind"]
        == "no_recommendation"
    )

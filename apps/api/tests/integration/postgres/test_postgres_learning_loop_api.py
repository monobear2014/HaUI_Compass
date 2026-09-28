"""One real persistence proof for the HTTP PLAN → DO → REFLECT → ADAPT loop."""

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
def test_postgres_http_plan_do_reflect_adapt() -> None:
    url = os.getenv("HAUI_COMPASS_TEST_DATABASE_URL") or os.getenv("DATABASE_URL")
    if not url or not url.startswith("postgresql"):
        pytest.skip("real PostgreSQL test database is not configured")
    now = datetime(2026, 10, 1, 8, tzinfo=UTC)
    student_ref = ExternalRef("mock-lms", "student-001")
    lms = MockLMSProvider.canonical(anchor=now)
    container = build_postgres_container(
        settings=DatabaseSettings(url=url),
        lms=lms,
        clock=type("FixedClock", (), {"now": lambda self: now})(),
    )
    task_id = uuid4()
    assignment = lms.get_assignments(student_ref)[0]
    container.record_persisted_task_execution._transaction_manager.run(  # type: ignore[union-attr]
        lambda: container.task_repository.save(
            StoredTask(
                student_id=student_id_for(student_ref),
                task=Task(
                    id=TaskId(task_id),
                    assignment_id=assignment_id_for(assignment.ref),
                    title="PostgreSQL learning-loop task",
                    estimated_duration=timedelta(minutes=20),
                ),
                saved_at=now,
            )
        )
    )
    client = TestClient(create_app(container))
    student = {"provider": student_ref.provider, "id": student_ref.id}
    period = {"start": "2026-10-01T08:00:00+00:00", "end": "2026-10-02T08:00:00+00:00"}
    first_id = str(uuid4())
    assert (
        client.post(
            "/api/v1/weekly-plans",
            json={
                "student": student,
                "record_id": first_id,
                "period": period,
                "study_windows": [
                    {
                        "starts_at": "2026-10-01T09:00:00+00:00",
                        "ends_at": "2026-10-01T10:00:00+00:00",
                    }
                ],
            },
        ).json()["revision"]
        == 1
    )
    assert (
        client.post(
            "/api/v1/task-executions",
            json={
                "student": student,
                "task_id": str(task_id),
                "record_id": str(uuid4()),
                "started_at": "2026-10-01T07:00:00+00:00",
                "ended_at": "2026-10-01T07:10:00+00:00",
                "outcome": "partial",
            },
        ).status_code
        == 200
    )
    reflection = {
        "student": student,
        "period": period,
        "responses": {"deferred_task_ids": [str(task_id)]},
    }
    candidates = client.post("/api/v1/reflections/candidates", json=reflection).json()["candidates"]
    selected = next(item["id"] for item in candidates if item["kind"] == "deferred_task")
    assert (
        client.post(
            "/api/v1/reflections/confirm",
            json={**reflection, "record_id": str(uuid4()), "selected_signal_ids": [selected]},
        ).status_code
        == 200
    )
    second_id = str(uuid4())
    revised = client.post(
        "/api/v1/weekly-plans/replan",
        json={
            "student": student,
            "record_id": second_id,
            "period": period,
            "study_windows": [
                {"starts_at": "2026-10-01T09:00:00+00:00", "ends_at": "2026-10-01T10:00:00+00:00"}
            ],
            "remaining_efforts": [{"task_id": str(task_id), "remaining_duration_seconds": 1200}],
            "effective_at": "2026-10-01T08:00:00+00:00",
        },
    )
    assert revised.status_code == 200
    assert revised.json()["plan"]["revision"] == 2
    latest = client.get(
        "/api/v1/weekly-plans/latest",
        params={
            "student_provider": student_ref.provider,
            "student_id": student_ref.id,
            "period_start": period["start"],
            "period_end": period["end"],
        },
    )
    assert latest.json()["record_id"] == second_id

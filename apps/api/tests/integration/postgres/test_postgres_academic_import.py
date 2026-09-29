"""Real-PostgreSQL proof for the user-provided academic import pilot contract."""

import os
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, select, text

from haui_compass.api.main import create_app
from haui_compass.api.postgres_dependencies import build_postgres_container
from haui_compass.application.academic_import import AcademicSource, dataset_from_values
from haui_compass.application.ports.lms import SubmissionStatus
from haui_compass.infrastructure.config.database import DatabaseSettings
from haui_compass.infrastructure.persistence.postgres.models import AcademicSourceRow

DATABASE_URL = os.getenv("HAUI_COMPASS_TEST_DATABASE_URL") or os.getenv("DATABASE_URL")
NOW = datetime(2026, 10, 1, 8, tzinfo=UTC)
PERIOD = {"start": "2026-10-01T08:00:00+00:00", "end": "2026-10-02T08:00:00+00:00"}


@pytest.fixture
def database_url() -> str:
    if not DATABASE_URL or not DATABASE_URL.startswith("postgresql"):
        pytest.skip("real PostgreSQL test database is not configured")
    return DATABASE_URL


def payload(*, student: str = "pilot", source: str = "json") -> dict[str, object]:
    return {
        "schema_version": "haui-compass-academic-import-v1",
        "student_external_id": student,
        "source": source,
        "courses": [{"external_id": "db", "name": "Databases", "code": "DB101"}],
        "assignments": [
            {
                "external_id": "report",
                "course_external_id": "db",
                "title": "Schema report",
                "deadline": "2026-10-08T17:00:00+07:00",
                "estimated_effort_minutes": 90,
            }
        ],
        "submissions": [
            {
                "assignment_external_id": "report",
                "status": "not_submitted",
                "submitted_at": None,
            }
        ],
    }


def client_for(url: str) -> TestClient:
    clock = type("FixedClock", (), {"now": lambda self: NOW})()
    return TestClient(
        create_app(build_postgres_container(settings=DatabaseSettings(url=url), clock=clock))
    )


@pytest.mark.postgres
def test_migrations_apply_both_revisions_and_expose_import_constraints(database_url: str) -> None:
    config = Config("alembic.ini")
    os.environ["HAUI_COMPASS_DATABASE_URL"] = database_url
    command.downgrade(config, "0001_initial")
    command.upgrade(config, "head")
    engine = create_engine(database_url, future=True)
    try:
        inspector = inspect(engine)
        assert {
            "academic_sources",
            "imported_courses",
            "imported_assignments",
            "imported_submissions",
        } <= set(inspector.get_table_names())
        assert "uq_academic_source_student_source" in {
            item["name"] for item in inspector.get_unique_constraints("academic_sources")
        }
        assert "uq_imported_course_external" in {
            item["name"] for item in inspector.get_unique_constraints("imported_courses")
        }
        assert "uq_imported_assignment_external" in {
            item["name"] for item in inspector.get_unique_constraints("imported_assignments")
        }
        assert "uq_imported_submission_assignment" in {
            item["name"] for item in inspector.get_unique_constraints("imported_submissions")
        }
        assert {
            foreign_key["referred_table"]
            for foreign_key in inspector.get_foreign_keys("imported_assignments")
        } == {"academic_sources", "imported_courses"}
        with engine.connect() as connection:
            assert connection.scalar(text("SELECT version_num FROM alembic_version")) == (
                "0002_imported_academic_data"
            )
    finally:
        engine.dispose()


@pytest.mark.postgres
def test_postgres_import_idempotency_conflict_provenance_and_safe_clear(database_url: str) -> None:
    client = client_for(database_url)
    first = client.post("/api/v1/academic-data/import", json=payload())
    assert first.status_code == 200
    assert first.json()["idempotent_retry"] is False
    retry = client.post("/api/v1/academic-data/import", json=payload())
    assert retry.status_code == 200
    assert retry.json()["idempotent_retry"] is True

    changed = payload()
    changed["assignments"] = [
        {
            "external_id": "report",
            "course_external_id": "db",
            "title": "Changed report",
            "deadline": "2026-10-08T17:00:00+07:00",
            "estimated_effort_minutes": 90,
        }
    ]
    assert client.post("/api/v1/academic-data/import", json=changed).status_code == 409
    current = client.get(
        "/api/v1/academic-data", params={"source": "json", "student_external_id": "pilot"}
    )
    assert current.status_code == 200
    assert current.json()["assignments_data"][0]["title"] == "Schema report"

    engine = create_engine(database_url, future=True)
    try:
        with engine.connect() as connection:
            source, student_external_id, imported_at = connection.execute(
                select(
                    AcademicSourceRow.source,
                    AcademicSourceRow.student_external_id,
                    AcademicSourceRow.imported_at,
                )
            ).one()
            assert source == "json"
            assert student_external_id == "pilot"
            assert imported_at.tzinfo is not None
    finally:
        engine.dispose()

    task = client.post(
        "/api/v1/tasks",
        json={
            "student": {"provider": "json", "id": "pilot"},
            "assignment": {"provider": "json", "id": "report"},
            "task_id": str(UUID(int=901)),
            "title": "Draft schema report",
            "estimated_effort_minutes": 45,
        },
    )
    assert task.status_code == 200
    assert (
        client.delete(
            "/api/v1/academic-data", params={"source": "json", "student_external_id": "pilot"}
        ).status_code
        == 409
    )

    assert (
        client.post("/api/v1/academic-data/import", json=payload(student="other")).status_code
        == 200
    )
    assert (
        client.delete(
            "/api/v1/academic-data", params={"source": "json", "student_external_id": "other"}
        ).status_code
        == 204
    )
    assert (
        client.get(
            "/api/v1/academic-data", params={"source": "json", "student_external_id": "pilot"}
        ).status_code
        == 200
    )


@pytest.mark.postgres
def test_import_rolls_back_when_the_transaction_fails(database_url: str) -> None:
    container = build_postgres_container(settings=DatabaseSettings(url=database_url))
    dataset = dataset_from_values(
        student_id="rollback",
        source=AcademicSource.JSON_IMPORT,
        courses=(("db", "Databases", "DB101"),),
        assignments=(("report", "db", "Schema report", datetime(2026, 10, 8, tzinfo=UTC), 90),),
        submissions=(("report", SubmissionStatus.NOT_SUBMITTED, None),),
    )

    def replace_then_fail() -> None:
        container.imported_academic_data.replace(dataset)
        raise RuntimeError("controlled import failure")

    with pytest.raises(RuntimeError, match="controlled import failure"):
        container.transaction_manager.run(replace_then_fail)
    assert (
        client_for(database_url)
        .get("/api/v1/academic-data", params={"source": "json", "student_external_id": "rollback"})
        .status_code
        == 404
    )


@pytest.mark.postgres
def test_canonical_http_thesis_scenario_survives_rebuilt_composition(database_url: str) -> None:
    client = client_for(database_url)
    student = {"provider": "json", "id": "pilot"}

    assert client.post("/api/v1/academic-data/import", json=payload()).status_code == 200
    assert (
        client.get(
            "/api/v1/academic-data", params={"source": "json", "student_external_id": "pilot"}
        ).json()["assignments"]
        == 1
    )
    task_id = str(UUID(int=902))
    created = client.post(
        "/api/v1/tasks",
        json={
            "student": student,
            "assignment": {"provider": "json", "id": "report"},
            "task_id": task_id,
            "title": "Draft schema report",
            "estimated_effort_minutes": 45,
        },
    )
    assert created.status_code == 200
    assert created.json()["status"] == "not_started"

    window = {"starts_at": "2026-10-01T09:00:00+00:00", "ends_at": "2026-10-01T10:30:00+00:00"}
    initial_id = str(uuid4())
    initial = client.post(
        "/api/v1/weekly-plans",
        json={
            "student": student,
            "record_id": initial_id,
            "period": PERIOD,
            "study_windows": [window],
        },
    )
    assert initial.status_code == 200
    assert initial.json()["revision"] == 1
    recommendation = client.post(
        "/api/v1/daily-recommendation",
        json={"student": student, "available_minutes": 120, "assignment_capacities": []},
    )
    assert recommendation.status_code == 200
    assert recommendation.json()["recommendation"]["task_id"] == task_id

    execution = client.post(
        "/api/v1/task-executions",
        json={
            "student": student,
            "task_id": task_id,
            "record_id": str(uuid4()),
            "started_at": "2026-10-01T07:00:00+00:00",
            "ended_at": "2026-10-01T07:20:00+00:00",
            "outcome": "partial",
        },
    )
    assert execution.status_code == 200
    assert execution.json()["task_status"] == "in_progress"

    reflection = {
        "student": student,
        "period": PERIOD,
        "responses": {"deferred_task_ids": [task_id]},
    }
    candidates = client.post("/api/v1/reflections/candidates", json=reflection)
    assert candidates.status_code == 200
    selected = next(
        candidate["id"]
        for candidate in candidates.json()["candidates"]
        if candidate["kind"] == "deferred_task"
    )
    confirmed = client.post(
        "/api/v1/reflections/confirm",
        json={**reflection, "record_id": str(uuid4()), "selected_signal_ids": [selected]},
    )
    assert confirmed.status_code == 200
    assert confirmed.json()["confirmed_signal_ids"]

    revised_id = str(uuid4())
    revised = client.post(
        "/api/v1/weekly-plans/replan",
        json={
            "student": student,
            "record_id": revised_id,
            "period": PERIOD,
            "study_windows": [window],
            "remaining_efforts": [{"task_id": task_id, "remaining_duration_seconds": 1500}],
            "effective_at": "2026-10-01T08:00:00+00:00",
        },
    )
    assert revised.status_code == 200
    assert revised.json()["plan"]["revision"] == 2

    params = {
        "student_provider": "json",
        "student_id": "pilot",
        "period_start": PERIOD["start"],
        "period_end": PERIOD["end"],
    }
    latest = client.get("/api/v1/weekly-plans/latest", params=params)
    history = client.get("/api/v1/weekly-plans/history", params=params)
    assert latest.status_code == 200 and latest.json()["record_id"] == revised_id
    assert history.status_code == 200
    assert [record["revision"] for record in history.json()] == [1, 2]
    assert history.json()[0]["record_id"] == initial_id
    assert history.json()[1]["record_id"] == revised_id

    restarted = client_for(database_url)
    restored_data = restarted.get(
        "/api/v1/academic-data", params={"source": "json", "student_external_id": "pilot"}
    )
    restored_history = restarted.get("/api/v1/weekly-plans/history", params=params)
    assert restored_data.status_code == 200
    assert restored_data.json()["source"] == "json"
    assert restored_history.status_code == 200
    assert [record["revision"] for record in restored_history.json()] == [1, 2]
    assert (
        restarted.post(
            "/api/v1/daily-recommendation",
            json={"student": student, "available_minutes": 120, "assignment_capacities": []},
        ).status_code
        == 200
    )

from datetime import UTC, datetime, timedelta
from uuid import uuid4

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


def test_http_plan_do_reflect_adapt_retains_revision_history() -> None:
    clock = type("FixedClock", (), {"now": lambda self: NOW})()
    lms = MockLMSProvider.canonical(anchor=NOW)
    task_id = uuid4()
    container = build_container(lms=lms, clock=clock)
    assignment = lms.get_assignments(STUDENT)[0]
    container.task_repository.save(
        StoredTask(
            student_id=student_id_for(STUDENT),
            task=Task(
                id=TaskId(task_id),
                assignment_id=assignment_id_for(assignment.ref),
                title="Prepare regression exercise",
                estimated_duration=timedelta(minutes=20),
            ),
            saved_at=NOW,
        )
    )
    client = TestClient(create_app(container))
    student = {"provider": STUDENT.provider, "id": STUDENT.id}
    period = {"start": "2026-10-01T08:00:00+00:00", "end": "2026-10-02T08:00:00+00:00"}
    plan_id = str(uuid4())
    generated = client.post(
        "/api/v1/weekly-plans",
        json={
            "student": student,
            "record_id": plan_id,
            "period": period,
            "study_windows": [
                {"starts_at": "2026-10-01T09:00:00+00:00", "ends_at": "2026-10-01T10:00:00+00:00"}
            ],
        },
    )
    assert generated.status_code == 200
    assert generated.json()["revision"] == 1

    recommendation = client.post(
        "/api/v1/daily-recommendation",
        json={"student": student, "available_minutes": 60, "assignment_capacities": []},
    )
    assert recommendation.json()["recommendation"]["kind"] == "recommendation"
    execution = client.post(
        "/api/v1/task-executions",
        json={
            "student": student,
            "task_id": str(task_id),
            "record_id": str(uuid4()),
            "started_at": "2026-10-01T07:05:00+00:00",
            "ended_at": "2026-10-01T07:15:00+00:00",
            "outcome": "partial",
        },
    )
    assert execution.status_code == 200

    reflection_context = {
        "student": student,
        "period": period,
        "responses": {
            "reflected_task_ids": [str(task_id)],
            "workload_feedback": "too_heavy",
            "difficult_topics": ["linear regression"],
            "deferred_task_ids": [str(task_id)],
        },
    }
    candidates = client.post("/api/v1/reflections/candidates", json=reflection_context)
    assert candidates.status_code == 200
    deferred = next(
        item for item in candidates.json()["candidates"] if item["kind"] == "deferred_task"
    )
    confirmed = client.post(
        "/api/v1/reflections/confirm",
        json={
            **reflection_context,
            "record_id": str(uuid4()),
            "selected_signal_ids": [deferred["id"]],
        },
    )
    assert confirmed.status_code == 200
    assert confirmed.json()["confirmed_signal_ids"] == [deferred["id"]]

    replan_id = str(uuid4())
    replanned = client.post(
        "/api/v1/weekly-plans/replan",
        json={
            "student": student,
            "record_id": replan_id,
            "period": period,
            "study_windows": [
                {"starts_at": "2026-10-01T09:00:00+00:00", "ends_at": "2026-10-01T10:00:00+00:00"}
            ],
            "remaining_efforts": [{"task_id": str(task_id), "remaining_duration_seconds": 1200}],
            "effective_at": "2026-10-01T08:00:00+00:00",
        },
    )
    assert replanned.status_code == 200, replanned.json()
    assert replanned.json()["plan"]["revision"] == 2
    assert replanned.json()["plan"]["parent_record_id"] == plan_id

    latest = client.get(
        "/api/v1/weekly-plans/latest",
        params={
            "student_provider": STUDENT.provider,
            "student_id": STUDENT.id,
            "period_start": period["start"],
            "period_end": period["end"],
        },
    )
    assert latest.status_code == 200
    assert latest.json()["record_id"] == replan_id
    history = client.get(
        "/api/v1/weekly-plans/history",
        params={
            "student_provider": STUDENT.provider,
            "student_id": STUDENT.id,
            "period_start": period["start"],
            "period_end": period["end"],
        },
    )
    assert [item["revision"] for item in history.json()] == [1, 2]

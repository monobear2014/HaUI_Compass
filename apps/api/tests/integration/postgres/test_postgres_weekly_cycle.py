"""Weekly goal persistence and the confirmed weekly cycle against real PostgreSQL."""

import os
from datetime import timedelta
from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from haui_compass.api.main import create_app
from haui_compass.api.postgres_dependencies import build_postgres_container
from haui_compass.application.lms_mapping import student_id_for
from haui_compass.application.ports.tasks import StoredTask
from haui_compass.application.ports.weekly_goals import WeeklyGoal
from haui_compass.domain.plans.plan import StudyWindow
from haui_compass.infrastructure.config.database import DatabaseSettings
from haui_compass.infrastructure.demo.scenarios import NOW, SteppingDemoClock, week_scenario
from haui_compass.infrastructure.lms.mock import MockLMSProvider


def _url() -> str:
    url = os.getenv("HAUI_COMPASS_TEST_DATABASE_URL") or os.getenv("DATABASE_URL")
    if not url or not url.startswith("postgresql"):
        pytest.skip("real PostgreSQL test database is not configured")
    return url


@pytest.mark.postgres
def test_postgres_weekly_cycle_persists_goal_plan_adaptation_and_draft() -> None:
    scenario = week_scenario(NOW)
    clock = SteppingDemoClock(NOW)
    container = build_postgres_container(
        settings=DatabaseSettings(url=_url()),
        lms=MockLMSProvider({scenario.student: scenario.records}),
        clock=clock,
    )
    student_id = student_id_for(scenario.student)
    container.transaction_manager.run(
        lambda: [
            container.task_repository.save(StoredTask(student_id=student_id, task=t, saved_at=NOW))
            for t in scenario.tasks
        ]
    )
    client = TestClient(create_app(container))
    student = {"provider": scenario.student.provider, "id": scenario.student.id}
    period = {"start": scenario.period.start.isoformat(), "end": scenario.period.end.isoformat()}
    windows = [
        {"starts_at": w.starts_at.isoformat(), "ends_at": w.ends_at.isoformat()}
        for w in scenario.windows
    ]
    body: dict[str, Any] = {"student": student, "period": period}
    preview = client.post("/api/v1/weekly-plans/preview", json={**body, "study_windows": windows})
    assert preview.status_code == 200, preview.text
    approved = client.post(
        "/api/v1/weekly-plans/approve",
        json={
            **body,
            "study_windows": windows,
            "goal_text": "Mục tiêu tuần",
            "target_minutes": 300,
            "record_id": str(uuid4()),
        },
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["blocks"] == preview.json()["plan"]["blocks"]

    clock.advance_to_next_day()
    remaining = [
        {
            "task_id": str(t.id),
            "remaining_duration_seconds": int(t.estimated_duration.total_seconds()),
        }
        for t in scenario.tasks
    ]
    adapt = {**body, "study_windows": windows[2:], "remaining_efforts": remaining}
    assert client.post("/api/v1/weekly-plans/adapt/preview", json=adapt).status_code == 200
    applied = client.post("/api/v1/weekly-plans/adapt", json={**adapt, "record_id": str(uuid4())})
    assert applied.status_code == 200, applied.text
    assert applied.json()["plan"]["revision"] == 2

    review = client.get(
        "/api/v1/weekly-reviews",
        params={
            "student_provider": student["provider"],
            "student_id": student["id"],
            "period_start": period["start"],
            "period_end": period["end"],
        },
    )
    assert review.status_code == 200, review.text
    assert review.json()["goal"]["target_minutes"] == 300
    assert len(review.json()["goal"]["study_windows"]) == len(windows) - 2

    clock.advance_to_next_week()
    shift = timedelta(days=7)
    draft = client.get(
        "/api/v1/weekly-goals/draft",
        params={
            "student_provider": student["provider"],
            "student_id": student["id"],
            "period_start": (scenario.period.start + shift).isoformat(),
            "period_end": (scenario.period.end + shift).isoformat(),
        },
    ).json()
    assert draft["saved"] is False
    assert draft["target_minutes"] == 300
    assert len(draft["study_windows"]) == len(windows) - 2


@pytest.mark.postgres
def test_postgres_weekly_goal_upsert_round_trip() -> None:
    scenario = week_scenario(NOW)
    container = build_postgres_container(settings=DatabaseSettings(url=_url()))
    goals = container.weekly_goal_repository
    goal = WeeklyGoal(
        student_id=student_id_for(scenario.student),
        period=scenario.period,
        goal_text="  Ôn tập  ",
        target_minutes=120,
        study_windows=scenario.windows[:2],
        updated_at=NOW,
    )
    container.transaction_manager.run(lambda: goals.save(goal))
    changed = WeeklyGoal(
        student_id=goal.student_id,
        period=goal.period,
        goal_text="Đổi mục tiêu",
        target_minutes=90,
        study_windows=(StudyWindow(starts_at=NOW, ends_at=NOW + timedelta(minutes=30)),),
        updated_at=NOW + timedelta(minutes=1),
    )
    container.transaction_manager.run(lambda: goals.save(changed))
    loaded = container.transaction_manager.run(lambda: goals.get(goal.student_id, goal.period))
    assert loaded == changed
    assert container.transaction_manager.run(lambda: goals.list_for_student(goal.student_id)) == (
        changed,
    )

"""Full student week over real HTTP: Plan → Do → Adapt → Reflect → next week's plan."""

from datetime import datetime, timedelta
from typing import Any
from uuid import uuid4

from fastapi.testclient import TestClient

from haui_compass.api.demo import create_demo_app


def scope(ctx: dict[str, Any]) -> dict[str, str]:
    return {
        "student_provider": ctx["student"]["provider"],
        "student_id": ctx["student"]["id"],
        "period_start": ctx["period"]["start"],
        "period_end": ctx["period"]["end"],
    }


def at(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def context(client: TestClient) -> dict[str, Any]:
    response = client.get("/api/v1/demo/context")
    assert response.status_code == 200, response.text
    return response.json()  # type: ignore[no-any-return]


def history(client: TestClient, ctx: dict[str, Any]) -> list[dict[str, Any]]:
    response = client.get("/api/v1/weekly-plans/history", params=scope(ctx))
    assert response.status_code == 200, response.text
    return response.json()  # type: ignore[no-any-return]


def advance(client: TestClient, to: str = "next_day") -> dict[str, Any]:
    response = client.post("/api/v1/demo/clock/advance", json={"to": to})
    assert response.status_code == 200, response.text
    return response.json()  # type: ignore[no-any-return]


def remaining(ctx: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {"task_id": t["id"], "remaining_duration_seconds": t["estimated_duration_seconds"]}
        for t in ctx["tasks"]
        if t["status"] != "completed"
    ]


def test_student_completes_a_week_and_next_plan_uses_reflection() -> None:
    with TestClient(create_demo_app()) as client:
        # PLAN — Canvas-like courses/assignments/deadlines, no plan yet.
        ctx = context(client)
        assert ctx["scenario_id"] == "week"
        assert ctx["student"]["provider"] == "mock-canvas"
        assert len(ctx["assignments"]) == 5
        assert history(client, ctx) == []
        draft = client.get("/api/v1/weekly-goals/draft", params=scope(ctx)).json()
        assert draft["saved"] is False and draft["adjustments"] == []

        # AI-assisted breakdown of the large project still requires explicit confirmation.
        project = next(a for a in ctx["assignments"] if a["existing_task_count"] == 0)
        session_id = str(uuid4())
        proposal = client.post(
            "/api/v1/task-decompositions",
            json={
                "session_id": session_id,
                "student": ctx["student"],
                "assignment": {"provider": project["provider"], "id": project["external_id"]},
            },
        ).json()
        assert proposal["source"] == "demo_fallback" and proposal["candidates"]
        first = proposal["candidates"][0]
        confirmed = client.post(
            f"/api/v1/task-decompositions/{session_id}/confirm",
            json={
                "student": ctx["student"],
                "selection": [
                    {
                        "candidate_id": first["id"],
                        "title": "Phân tích yêu cầu đồ án",
                        "estimated_duration_minutes": 60,
                    }
                ],
            },
        )
        assert confirmed.status_code == 200, confirmed.text
        ctx = context(client)
        assert len(ctx["tasks"]) == 6

        # Preview never writes; editing free time changes the proposal.
        body = {"student": ctx["student"], "period": ctx["period"]}
        full = client.post(
            "/api/v1/weekly-plans/preview", json={**body, "study_windows": ctx["study_windows"]}
        ).json()
        assert full["plan"]["blocks"] and full["assignment_risks"]
        edited_windows = ctx["study_windows"][:-1]
        edited = client.post(
            "/api/v1/weekly-plans/preview", json={**body, "study_windows": edited_windows}
        ).json()
        assert edited["plan"]["blocks"] != full["plan"]["blocks"]
        assert history(client, ctx) == []

        approved = client.post(
            "/api/v1/weekly-plans/approve",
            json={
                **body,
                "study_windows": ctx["study_windows"],
                "goal_text": "Nộp bài CSDL và Lab 2 đúng hạn",
                "target_minutes": 420,
                "record_id": str(uuid4()),
            },
        )
        assert approved.status_code == 200, approved.text
        assert approved.json()["blocks"] == full["plan"]["blocks"]
        assert len(history(client, ctx)) == 1
        again = client.post(
            "/api/v1/weekly-plans/approve",
            json={**body, "study_windows": ctx["study_windows"], "record_id": str(uuid4())},
        )
        assert again.status_code == 409
        assert client.get("/api/v1/weekly-goals/draft", params=scope(ctx)).json()["saved"]

        # DO — record today's work; the task completes and the review sees actual time.
        rec = client.post(
            "/api/v1/daily-recommendation",
            json={
                "student": ctx["student"],
                "available_minutes": ctx["available_minutes"],
                "assignment_capacities": ctx["assignment_capacities"],
            },
        ).json()
        task_id = rec["recommendation"]["task_id"]
        now = at(ctx["now"])
        done = client.post(
            "/api/v1/task-executions",
            json={
                "student": ctx["student"],
                "record_id": str(uuid4()),
                "task_id": task_id,
                "started_at": (now - timedelta(minutes=80)).isoformat(),
                "ended_at": now.isoformat(),
                "outcome": "completed",
            },
        )
        assert done.status_code == 200 and done.json()["task_status"] == "completed"

        # ADAPT — two days pass, a scheduled task was never started, and Wednesday is busy.
        advance(client)
        ctx = advance(client)
        assert at(ctx["now"]) - now == timedelta(days=2)
        plan = history(client, ctx)[-1]
        missed = {
            b["task_id"]
            for b in plan["blocks"]
            if at(b["ends_at"]) <= at(ctx["now"])
            and next(t for t in ctx["tasks"] if t["id"] == b["task_id"])["status"] == "not_started"
        }
        assert missed
        busy_day = at(ctx["now"]).date()
        free = [w for w in ctx["study_windows"] if at(w["starts_at"]).date() != busy_day]
        assert len(free) == len(ctx["study_windows"]) - 1
        adapt_body = {**body, "study_windows": free, "remaining_efforts": remaining(ctx)}
        preview = client.post("/api/v1/weekly-plans/adapt/preview", json=adapt_body)
        assert preview.status_code == 200, preview.text
        proposal = preview.json()
        assert proposal["baseline_revision"] == 1 and proposal["changes"]
        assert len(proposal["risks_before"]) == len(proposal["risks_after"])
        assert len(history(client, ctx)) == 1  # nothing applied before confirmation
        record_id = str(uuid4())
        applied = client.post(
            "/api/v1/weekly-plans/adapt", json={**adapt_body, "record_id": record_id}
        )
        assert applied.status_code == 200, applied.text
        assert applied.json()["plan"]["blocks"] == proposal["plan"]["blocks"]
        retry = client.post(
            "/api/v1/weekly-plans/adapt", json={**adapt_body, "record_id": record_id}
        )
        assert retry.json()["plan"]["revision"] == 2
        ctx = context(client)
        assert len(ctx["study_windows"]) == len(free)  # busy time stays removed

        # REFLECT — end of week review, AI support with offline fallback, confirmed reflection.
        for _ in range(4):
            ctx = advance(client)
        review = client.get("/api/v1/weekly-reviews", params=scope(ctx))
        assert review.status_code == 200, review.text
        summary = review.json()
        assert summary["goal"]["goal_text"] == "Nộp bài CSDL và Lab 2 đúng hạn"
        assert summary["actual_seconds"] == 80 * 60
        assert summary["plan_revisions"] == 2
        assert "completed_tasks" in summary["strengths"]
        assert {"missed_sessions", "underestimated"} <= set(summary["weaknesses"])
        assert summary["coaching"]["source"] == "template"
        assert summary["coaching"]["questions"]
        assert any(d["state"] == "missed" for d in summary["deadlines"])
        deferred = next(iter(missed))
        reflection = {
            "student": ctx["student"],
            "period": ctx["period"],
            "responses": {
                "reflected_task_ids": [task_id],
                "workload_feedback": "too_heavy",
                "difficult_topics": ["Chuẩn hoá 3NF"],
                "deferred_task_ids": [deferred],
            },
        }
        candidates = client.post("/api/v1/reflections/candidates", json=reflection).json()
        ids = [c["id"] for c in candidates["candidates"]]
        assert len(ids) == 4
        saved = client.post(
            "/api/v1/reflections/confirm",
            json={**reflection, "record_id": str(uuid4()), "selected_signal_ids": ids},
        )
        assert saved.status_code == 200, saved.text

        # NEXT WEEK — the draft carries reflection-based, explainable adjustments.
        week_one = ctx["period"]
        ctx = advance(client, "next_week")
        assert at(ctx["period"]["start"]) - at(week_one["start"]) == timedelta(days=7)
        assert history(client, ctx) == []
        draft = client.get("/api/v1/weekly-goals/draft", params=scope(ctx)).json()
        codes = {item["code"]: item for item in draft["adjustments"]}
        assert {
            "carry_over",
            "workload_too_heavy",
            "underestimated",
            "deferred_first",
            "difficult_topic",
        } <= set(codes)
        assert draft["target_minutes"] == 330  # 420 reduced by 20 %, rounded to 15 minutes
        assert codes["deferred_first"]["task_ids"] == [deferred]
        assert len(draft["study_windows"]) == len(free)
        assert all(at(w["starts_at"]) >= at(ctx["period"]["start"]) for w in draft["study_windows"])
        next_plan = client.post(
            "/api/v1/weekly-plans/approve",
            json={
                "student": ctx["student"],
                "period": ctx["period"],
                "study_windows": draft["study_windows"],
                "goal_text": "Hoàn thành báo cáo đánh giá mô hình",
                "target_minutes": draft["target_minutes"],
                "record_id": str(uuid4()),
            },
        )
        assert next_plan.status_code == 200, next_plan.text
        assert next_plan.json()["blocks"]
        weeks = client.get(
            "/api/v1/weekly-history",
            params={
                "student_provider": ctx["student"]["provider"],
                "student_id": ctx["student"]["id"],
            },
        ).json()["weeks"]
        assert [w["period"]["start"] for w in weeks] == [ctx["period"]["start"], week_one["start"]]
        assert len(weeks[1]["reflections"]) == 1
        assert weeks[1]["reflections"][0]["signals"]


def test_clock_advance_is_demo_only() -> None:
    from haui_compass.api.main import create_app

    with TestClient(create_app()) as client:
        assert client.post("/api/v1/demo/clock/advance", json={"to": "next_day"}).status_code == 404

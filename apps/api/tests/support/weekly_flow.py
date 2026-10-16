"""One student's full week over HTTP: Plan → Do → Adapt → Reflect → next week's plan.

Shared by the per-account simulated-workspace suites (in-memory and PostgreSQL). The client is
expected to carry that account's identity headers already.
"""

from datetime import datetime, timedelta
from typing import Any
from uuid import uuid4

from fastapi.testclient import TestClient


def at(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def scope(ctx: dict[str, Any]) -> dict[str, str]:
    return {
        "student_provider": ctx["student"]["provider"],
        "student_id": ctx["student"]["id"],
        "period_start": ctx["period"]["start"],
        "period_end": ctx["period"]["end"],
    }


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


def decompose_project(
    generate: TestClient, confirm: TestClient, ctx: dict[str, Any]
) -> dict[str, Any]:
    """AI-assisted breakdown; ``generate`` and ``confirm`` may be different API instances."""
    project = next(a for a in ctx["assignments"] if a["existing_task_count"] == 0)
    session_id = str(uuid4())
    proposal = generate.post(
        "/api/v1/task-decompositions",
        json={
            "session_id": session_id,
            "student": ctx["student"],
            "assignment": {"provider": project["provider"], "id": project["external_id"]},
        },
    )
    assert proposal.status_code == 200, proposal.text
    first = proposal.json()["candidates"][0]
    confirmed = confirm.post(
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
    return confirmed.json()  # type: ignore[no-any-return]


def plan_week(client: TestClient, goal: str = "Nộp bài CSDL và Lab 2 đúng hạn") -> dict[str, Any]:
    """PLAN: preview never writes; approval stores the goal and revision 1."""
    ctx = context(client)
    body = {"student": ctx["student"], "period": ctx["period"]}
    preview = client.post(
        "/api/v1/weekly-plans/preview", json={**body, "study_windows": ctx["study_windows"]}
    )
    assert preview.status_code == 200, preview.text
    assert preview.json()["plan"]["blocks"] and preview.json()["assignment_risks"]
    assert history(client, ctx) == []
    approved = client.post(
        "/api/v1/weekly-plans/approve",
        json={
            **body,
            "study_windows": ctx["study_windows"],
            "goal_text": goal,
            "target_minutes": 420,
            "record_id": str(uuid4()),
        },
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["blocks"] == preview.json()["plan"]["blocks"]
    return ctx


def complete_week(client: TestClient, confirm: TestClient | None = None) -> dict[str, Any]:
    """Run the whole cycle for the client's account and return the next week's context."""
    ctx = context(client)
    assert len(ctx["assignments"]) == 5
    assert history(client, ctx) == []
    decompose_project(client, confirm or client, ctx)
    assert len(context(client)["tasks"]) == 6
    ctx = plan_week(client)
    body = {"student": ctx["student"], "period": ctx["period"]}

    # DO — today's recommended task, completed with student-reported minutes.
    rec = client.post(
        "/api/v1/daily-recommendation",
        json={
            "student": ctx["student"],
            "available_minutes": ctx["available_minutes"],
            "assignment_capacities": ctx["assignment_capacities"],
        },
    )
    assert rec.status_code == 200, rec.text
    task_id = rec.json()["recommendation"]["task_id"]
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
    assert done.status_code == 200 and done.json()["task_status"] == "completed", done.text

    # ADAPT — two days later a session was missed and one day becomes busy.
    advance(client)
    ctx = advance(client)
    assert at(ctx["now"]) - now == timedelta(days=2)
    busy_day = at(ctx["now"]).date()
    free = [w for w in ctx["study_windows"] if at(w["starts_at"]).date() != busy_day]
    adapt_body = {**body, "study_windows": free, "remaining_efforts": remaining(ctx)}
    preview = client.post("/api/v1/weekly-plans/adapt/preview", json=adapt_body)
    assert preview.status_code == 200, preview.text
    assert preview.json()["baseline_revision"] == 1
    assert len(history(client, ctx)) == 1
    applied = client.post(
        "/api/v1/weekly-plans/adapt", json={**adapt_body, "record_id": str(uuid4())}
    )
    assert applied.status_code == 200, applied.text
    assert applied.json()["plan"]["revision"] == 2

    # REFLECT — end-of-week review, then an explicitly confirmed reflection.
    for _ in range(4):
        ctx = advance(client)
    review = client.get("/api/v1/weekly-reviews", params=scope(ctx))
    assert review.status_code == 200, review.text
    assert review.json()["actual_seconds"] == 80 * 60
    assert review.json()["plan_revisions"] == 2
    reflection = {
        "student": ctx["student"],
        "period": ctx["period"],
        "responses": {
            "reflected_task_ids": [task_id],
            "workload_feedback": "too_heavy",
            "difficult_topics": ["Chuẩn hoá 3NF"],
            "deferred_task_ids": [],
        },
    }
    candidates = client.post("/api/v1/reflections/candidates", json=reflection)
    assert candidates.status_code == 200, candidates.text
    ids = [c["id"] for c in candidates.json()["candidates"]]
    saved = client.post(
        "/api/v1/reflections/confirm",
        json={**reflection, "record_id": str(uuid4()), "selected_signal_ids": ids},
    )
    assert saved.status_code == 200, saved.text

    # NEXT WEEK — the draft carries explainable reflection-based adjustments.
    week_one = ctx["period"]
    ctx = advance(client, "next_week")
    assert at(ctx["period"]["start"]) - at(week_one["start"]) == timedelta(days=7)
    draft = client.get("/api/v1/weekly-goals/draft", params=scope(ctx))
    assert draft.status_code == 200, draft.text
    codes = {item["code"] for item in draft.json()["adjustments"]}
    assert {"carry_over", "workload_too_heavy", "difficult_topic"} <= codes
    assert draft.json()["target_minutes"] == 330
    next_plan = client.post(
        "/api/v1/weekly-plans/approve",
        json={
            "student": ctx["student"],
            "period": ctx["period"],
            "study_windows": draft.json()["study_windows"],
            "goal_text": "Hoàn thành báo cáo đánh giá mô hình",
            "target_minutes": draft.json()["target_minutes"],
            "record_id": str(uuid4()),
        },
    )
    assert next_plan.status_code == 200, next_plan.text
    return ctx

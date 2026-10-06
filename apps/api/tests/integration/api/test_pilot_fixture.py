from datetime import datetime
from uuid import UUID, uuid4

from fastapi.testclient import TestClient

from haui_compass.api.pilot_fixture import create_pilot_fixture_app


def test_reset_and_t2_creation() -> None:
    with TestClient(create_pilot_fixture_app()) as c:
        before = c.post("/api/v1/pilot-fixture/reset").json()
        again = c.post("/api/v1/pilot-fixture/reset").json()
        assert (
            before == again
            and before["courses"] == 4
            and before["assignments"] == 5
            and len(before["tasks"]) == 4
        )
        academic = c.get("/api/v1/academic-data?source=manual&student_external_id=pilot-student")
        assert academic.status_code == 200, academic.text
        assert academic.json()["source"] == "manual"
        assert academic.json()["courses"] == 4
        assert academic.json()["assignments"] == 5
        assert any(
            item["title"] == "Reading response" and item["course_external_id"] == "academic-skills"
            for item in academic.json()["assignments_data"]
        )
        assert not any(x["title"] == "Summarise two articles" for x in before["tasks"])
        assert (
            sum(
                (
                    datetime.fromisoformat(w["ends_at"]) - datetime.fromisoformat(w["starts_at"])
                ).total_seconds()
                for w in before["study_windows"]
            )
            == 18000
        )
        task_id = str(UUID(int=99))
        result = c.post(
            "/api/v1/tasks",
            json={
                "student": before["student"],
                "assignment": {"provider": "manual", "id": "reading-response"},
                "task_id": task_id,
                "title": "Summarise two articles",
                "estimated_effort_minutes": 45,
            },
        )
        assert result.status_code == 200 and result.json()["status"] == "not_started"
        after = c.get("/api/v1/demo/context").json()
        created = [x for x in after["tasks"] if x["title"] == "Summarise two articles"]
        assert len(after["tasks"]) == 5 and len(created) == 1
        assert created[0]["assignment_title"] == "Reading response"
        assert created[0]["estimated_duration_seconds"] == 2700
        assert created[0]["status"] == "not_started"


def test_canonical_engine_flow() -> None:
    with TestClient(create_pilot_fixture_app()) as c:
        ctx = c.post("/api/v1/pilot-fixture/reset").json()
        reading = str(UUID(int=99))
        assert (
            c.post(
                "/api/v1/tasks",
                json={
                    "student": ctx["student"],
                    "assignment": {"provider": "manual", "id": "reading-response"},
                    "task_id": reading,
                    "title": "Summarise two articles",
                    "estimated_effort_minutes": 45,
                },
            ).status_code
            == 200
        )
        ctx = c.get("/api/v1/demo/context").json()
        ids = {x["title"]: x["id"] for x in ctx["tasks"]}
        caps = [
            {
                "assignment_id": x["assignment_id"],
                "available_minutes": 60 if x["title"] == "Solve graph exercises" else 100,
            }
            for x in ctx["tasks"]
        ]
        rec = c.post(
            "/api/v1/daily-recommendation",
            json={
                "student": ctx["student"],
                "available_minutes": 300,
                "assignment_capacities": caps,
            },
        )
        assert rec.status_code == 200, rec.text
        body = rec.json()
        assert body["recommendation"]["task_id"] == ids["Solve graph exercises"]
        assert body["recommendation"]["reason_codes"] == ["high_assignment_risk"]
        assert body["recommendation"]["evidence"]["risk_level"] == "high"
        assert body["recommendation"]["evidence"]["risk_reason_codes"] == [
            "effort_exceeds_capacity"
        ]
        assert body["recommendation"]["evidence"]["deciding_dimension"] == "risk"
        risks = {x["assignment_id"]: x for x in body["assignment_risks"]}
        assert {x["level"] for x in risks.values()} == {"high", "medium", "low"}
        plan = c.post(
            "/api/v1/weekly-plans",
            json={
                "student": ctx["student"],
                "record_id": str(uuid4()),
                "period": ctx["period"],
                "study_windows": ctx["study_windows"],
            },
        )
        assert plan.status_code == 200, plan.text
        p = plan.json()
        assert p["revision"] == 1
        assert [b["task_id"] for b in p["blocks"]] == [
            ids["Review regularisation notes"],
            ids["Solve graph exercises"],
            ids["Draft ER diagram"],
            reading,
            ids["Write project outline"],
        ]
        assert all(x["reason"] == "insufficient_capacity" for x in p["unplanned_tasks"])
        execution = c.post(
            "/api/v1/task-executions",
            json={
                "student": ctx["student"],
                "record_id": str(uuid4()),
                "task_id": ids["Solve graph exercises"],
                "started_at": "2026-10-05T01:15:00+00:00",
                "ended_at": "2026-10-05T02:00:00+00:00",
                "outcome": "partial",
            },
        )
        assert execution.status_code == 200, execution.text
        reflection = {
            "student": ctx["student"],
            "period": ctx["period"],
            "responses": {
                "reflected_task_ids": [ids["Solve graph exercises"]],
                "workload_feedback": "too_heavy",
            },
        }
        candidates = c.post("/api/v1/reflections/candidates", json=reflection)
        assert candidates.status_code == 200, candidates.text
        selected = [x["id"] for x in candidates.json()["candidates"]]
        confirmed = c.post(
            "/api/v1/reflections/confirm",
            json={**reflection, "record_id": str(uuid4()), "selected_signal_ids": selected},
        )
        assert confirmed.status_code == 200, confirmed.text
        replan = c.post(
            "/api/v1/weekly-plans/replan",
            json={
                "student": ctx["student"],
                "record_id": str(uuid4()),
                "period": ctx["period"],
                "study_windows": [x for i, x in enumerate(ctx["study_windows"]) if i != 1],
                "effective_at": "2026-10-05T02:00:00+00:00",
                "remaining_efforts": [
                    {
                        "task_id": x["id"],
                        "remaining_duration_seconds": x["estimated_duration_seconds"],
                    }
                    for x in ctx["tasks"]
                ],
            },
        )
        assert replan.status_code == 200, replan.text
        assert replan.json()["plan"]["revision"] == 2

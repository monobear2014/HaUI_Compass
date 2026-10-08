"""Real HTTP showcase contract, including execute → reflect → replan → history."""

from datetime import datetime, timedelta
from typing import Any, cast
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from haui_compass.api.demo import create_demo_app
from haui_compass.api.main import create_app
from haui_compass.domain.students.ids import StudentId
from haui_compass.domain.tasks.task import TaskId


def select(client: TestClient, name: str) -> dict[str, Any]:
    response = client.post("/api/v1/demo/scenarios/select", json={"scenario_id": name})
    assert response.status_code == 200, response.text
    return response.json()  # type: ignore[no-any-return]


def history(client: TestClient, ctx: dict[str, Any]) -> list[dict[str, Any]]:
    response = client.get(
        "/api/v1/weekly-plans/history",
        params={
            "student_provider": ctx["student"]["provider"],
            "student_id": ctx["student"]["id"],
            "period_start": ctx["period"]["start"],
            "period_end": ctx["period"]["end"],
        },
    )
    assert response.status_code == 200, response.text
    return response.json()  # type: ignore[no-any-return]


@pytest.mark.parametrize("name", ["normal", "crunch", "disrupted"])
def test_seed_is_reproducible_and_engines_compute_expected_outcomes(name: str) -> None:
    with TestClient(create_demo_app()) as client:
        ctx = select(client, name)
        assert len({t["course"] for t in ctx["tasks"]}) == 3
        assert len(ctx["tasks"]) == 4
        response = client.post(
            "/api/v1/daily-recommendation",
            json={
                "student": ctx["student"],
                "available_minutes": ctx["available_minutes"],
                "assignment_capacities": ctx["assignment_capacities"],
            },
        )
        assert response.status_code == 200, response.text
        rec = response.json()
        assert rec["explanation"]["source"] == "template"
        assert rec["explanation"]["fallback_reason"] == "not_configured"
        plan = history(client, ctx)[0]
        if name == "crunch":
            assert {r["level"] for r in rec["assignment_risks"]} == {"high", "medium", "low"}
            assert rec["recommendation"]["task_id"] == ctx["tasks"][0]["id"]
            assert rec["recommendation"]["evidence"]["deciding_dimension"] == "risk"
            assert "150 phút" in rec["explanation"]["text"]
            assert "60 phút" in rec["explanation"]["text"]
            assert sum(t["remaining_duration_seconds"] for t in plan["unplanned_tasks"]) == 195 * 60
        else:
            assert plan["unplanned_tasks"] == []
            assert {r["level"] for r in rec["assignment_risks"]} == {"low"}
        repeat = select(client, name)
        assert repeat.pop("generation") == ctx.pop("generation") + 1
        assert repeat == ctx
        assert history(client, repeat) == [plan]


def test_disruption_history_and_reset_isolate_all_learning_loop_state() -> None:
    with TestClient(create_demo_app()) as client:
        ctx = select(client, "disrupted")
        baseline = history(client, ctx)[0]
        now = datetime.fromisoformat(ctx["now"])
        first, second, _, _ = ctx["tasks"]
        for task, duration, end_offset, outcome in (
            (first, 25, 95, "completed"),
            (second, 90, 0, "partial"),
        ):
            end = now - timedelta(minutes=end_offset)
            response = client.post(
                "/api/v1/task-executions",
                json={
                    "student": ctx["student"],
                    "task_id": task["id"],
                    "record_id": str(uuid4()),
                    "started_at": (end - timedelta(minutes=duration)).isoformat(),
                    "ended_at": end.isoformat(),
                    "outcome": outcome,
                },
            )
            assert response.status_code == 200, response.text
        current = client.get("/api/v1/demo/context").json()
        assert current["tasks"][0]["status"] == "completed"
        assert current["tasks"][1]["estimated_duration_seconds"] == 60 * 60
        reflection = {
            "student": ctx["student"],
            "period": ctx["period"],
            "responses": {
                "reflected_task_ids": [second["id"]],
                "workload_feedback": "too_heavy",
                "difficult_topics": ["Regression assumptions"],
            },
        }
        candidates = client.post("/api/v1/reflections/candidates", json=reflection).json()[
            "candidates"
        ]
        estimate = next(c for c in candidates if c["kind"] == "estimation_feedback")
        assert estimate["actual_duration_seconds"] == 90 * 60
        assert estimate["estimated_duration_seconds"] == 60 * 60
        confirmed = client.post(
            "/api/v1/reflections/confirm",
            json={
                **reflection,
                "record_id": str(uuid4()),
                "selected_signal_ids": [c["id"] for c in candidates],
            },
        )
        assert confirmed.status_code == 200, confirmed.text
        response = client.post(
            "/api/v1/weekly-plans/replan",
            json={
                "student": ctx["student"],
                "period": ctx["period"],
                "record_id": str(uuid4()),
                "effective_at": ctx["now"],
                "study_windows": [ctx["study_windows"][0], ctx["study_windows"][2]],
                "remaining_efforts": [
                    {
                        "task_id": t["id"],
                        "remaining_duration_seconds": 90 * 60
                        if t["id"] == second["id"]
                        else t["estimated_duration_seconds"],
                    }
                    for t in current["tasks"]
                    if t["status"] != "completed"
                ],
            },
        )
        assert response.status_code == 200, response.text
        result = response.json()
        assert result["plan"]["revision"] == 2
        assert result["plan"]["parent_record_id"] == baseline["record_id"]
        assert result["informational_reflection_signals"]
        assert any(b in result["plan"]["blocks"] for b in baseline["blocks"])
        assert any(b not in result["plan"]["blocks"] for b in baseline["blocks"])
        assert not any(b["task_id"] == first["id"] for b in result["plan"]["blocks"])
        reasons = {r for c in result["changes"] for r in c["reasons"]}
        assert {"task_completed", "remaining_effort_changed", "study_window_changed"} <= reasons
        assert history(client, ctx) == [baseline, result["plan"]]
        select(client, "normal")
        assert history(client, ctx) == []
        reset = select(client, "disrupted")
        assert history(client, reset) == [baseline]
        assert all(t["status"] == "not_started" for t in reset["tasks"])
        # No execution or confirmation survives the container replacement.
        new_candidates = client.post("/api/v1/reflections/candidates", json=reflection).json()[
            "candidates"
        ]
        assert all(c["kind"] != "estimation_feedback" for c in new_candidates)
        session = cast(FastAPI, client.app).state.demo
        assert (
            session.container.reflection_repository.list_for_student(baseline_student_id(reset))
            == ()
        )


def baseline_student_id(ctx: dict[str, Any]) -> StudentId:
    from haui_compass.application.lms_mapping import student_id_for
    from haui_compass.application.ports.lms import ExternalRef

    return student_id_for(ExternalRef(**ctx["student"]))


def test_reset_is_opt_in_validated_and_app_instances_are_isolated() -> None:
    with TestClient(create_app()) as normal:
        assert normal.get("/api/v1/demo/scenarios").status_code == 404
        assert (
            normal.post("/api/v1/demo/scenarios/select", json={"scenario_id": "normal"}).status_code
            == 404
        )
    with TestClient(create_demo_app()) as one, TestClient(create_demo_app()) as two:
        initial = one.get("/api/v1/demo/context").json()
        assert (
            one.post("/api/v1/demo/scenarios/select", json={"scenario_id": "invalid"}).status_code
            == 422
        )
        assert one.get("/api/v1/demo/context").json() == initial
        select(one, "normal")
        assert two.get("/api/v1/demo/context").json() == initial


def test_decomposition_requires_confirmation_then_enters_deterministic_loop() -> None:
    with TestClient(create_demo_app()) as client:
        ctx = select(client, "normal")
        assignment = next(
            row for row in ctx["assignments"] if row["title"] == "Database Mini Project"
        )
        before_ids = {task["id"] for task in ctx["tasks"]}
        session_id = str(uuid4())
        generated = client.post(
            "/api/v1/task-decompositions",
            json={
                "session_id": session_id,
                "student": ctx["student"],
                "assignment": {
                    "provider": assignment["provider"],
                    "id": assignment["external_id"],
                },
            },
        )
        assert generated.status_code == 200, generated.text
        candidates = generated.json()["candidates"]
        assert len(candidates) == 4
        assert generated.json()["source"] == "demo_fallback"
        assert generated.json()["fallback_reason"] == "not_configured"
        assert {task["id"] for task in client.get("/api/v1/demo/context").json()["tasks"]} == (
            before_ids
        )

        confirmed = client.post(
            f"/api/v1/task-decompositions/{session_id}/confirm",
            json={
                "student": ctx["student"],
                "selection": [
                    {
                        "candidate_id": candidates[0]["id"],
                        "title": "Clarify mini-project rubric",
                        "estimated_duration_minutes": 40,
                    },
                    {
                        "candidate_id": candidates[2]["id"],
                        "title": "Implement schema migration increment",
                        "estimated_duration_minutes": 50,
                    },
                ],
            },
        )
        assert confirmed.status_code == 200, confirmed.text
        created = confirmed.json()["created_tasks"]
        assert [(row["title"], row["estimated_duration_minutes"]) for row in created] == [
            ("Clarify mini-project rubric", 40),
            ("Implement schema migration increment", 50),
        ]
        current = client.get("/api/v1/demo/context").json()
        assert len(current["tasks"]) == len(ctx["tasks"]) + 2
        assert candidates[1]["id"] not in {task["id"] for task in current["tasks"]}

        recommendation = client.post(
            "/api/v1/daily-recommendation",
            json={
                "student": current["student"],
                "available_minutes": current["available_minutes"],
                "assignment_capacities": current["assignment_capacities"],
            },
        )
        assert recommendation.status_code == 200, recommendation.text
        assert recommendation.json()["recommendation"]["task_id"] in {row["id"] for row in created}

        replanned = client.post(
            "/api/v1/weekly-plans/replan",
            json={
                "student": current["student"],
                "record_id": str(uuid4()),
                "period": current["period"],
                "study_windows": current["study_windows"],
                "effective_at": current["now"],
                "remaining_efforts": [
                    {
                        "task_id": task["id"],
                        "remaining_duration_seconds": task["estimated_duration_seconds"],
                    }
                    for task in current["tasks"]
                ],
            },
        )
        assert replanned.status_code == 200, replanned.text
        planned_ids = {block["task_id"] for block in replanned.json()["plan"]["blocks"]}
        assert {row["id"] for row in created} <= planned_ids


def test_scenario_reset_discards_unconfirmed_candidate_session() -> None:
    with TestClient(create_demo_app()) as client:
        ctx = select(client, "normal")
        assignment = next(
            row for row in ctx["assignments"] if row["title"] == "Database Mini Project"
        )
        session_id = str(uuid4())
        generated = client.post(
            "/api/v1/task-decompositions",
            json={
                "session_id": session_id,
                "student": ctx["student"],
                "assignment": {
                    "provider": assignment["provider"],
                    "id": assignment["external_id"],
                },
            },
        ).json()
        reset = select(client, "normal")
        response = client.post(
            f"/api/v1/task-decompositions/{session_id}/confirm",
            json={
                "student": reset["student"],
                "selection": [
                    {
                        "candidate_id": generated["candidates"][0]["id"],
                        "title": "Should never be persisted",
                        "estimated_duration_minutes": 30,
                    }
                ],
            },
        )
        assert response.status_code == 404
        assert all(task["title"] != "Should never be persisted" for task in reset["tasks"])


def test_golden_flow_reset_clears_confirmed_decomposition_and_learning_loop_mutations() -> None:
    """One reset replaces candidate, task, execution, reflection and plan state together."""
    with TestClient(create_demo_app()) as client:
        baseline = select(client, "normal")
        baseline_history = history(client, baseline)
        assignment = next(
            row for row in baseline["assignments"] if row["title"] == "Database Mini Project"
        )
        session_id = str(uuid4())
        generated = client.post(
            "/api/v1/task-decompositions",
            json={
                "session_id": session_id,
                "student": baseline["student"],
                "assignment": {
                    "provider": assignment["provider"],
                    "id": assignment["external_id"],
                },
            },
        ).json()
        selected = generated["candidates"][:2]
        confirmed = client.post(
            f"/api/v1/task-decompositions/{session_id}/confirm",
            json={
                "student": baseline["student"],
                "selection": [
                    {
                        "candidate_id": row["id"],
                        "title": f"Council confirmed step {index}",
                        "estimated_duration_minutes": 30,
                    }
                    for index, row in enumerate(selected, start=1)
                ],
            },
        )
        assert confirmed.status_code == 200, confirmed.text

        task = baseline["tasks"][0]
        now = datetime.fromisoformat(baseline["now"])
        execution = client.post(
            "/api/v1/task-executions",
            json={
                "student": baseline["student"],
                "task_id": task["id"],
                "record_id": str(uuid4()),
                "started_at": (now - timedelta(minutes=30)).isoformat(),
                "ended_at": now.isoformat(),
                "outcome": "partial",
            },
        )
        assert execution.status_code == 200, execution.text
        reflection_request = {
            "student": baseline["student"],
            "period": baseline["period"],
            "responses": {
                "reflected_task_ids": [task["id"]],
                "workload_feedback": "too_heavy",
                "difficult_topics": ["Fictional normalization"],
            },
        }
        candidates = client.post("/api/v1/reflections/candidates", json=reflection_request).json()[
            "candidates"
        ]
        saved = client.post(
            "/api/v1/reflections/confirm",
            json={
                **reflection_request,
                "record_id": str(uuid4()),
                "selected_signal_ids": [row["id"] for row in candidates],
            },
        )
        assert saved.status_code == 200, saved.text
        mutated = client.get("/api/v1/demo/context").json()
        revised = client.post(
            "/api/v1/weekly-plans/replan",
            json={
                "student": mutated["student"],
                "record_id": str(uuid4()),
                "period": mutated["period"],
                "study_windows": mutated["study_windows"],
                "effective_at": mutated["now"],
                "remaining_efforts": [
                    {
                        "task_id": row["id"],
                        "remaining_duration_seconds": row["estimated_duration_seconds"],
                    }
                    for row in mutated["tasks"]
                ],
            },
        )
        assert revised.status_code == 200, revised.text
        assert len(mutated["tasks"]) == len(baseline["tasks"]) + 2
        assert len(history(client, baseline)) == 2

        reset = select(client, "normal")
        reset_without_generation = dict(reset)
        baseline_without_generation = dict(baseline)
        reset_without_generation.pop("generation")
        baseline_without_generation.pop("generation")
        assert reset_without_generation == baseline_without_generation
        assert history(client, reset) == baseline_history
        stale_confirmation = client.post(
            f"/api/v1/task-decompositions/{session_id}/confirm",
            json={
                "student": reset["student"],
                "selection": [
                    {
                        "candidate_id": selected[0]["id"],
                        "title": "Must not survive reset",
                        "estimated_duration_minutes": 30,
                    }
                ],
            },
        )
        assert stale_confirmation.status_code == 404
        session = cast(FastAPI, client.app).state.demo
        student_id = baseline_student_id(reset)
        assert (
            session.container.execution_repository.list_for_task(
                student_id, TaskId(UUID(reset["tasks"][0]["id"]))
            )
            == ()
        )
        assert session.container.reflection_repository.list_for_student(student_id) == ()

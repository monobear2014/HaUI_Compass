"""Per-account simulated workspaces: access control, A/B isolation, reset and virtual clocks."""

import os
import subprocess
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from haui_compass.api.dependencies import build_container
from haui_compass.api.simulated_workspaces import create_simulated_workspace_app
from haui_compass.infrastructure.demo.simulated_workspaces import (
    SimulatedCanvasLMSProvider,
    SimulatedWorkspaces,
    WorkspaceClock,
    monday_anchor,
)
from haui_compass.infrastructure.persistence.memory.simulated_workspaces import (
    InMemorySimulatedWorkspaceRepository,
)
from support.clocks import FixedClock
from support.weekly_flow import advance, complete_week, context, history, plan_week, scope

KEY = "test-service-key"
# Thursday 15:30 in Hanoi: the fixture still starts on that week's Monday 09:00.
REAL_NOW = datetime(2026, 10, 15, 8, 30, tzinfo=UTC)
MONDAY_0900_HANOI = datetime(2026, 10, 12, 2, 0, tzinfo=UTC)


def make_app(real_clock: FixedClock | None = None) -> FastAPI:
    real = real_clock or FixedClock(REAL_NOW)
    container = build_container(lms=SimulatedCanvasLMSProvider(), clock=WorkspaceClock(real))
    workspaces = SimulatedWorkspaces(
        repository=InMemorySimulatedWorkspaceRepository(),
        tasks=container.task_repository,
        transaction_manager=container.transaction_manager,
        clock=real,
    )
    return create_simulated_workspace_app(
        container=container, workspaces=workspaces, service_key=KEY
    )


def as_user(app: FastAPI, owner: str) -> TestClient:
    return TestClient(app, headers={"X-Compass-Service-Key": KEY, "X-Compass-User": owner})


def test_monday_anchor_is_the_hanoi_week_start() -> None:
    assert monday_anchor(REAL_NOW) == MONDAY_0900_HANOI
    # Sunday 23:00 Hanoi still belongs to the week that started six days earlier.
    assert monday_anchor(datetime(2026, 10, 18, 16, 0, tzinfo=UTC)) == MONDAY_0900_HANOI
    # Monday 01:00 Hanoi (Sunday 18:00 UTC) starts a new week.
    assert monday_anchor(datetime(2026, 10, 18, 18, 0, tzinfo=UTC)) == datetime(
        2026, 10, 19, 2, 0, tzinfo=UTC
    )


def test_learning_routes_require_the_service_key_and_an_account() -> None:
    app = make_app()
    anonymous = TestClient(app)
    assert anonymous.get("/api/v1/health").status_code == 200
    assert anonymous.get("/api/v1/demo/context").status_code == 403
    wrong = TestClient(app, headers={"X-Compass-Service-Key": "nope", "X-Compass-User": "a"})
    assert wrong.get("/api/v1/demo/context").json()["error"]["code"] == "forbidden"
    keyed = TestClient(app, headers={"X-Compass-Service-Key": KEY})
    response = keyed.get("/api/v1/demo/context")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"
    odd = TestClient(app, headers={"X-Compass-Service-Key": KEY, "X-Compass-User": "a/../b"})
    assert odd.get("/api/v1/demo/context").status_code == 401


def test_first_visit_seeds_a_labelled_unplanned_fixture_for_that_account() -> None:
    app = make_app()
    ctx = context(as_user(app, "student-a"))
    assert ctx["mode"] == "simulated_canvas_workspace"
    assert ctx["student"] == {"provider": "simulated-canvas-g1", "id": "student-a"}
    assert ctx["now"].startswith("2026-10-12T02:00")
    assert ctx["period"]["start"].startswith("2026-10-12T00:00")
    assert len(ctx["assignments"]) == 5 and len(ctx["tasks"]) == 5
    assert ctx["study_windows"] and ctx["available_minutes"] > 0
    assert history(as_user(app, "student-a"), ctx) == []
    # Seeding is idempotent per account.
    assert context(as_user(app, "student-a"))["tasks"] == ctx["tasks"]


def test_student_completes_a_full_week_in_their_own_workspace() -> None:
    app = make_app()
    ctx = complete_week(as_user(app, "student-a"))
    assert len(history(as_user(app, "student-a"), ctx)) == 1


def test_students_a_and_b_are_isolated() -> None:
    app = make_app()
    a, b = as_user(app, "student-a"), as_user(app, "student-b")
    ctx_a = plan_week(a)
    advance(a)
    ctx_b = context(b)

    # B gets its own namespace, its own task ids, its own clock and no plan.
    assert ctx_b["student"]["id"] == "student-b"
    assert {t["id"] for t in ctx_b["tasks"]}.isdisjoint({t["id"] for t in ctx_a["tasks"]})
    assert {x["assignment_id"] for x in ctx_b["assignments"]}.isdisjoint(
        {x["assignment_id"] for x in ctx_a["assignments"]}
    )
    assert ctx_b["now"] != context(a)["now"]
    assert history(b, ctx_b) == []

    # B cannot name A in a query or a JSON body, even with a valid session.
    assert b.get("/api/v1/weekly-plans/history", params=scope(ctx_a)).status_code == 403
    assert (
        b.get(
            "/api/v1/weekly-history",
            params={"student_provider": "simulated-canvas-g1", "student_id": "student-a"},
        ).json()["error"]["code"]
        == "forbidden_student"
    )
    stolen = b.post(
        "/api/v1/weekly-plans/approve",
        json={
            "student": ctx_a["student"],
            "period": ctx_a["period"],
            "study_windows": ctx_a["study_windows"],
            "goal_text": "x",
            "target_minutes": 60,
            "record_id": str(uuid4()),
        },
    )
    assert stolen.status_code == 403
    assert (
        b.post(
            "/api/v1/academic-data/import",
            json={"source": "json", "student_external_id": "student-a"},
        ).status_code
        == 403
    )
    # B's clock moves independently of A's.
    before_a = context(a)["now"]
    advance(b, "next_week")
    assert context(a)["now"] == before_a
    assert len(history(a, ctx_a)) == 1


def test_a_provider_the_account_does_not_hold_is_rejected() -> None:
    app = make_app()
    a = as_user(app, "student-a")
    ctx = context(a)
    params = {**scope(ctx), "student_provider": "mock-canvas"}
    assert a.get("/api/v1/weekly-plans/history", params=params).status_code == 403


def test_reset_starts_a_new_generation_and_retires_the_old_namespace() -> None:
    app = make_app()
    a = as_user(app, "student-a")
    old = plan_week(a)
    advance(a, "next_week")
    reset = a.post("/api/v1/demo/scenarios/select", json={"scenario_id": "week"})
    assert reset.status_code == 200, reset.text
    fresh: dict[str, Any] = reset.json()
    assert fresh["student"]["provider"] == "simulated-canvas-g2"
    assert fresh["generation"] == 2
    assert fresh["now"] == old["now"]  # back to Monday 09:00
    assert history(a, fresh) == []
    assert a.get("/api/v1/weekly-plans/history", params=scope(old)).status_code == 403
    other = a.post("/api/v1/demo/scenarios/select", json={"scenario_id": "crunch"})
    assert other.status_code == 400


def test_new_fixture_follows_the_real_week_while_existing_clocks_do_not() -> None:
    real = FixedClock(REAL_NOW)
    app = make_app(real)
    first = context(as_user(app, "student-a"))
    real.advance(timedelta(days=7))
    assert context(as_user(app, "student-a"))["now"] == first["now"]
    later = context(as_user(app, "student-c"))
    assert later["now"].startswith("2026-10-19T02:00")


def test_runtime_selection_fails_closed(monkeypatch: pytest.MonkeyPatch) -> None:
    from haui_compass.api.simulated_workspaces import build_simulated_workspace_app

    monkeypatch.delenv("HAUI_COMPASS_DATABASE_URL", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("COMPASS_SERVICE_KEY", raising=False)
    with pytest.raises(RuntimeError, match="COMPASS_SERVICE_KEY"):
        build_simulated_workspace_app()
    monkeypatch.setenv("COMPASS_SERVICE_KEY", KEY)
    monkeypatch.setenv("VERCEL", "1")
    with pytest.raises(RuntimeError, match="HAUI_COMPASS_DATABASE_URL"):
        build_simulated_workspace_app()
    monkeypatch.delenv("VERCEL")
    app = build_simulated_workspace_app()
    assert context(as_user(app, "local-user"))["mode"] == "simulated_canvas_workspace"


def test_entrypoint_loads_by_file_path_as_on_vercel() -> None:
    # Vercel imports the entrypoint file under its own module name, so the package's
    # haui_compass.api.main is imported a second time; that must not cycle back here.
    main_py = Path(__file__).resolve().parents[3] / "src/haui_compass/api/main.py"
    script = (
        "import importlib.util, sys\n"
        f"spec = importlib.util.spec_from_file_location('vc_entrypoint', {str(main_py)!r})\n"
        "module = importlib.util.module_from_spec(spec)\n"
        "spec.loader.exec_module(module)\n"
        "print(type(module.app).__name__)\n"
    )
    env = {
        name: value
        for name, value in os.environ.items()
        if name not in {"HAUI_COMPASS_DATABASE_URL", "DATABASE_URL", "VERCEL"}
    }
    env.update(HAUI_COMPASS_SIMULATED_WORKSPACES="1", COMPASS_SERVICE_KEY=KEY)
    result = subprocess.run(
        [sys.executable, "-c", script], env=env, capture_output=True, text=True, check=False
    )
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "FastAPI"

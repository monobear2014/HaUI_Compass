"""Per-account simulated workspaces on real PostgreSQL, across independent API instances."""

import os
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select, text

from haui_compass.api.postgres_dependencies import build_postgres_container
from haui_compass.api.simulated_workspaces import create_simulated_workspace_app
from haui_compass.infrastructure.config.database import DatabaseSettings
from haui_compass.infrastructure.demo.simulated_workspaces import (
    SimulatedCanvasLMSProvider,
    SimulatedWorkspaces,
    WorkspaceClock,
)
from haui_compass.infrastructure.persistence.postgres.models import Base, TaskRow
from haui_compass.infrastructure.persistence.postgres.session import (
    PostgresPersistenceTransactionManager,
)
from haui_compass.infrastructure.persistence.postgres.simulated_workspaces import (
    PostgresSimulatedWorkspaceRepository,
)
from support.clocks import FixedClock
from support.weekly_flow import advance, complete_week, context, decompose_project, history

KEY = "test-service-key"
REAL_NOW = datetime(2026, 10, 15, 8, 30, tzinfo=UTC)


def _url() -> str:
    url = os.getenv("HAUI_COMPASS_TEST_DATABASE_URL") or os.getenv("DATABASE_URL")
    if not url or not url.startswith("postgresql"):
        pytest.skip("real PostgreSQL test database is not configured")
    return url


def instance() -> tuple[FastAPI, SimulatedWorkspaces]:
    """A fresh process-equivalent: new engine, new container, no shared memory."""
    real = FixedClock(REAL_NOW)
    container = build_postgres_container(
        settings=DatabaseSettings(url=_url()),
        lms=SimulatedCanvasLMSProvider(),
        clock=WorkspaceClock(real),
    )
    assert isinstance(container.transaction_manager, PostgresPersistenceTransactionManager)
    workspaces = SimulatedWorkspaces(
        repository=PostgresSimulatedWorkspaceRepository(
            container.transaction_manager.current_session
        ),
        tasks=container.task_repository,
        transaction_manager=container.transaction_manager,
        clock=real,
    )
    app = create_simulated_workspace_app(
        container=container, workspaces=workspaces, service_key=KEY
    )
    return app, workspaces


def as_user(app: FastAPI, owner: str) -> TestClient:
    return TestClient(app, headers={"X-Compass-Service-Key": KEY, "X-Compass-User": owner})


@pytest.mark.postgres
def test_two_students_complete_isolated_weeks_across_instances() -> None:
    first, _ = instance()
    second, _ = instance()
    # A generates candidates on one instance and confirms on another (serverless-style).
    final_a = complete_week(as_user(first, "student-a"), confirm=as_user(second, "student-a"))
    final_b = complete_week(as_user(second, "student-b"), confirm=as_user(first, "student-b"))
    assert final_a["student"]["id"] == "student-a" and final_b["student"]["id"] == "student-b"

    # A brand-new instance sees each account's own persisted state and clock.
    third, _ = instance()
    a, b = as_user(third, "student-a"), as_user(third, "student-b")
    assert context(a)["now"] == final_a["now"]
    assert context(b)["now"] == final_b["now"]
    assert len(history(a, final_a)) == 1 and len(history(b, final_b)) == 1
    weeks = a.get(
        "/api/v1/weekly-history",
        params={"student_provider": final_a["student"]["provider"], "student_id": "student-a"},
    ).json()["weeks"]
    assert len(weeks) == 2 and weeks[1]["reflections"]
    # Cross-account reads are refused even on a fresh instance.
    assert (
        b.get(
            "/api/v1/weekly-history",
            params={"student_provider": final_a["student"]["provider"], "student_id": "student-a"},
        ).status_code
        == 403
    )


@pytest.mark.postgres
def test_concurrent_first_visits_seed_one_workspace() -> None:
    app, workspaces = instance()
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda _: workspaces.ensure("student-race"), range(4)))
    assert {w.generation for w in results} == {1}
    engine = create_engine(_url(), future=True)
    try:
        with engine.connect() as connection:
            count = connection.scalar(select(func.count()).select_from(TaskRow))
    finally:
        engine.dispose()
    assert count == 5
    assert len(context(as_user(app, "student-race"))["tasks"]) == 5


@pytest.mark.postgres
def test_reset_and_clock_survive_a_new_instance() -> None:
    app, _ = instance()
    a = as_user(app, "student-a")
    ctx = context(a)
    decompose_project(a, a, ctx)
    advance(a, "next_week")
    reset = a.post("/api/v1/demo/scenarios/select", json={"scenario_id": "week"}).json()
    other, _ = instance()
    again = context(as_user(other, "student-a"))
    assert again["generation"] == 2 == reset["generation"]
    assert again["now"] == ctx["now"] and len(again["tasks"]) == 5


@pytest.mark.postgres
def test_migrations_match_models_and_downgrade_cleanly() -> None:
    url = _url()
    engine = create_engine(url, future=True)
    try:
        with engine.connect() as connection:
            diff = compare_metadata(MigrationContext.configure(connection), Base.metadata)
        assert diff == []
        config = Config("alembic.ini")
        command.downgrade(config, "0003_weekly_goals")
        with engine.connect() as connection:
            tables = set(
                connection.scalars(
                    text("SELECT tablename FROM pg_tables WHERE schemaname = current_schema()")
                )
            )
        assert "simulated_workspaces" not in tables
        assert "task_decomposition_sessions" not in tables
        assert "weekly_goals" in tables
        command.upgrade(config, "head")
    finally:
        engine.dispose()

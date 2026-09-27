"""The same repository contracts run against a disposable real PostgreSQL database."""

import os
from collections.abc import Iterator

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from haui_compass.infrastructure.persistence.postgres.executions import (
    PostgresTaskExecutionRepository,
)
from haui_compass.infrastructure.persistence.postgres.plans import PostgresStudyPlanRepository
from haui_compass.infrastructure.persistence.postgres.reflections import (
    PostgresConfirmedReflectionRepository,
)
from haui_compass.infrastructure.persistence.postgres.tasks import PostgresTaskRepository
from support.persistence_contracts import (
    assert_execution_repository_contract,
    assert_reflection_repository_contract,
    assert_study_plan_repository_contract,
    assert_task_repository_contract,
)

DATABASE_URL = os.getenv("HAUI_COMPASS_TEST_DATABASE_URL") or os.getenv("DATABASE_URL")


@pytest.fixture
def postgres_session() -> Iterator[Session]:
    if not DATABASE_URL or not DATABASE_URL.startswith("postgresql"):
        pytest.skip("real PostgreSQL test database is not configured")
    config = Config("alembic.ini")
    os.environ["HAUI_COMPASS_DATABASE_URL"] = DATABASE_URL
    command.upgrade(config, "head")
    engine = create_engine(DATABASE_URL, future=True)
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection)
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()
    engine.dispose()


def test_task_repository_contract(postgres_session: Session) -> None:
    assert_task_repository_contract(lambda: PostgresTaskRepository(lambda: postgres_session))


def test_execution_repository_contract(postgres_session: Session) -> None:
    assert_execution_repository_contract(
        lambda: PostgresTaskExecutionRepository(lambda: postgres_session)
    )


def test_reflection_repository_contract(postgres_session: Session) -> None:
    assert_reflection_repository_contract(
        lambda: PostgresConfirmedReflectionRepository(lambda: postgres_session)
    )


def test_study_plan_repository_contract(postgres_session: Session) -> None:
    assert_study_plan_repository_contract(
        lambda: PostgresStudyPlanRepository(lambda: postgres_session)
    )

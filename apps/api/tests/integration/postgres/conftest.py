"""Isolate every real-PostgreSQL test from schema and data ordering."""

import os

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

from haui_compass.infrastructure.persistence.postgres.models import Base


@pytest.fixture(autouse=True)
def migrated_empty_postgres_database() -> None:
    """Apply the real schema and clear test facts before each PostgreSQL test."""
    database_url = os.getenv("HAUI_COMPASS_TEST_DATABASE_URL") or os.getenv("DATABASE_URL")
    if not database_url or not database_url.startswith("postgresql"):
        pytest.skip("real PostgreSQL test database is not configured")

    os.environ["HAUI_COMPASS_DATABASE_URL"] = database_url
    command.upgrade(Config("alembic.ini"), "head")

    table_names = ", ".join(table.name for table in reversed(Base.metadata.sorted_tables))
    engine = create_engine(database_url, future=True)
    try:
        with engine.begin() as connection:
            connection.execute(text(f"TRUNCATE TABLE {table_names} CASCADE"))
    finally:
        engine.dispose()

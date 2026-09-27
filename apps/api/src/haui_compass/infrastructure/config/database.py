"""Typed database configuration; credentials come from environment, never source control."""

import os
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class DatabaseSettings:
    url: str

    @classmethod
    def from_env(cls, *, integration: bool = False) -> "DatabaseSettings":
        name = "HAUI_COMPASS_TEST_DATABASE_URL" if integration else "HAUI_COMPASS_DATABASE_URL"
        url = os.getenv(name) or os.getenv("DATABASE_URL")
        if not url:
            raise RuntimeError(f"{name} is required for PostgreSQL composition")
        if not url.startswith(("postgresql://", "postgresql+psycopg://")):
            raise ValueError("database URL must use PostgreSQL")
        return cls(url=url)

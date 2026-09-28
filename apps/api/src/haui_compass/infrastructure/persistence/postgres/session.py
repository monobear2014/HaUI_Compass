"""SQLAlchemy engine/session lifecycle and PostgreSQL transaction manager."""

import contextvars
from collections.abc import Callable
from typing import TypeVar

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

T = TypeVar("T")


class PostgresSessionFactory:
    def __init__(self, url: str) -> None:
        self.engine = create_engine(url, future=True, pool_pre_ping=True)
        self.session_factory = sessionmaker(self.engine, expire_on_commit=False)

    def session(self) -> Session:
        return self.session_factory()

    def dispose(self) -> None:
        self.engine.dispose()


class PostgresPersistenceTransactionManager:
    def __init__(self, session_factory: sessionmaker[Session]) -> None:
        self._session_factory = session_factory
        self._current: contextvars.ContextVar[Session | None] = contextvars.ContextVar(
            "haui_compass_postgres_session", default=None
        )

    def current_session(self) -> Session:
        session = self._current.get()
        if session is None:
            raise RuntimeError("PostgreSQL repository access must occur inside a transaction")
        return session

    def run(self, operation: Callable[[], T]) -> T:
        with self._session_factory() as session:
            token = self._current.set(session)
            try:
                with session.begin():
                    return operation()
            except Exception:
                session.rollback()
                raise
            finally:
                self._current.reset(token)

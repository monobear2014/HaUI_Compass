"""Rollback-capable transaction manager for in-memory application tests."""

import copy
from collections.abc import Callable
from typing import TypeVar

T = TypeVar("T")


class InMemoryPersistenceTransactionManager:
    def __init__(self, *repositories: object) -> None:
        self._repositories = repositories

    def run(self, operation: Callable[[], T]) -> T:
        snapshots = [
            copy.deepcopy(getattr(repository, "__dict__", {})) for repository in self._repositories
        ]
        try:
            return operation()
        except Exception:
            for repository, snapshot in zip(self._repositories, snapshots, strict=True):
                repository.__dict__.clear()
                repository.__dict__.update(snapshot)
            raise

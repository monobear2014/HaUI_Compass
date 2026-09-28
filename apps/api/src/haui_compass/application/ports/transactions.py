"""Small application-owned transaction boundary."""

from collections.abc import Callable
from typing import Protocol, TypeVar

T = TypeVar("T")


class PersistenceTransactionManager(Protocol):
    def run(self, operation: Callable[[], T]) -> T:
        """Run all repository writes in one transaction, committing or rolling back atomically."""
        ...

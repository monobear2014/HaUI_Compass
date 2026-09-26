"""Clock port: the only sanctioned source of "now" for use cases (ADR-0001, *Time Dependency*)."""

from datetime import datetime
from typing import Protocol


class Clock(Protocol):
    def now(self) -> datetime:
        """Return the current instant as a timezone-aware datetime in UTC."""
        ...

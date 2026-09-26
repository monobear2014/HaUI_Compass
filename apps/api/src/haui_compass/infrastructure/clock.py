"""Production clock."""

from datetime import UTC, datetime


class SystemClock:
    """Implements ``application.ports.clock.Clock`` using the system time."""

    def now(self) -> datetime:
        return datetime.now(UTC)

"""Test doubles for the Clock port."""

from datetime import datetime, timedelta

from haui_compass.domain.shared.validation import require_aware_utc


class FixedClock:
    """A clock that returns a chosen instant until it is explicitly advanced."""

    def __init__(self, now: datetime) -> None:
        self._now = require_aware_utc(now, "FixedClock.now")

    def now(self) -> datetime:
        return self._now

    def advance(self, delta: timedelta) -> None:
        self._now += delta

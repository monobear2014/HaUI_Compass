from datetime import UTC, datetime, timedelta

from haui_compass.application.ports.clock import Clock
from haui_compass.infrastructure.clock import SystemClock


def test_system_clock_returns_timezone_aware_utc() -> None:
    clock: Clock = SystemClock()
    now = clock.now()
    assert now.tzinfo is not None
    assert now.utcoffset() == timedelta(0)


def test_system_clock_tracks_real_time() -> None:
    before = datetime.now(UTC)
    now = SystemClock().now()
    after = datetime.now(UTC)
    assert before <= now <= after

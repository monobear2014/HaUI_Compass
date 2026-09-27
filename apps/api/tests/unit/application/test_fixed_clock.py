from datetime import UTC, datetime, timedelta

import pytest

from haui_compass.application.ports.clock import Clock
from haui_compass.domain.shared.errors import DomainValidationError
from support.clocks import FixedClock

START = datetime(2026, 10, 1, 8, 0, tzinfo=UTC)


def test_fixed_clock_always_returns_the_same_instant() -> None:
    clock: Clock = FixedClock(START)
    assert clock.now() == START
    assert clock.now() == START


def test_fixed_clock_can_be_advanced() -> None:
    clock = FixedClock(START)
    clock.advance(timedelta(hours=2))
    assert clock.now() == START + timedelta(hours=2)


def test_fixed_clock_rejects_naive_datetimes() -> None:
    with pytest.raises(DomainValidationError, match="timezone-aware"):
        FixedClock(datetime(2026, 10, 1, 8, 0))

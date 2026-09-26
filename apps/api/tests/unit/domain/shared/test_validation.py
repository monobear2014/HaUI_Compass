from datetime import UTC, datetime, timedelta, timezone

import pytest

from haui_compass.domain.shared.errors import DomainValidationError
from haui_compass.domain.shared.validation import (
    require_aware_utc,
    require_non_blank,
    require_non_negative,
)


def test_naive_datetime_is_rejected() -> None:
    with pytest.raises(DomainValidationError, match="timezone-aware"):
        require_aware_utc(datetime(2026, 1, 1, 12, 0), "when")


def test_utc_datetime_is_returned_unchanged() -> None:
    value = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)
    assert require_aware_utc(value, "when") == value


def test_aware_datetime_is_normalised_to_utc() -> None:
    hanoi = timezone(timedelta(hours=7))
    result = require_aware_utc(datetime(2026, 1, 1, 19, 0, tzinfo=hanoi), "when")
    assert result == datetime(2026, 1, 1, 12, 0, tzinfo=UTC)
    assert result.utcoffset() == timedelta(0)


@pytest.mark.parametrize("text", ["", "   ", "\t\n"])
def test_blank_text_is_rejected(text: str) -> None:
    with pytest.raises(DomainValidationError, match="must not be blank"):
        require_non_blank(text, "title")


def test_text_is_stripped() -> None:
    assert require_non_blank("  Lab 1  ", "title") == "Lab 1"


def test_negative_duration_is_rejected() -> None:
    with pytest.raises(DomainValidationError, match="must not be negative"):
        require_non_negative(timedelta(minutes=-1), "duration")


def test_zero_and_positive_durations_are_accepted() -> None:
    assert require_non_negative(timedelta(0), "duration") == timedelta(0)
    assert require_non_negative(timedelta(minutes=30), "duration") == timedelta(minutes=30)

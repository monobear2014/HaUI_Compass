"""Small invariant checks shared by domain objects.

Each helper returns the (possibly normalised) value so it can be used directly in
``__post_init__``. ``name`` is only used to make the error message useful.
"""

from datetime import UTC, datetime, timedelta

from haui_compass.domain.shared.errors import DomainValidationError


def require_aware_utc(value: datetime, name: str) -> datetime:
    """Reject naive datetimes; return any aware datetime normalised to UTC.

    Naive datetimes are ambiguous, so they are never accepted (ADR-0001, *Time Dependency*).
    Aware values in another zone (e.g. +07:00 from an LMS) are converted, so equal instants
    compare and serialise identically.
    """
    if value.tzinfo is None or value.utcoffset() is None:
        raise DomainValidationError(f"{name} must be timezone-aware")
    return value.astimezone(UTC)


def require_non_blank(value: str, name: str) -> str:
    """Reject empty or whitespace-only text; return it stripped."""
    stripped = value.strip()
    if not stripped:
        raise DomainValidationError(f"{name} must not be blank")
    return stripped


def require_non_negative(value: timedelta, name: str) -> timedelta:
    """Reject negative durations. Zero is allowed."""
    if value < timedelta(0):
        raise DomainValidationError(f"{name} must not be negative")
    return value


def require_non_negative_int(value: int, name: str) -> int:
    """Reject negative integers (counts). Zero is allowed."""
    if value < 0:
        raise DomainValidationError(f"{name} must not be negative")
    return value

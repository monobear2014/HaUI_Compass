"""Explicit UTC and duration mapping helpers."""

from datetime import UTC, datetime, timedelta


def utc(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("database datetime must be timezone-aware")
    return value.astimezone(UTC)


def seconds(value: timedelta) -> int:
    result = value.total_seconds()
    if result != int(result):
        raise ValueError("PostgreSQL duration representation requires whole seconds")
    return int(result)


def duration(value: int) -> timedelta:
    return timedelta(seconds=value)

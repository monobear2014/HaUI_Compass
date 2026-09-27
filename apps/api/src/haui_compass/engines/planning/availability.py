"""Pure interval operations shared by planning and replanning engines."""

from collections.abc import Iterable
from datetime import datetime

from haui_compass.domain.plans.plan import PlanPeriod, StudyBlock, StudyWindow
from haui_compass.domain.shared.errors import DomainValidationError
from haui_compass.domain.shared.validation import require_aware_utc


def normalize_study_windows(
    study_windows: Iterable[StudyWindow], period: PlanPeriod
) -> tuple[StudyWindow, ...]:
    """Validate, order, and merge overlapping or touching study windows."""
    ordered = sorted(study_windows, key=lambda window: (window.starts_at, window.ends_at))
    for window in ordered:
        if window.starts_at < period.start or window.ends_at > period.end:
            raise DomainValidationError("StudyWindow must lie inside the planning period")

    merged: list[StudyWindow] = []
    for window in ordered:
        if not merged or window.starts_at > merged[-1].ends_at:
            merged.append(window)
            continue
        previous = merged[-1]
        merged[-1] = StudyWindow(
            starts_at=previous.starts_at,
            ends_at=max(previous.ends_at, window.ends_at),
        )
    return tuple(merged)


def clip_study_windows(
    study_windows: Iterable[StudyWindow], starts_at: datetime
) -> tuple[StudyWindow, ...]:
    """Return only the portion of each normalized window at or after ``starts_at``."""
    starts_at = require_aware_utc(starts_at, "clip_study_windows.starts_at")
    clipped: list[StudyWindow] = []
    for window in study_windows:
        clipped_start = max(window.starts_at, starts_at)
        if clipped_start < window.ends_at:
            clipped.append(StudyWindow(starts_at=clipped_start, ends_at=window.ends_at))
    return tuple(clipped)


def subtract_study_blocks_from_windows(
    study_windows: Iterable[StudyWindow], study_blocks: Iterable[StudyBlock]
) -> tuple[StudyWindow, ...]:
    """Remove every overlap with a block from normalized, non-overlapping windows."""
    remaining = list(study_windows)
    for block in sorted(study_blocks, key=lambda item: (item.starts_at, item.ends_at)):
        next_remaining: list[StudyWindow] = []
        for window in remaining:
            if block.ends_at <= window.starts_at or block.starts_at >= window.ends_at:
                next_remaining.append(window)
                continue
            if window.starts_at < block.starts_at:
                next_remaining.append(
                    StudyWindow(starts_at=window.starts_at, ends_at=block.starts_at)
                )
            if block.ends_at < window.ends_at:
                next_remaining.append(StudyWindow(starts_at=block.ends_at, ends_at=window.ends_at))
        remaining = next_remaining
    return tuple(remaining)

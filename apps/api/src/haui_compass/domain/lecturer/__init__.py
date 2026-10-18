"""Submission metrics, independent of study-task execution."""

from collections import Counter
from collections.abc import Iterable
from datetime import datetime


def submission_progress(
    rows: Iterable[tuple[datetime | None, datetime | None]], *, as_of: datetime
) -> dict[str, object]:
    """Each row is one enrolled learner x assignment obligation.

    Deadline equality is on time. Missing deadlines are excluded. Future-dated
    submissions are not yet observed. Only matured obligations enter the KPI.
    """
    counts: Counter[str] = Counter()
    matured = on_time_due = 0
    for due_at, submitted_at in rows:
        if due_at is None:
            counts["no_deadline"] += 1
            continue
        submitted = submitted_at if submitted_at and submitted_at <= as_of else None
        if submitted is not None:
            status = "on_time" if submitted <= due_at else "late"
        else:
            status = "not_submitted" if due_at <= as_of else "not_yet_due"
        counts[status] += 1
        if due_at <= as_of:
            matured += 1
            on_time_due += int(status == "on_time")
    return {
        **{
            key: counts[key]
            for key in ("on_time", "late", "not_submitted", "not_yet_due", "no_deadline")
        },
        "due_obligations": matured,
        "on_time_due": on_time_due,
        "on_time_rate": round(on_time_due / matured * 100, 1) if matured else None,
    }

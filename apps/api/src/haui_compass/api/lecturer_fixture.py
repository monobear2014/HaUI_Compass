"""Hand-authored Canvas-shaped synthetic fixture v1; no real students or API export.

Fixed observation time makes this a reproducible snapshot, never an impact study.
One row per assignment/enrollment; latest authoritative submitted_at is used.
"""

from datetime import UTC, datetime, timedelta

AS_OF = datetime(2026, 10, 18, 5, tzinfo=UTC)
SOURCE = "Canvas-shaped synthetic fixture v1 · hand-authored · 2026-10-18"
CLASSES = {
    "canvas-demo-ai": ("AI Engineering · Lớp mô phỏng", 12),
    "canvas-demo-small": ("Nhóm nhỏ mô phỏng", 4),
    "canvas-demo-other": ("Lớp khác mô phỏng", 10),
}


def obligations(size: int) -> list[tuple[datetime | None, datetime | None]]:
    due = AS_OF - timedelta(days=1)
    rows: list[tuple[datetime | None, datetime | None]] = []
    for index in range(size):
        submitted = (
            due - timedelta(hours=2)
            if index % 4 < 2
            else due + timedelta(hours=3)
            if index % 4 == 2
            else None
        )
        rows.extend(((due, submitted), (AS_OF + timedelta(days=3), None)))
    return rows

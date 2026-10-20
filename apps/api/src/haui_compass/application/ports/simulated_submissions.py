"""First authoritative submission event in a simulated learner generation."""

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol
from uuid import UUID

from haui_compass.domain.shared.validation import require_aware_utc


@dataclass(frozen=True, slots=True)
class SimulatedSubmission:
    student_id: UUID
    assignment_id: UUID
    submitted_at: datetime

    def __post_init__(self) -> None:
        object.__setattr__(
            self, "submitted_at", require_aware_utc(self.submitted_at, "submitted_at")
        )


class SimulatedSubmissionRepository(Protocol):
    def first(self, event: SimulatedSubmission) -> SimulatedSubmission:
        """Insert once; retries return the original submission time."""
        ...

    def list_for_student(self, student_id: UUID) -> tuple[SimulatedSubmission, ...]: ...


@dataclass(frozen=True, slots=True)
class SimulatedAssignmentCatalogEntry:
    """Mock curriculum key shared across learners; domain ID stays server-side."""

    key: str
    assignment_id: UUID
    title: str
    course: str

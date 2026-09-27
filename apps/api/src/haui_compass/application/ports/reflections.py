"""Persistence contract for student-confirmed reflection signals only."""

from dataclasses import dataclass
from datetime import datetime
from typing import NewType, Protocol
from uuid import UUID

from haui_compass.domain.reflections.signals import ConfirmedReflectionSignals
from haui_compass.domain.shared.errors import DomainValidationError
from haui_compass.domain.shared.validation import require_aware_utc
from haui_compass.domain.students.ids import StudentId

ConfirmedReflectionRecordId = NewType("ConfirmedReflectionRecordId", UUID)


@dataclass(frozen=True, slots=True, kw_only=True)
class StoredConfirmedReflection:
    record_id: ConfirmedReflectionRecordId
    confirmed: ConfirmedReflectionSignals
    saved_at: datetime

    def __post_init__(self) -> None:
        object.__setattr__(
            self,
            "saved_at",
            require_aware_utc(self.saved_at, "StoredConfirmedReflection.saved_at"),
        )
        if self.saved_at < self.confirmed.confirmed_at:
            raise DomainValidationError(
                "StoredConfirmedReflection.saved_at must not precede confirmation"
            )


class ConfirmedReflectionRepository(Protocol):
    def append(self, record: StoredConfirmedReflection) -> StoredConfirmedReflection:
        """Append once; an identical record-id retry is idempotent."""
        ...

    def get(self, record_id: ConfirmedReflectionRecordId) -> StoredConfirmedReflection | None: ...

    def list_for_student(self, student_id: StudentId) -> tuple[StoredConfirmedReflection, ...]: ...

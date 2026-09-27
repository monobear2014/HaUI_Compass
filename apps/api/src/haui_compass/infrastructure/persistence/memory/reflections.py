"""In-memory append-only persistence for confirmed reflection signals."""

from haui_compass.application.ports.persistence import (
    PersistenceError,
    PersistenceErrorCode,
)
from haui_compass.application.ports.reflections import (
    ConfirmedReflectionRecordId,
    StoredConfirmedReflection,
)
from haui_compass.domain.students.ids import StudentId


class InMemoryConfirmedReflectionRepository:
    def __init__(self) -> None:
        self._records: dict[ConfirmedReflectionRecordId, StoredConfirmedReflection] = {}

    def append(self, record: StoredConfirmedReflection) -> StoredConfirmedReflection:
        existing = self._records.get(record.record_id)
        if existing is not None:
            if existing == record:
                return existing
            raise PersistenceError(
                PersistenceErrorCode.RECORD_CONFLICT,
                f"reflection record id {record.record_id} already has different content",
            )
        self._records[record.record_id] = record
        return record

    def get(self, record_id: ConfirmedReflectionRecordId) -> StoredConfirmedReflection | None:
        return self._records.get(record_id)

    def list_for_student(self, student_id: StudentId) -> tuple[StoredConfirmedReflection, ...]:
        return tuple(
            sorted(
                (
                    record
                    for record in self._records.values()
                    if record.confirmed.student_id == student_id
                ),
                key=lambda record: (
                    record.confirmed.confirmed_at,
                    record.confirmed.period.start,
                    record.confirmed.period.end,
                    record.record_id,
                ),
            )
        )

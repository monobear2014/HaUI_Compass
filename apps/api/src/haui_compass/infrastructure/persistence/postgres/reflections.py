from collections.abc import Callable
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from haui_compass.application.ports.persistence import PersistenceError, PersistenceErrorCode
from haui_compass.application.ports.reflections import (
    ConfirmedReflectionRecordId,
    StoredConfirmedReflection,
)
from haui_compass.domain.reflections.reflection import ReflectionPeriod, WorkloadFeedback
from haui_compass.domain.reflections.signals import (
    ConfirmedReflectionSignals,
    DeferredTaskSignal,
    DifficultTopicSignal,
    EstimationFeedbackSignal,
    WorkloadFeedbackSignal,
)
from haui_compass.domain.students.ids import StudentId
from haui_compass.domain.tasks.task import TaskId
from haui_compass.infrastructure.persistence.postgres.mapping import duration, seconds, utc
from haui_compass.infrastructure.persistence.postgres.models import (
    ReflectionRow,
    ReflectionSignalRow,
)


class PostgresConfirmedReflectionRepository:
    def __init__(self, session_provider: Callable[[], Session]) -> None:
        self._session_provider = session_provider

    def _session(self) -> Session:
        return self._session_provider()

    def append(self, record: StoredConfirmedReflection) -> StoredConfirmedReflection:
        existing = self.get(record.record_id)
        if existing is not None:
            if existing == record:
                return existing
            raise PersistenceError(
                PersistenceErrorCode.RECORD_CONFLICT, "reflection record id conflict"
            )
        session = self._session()
        confirmed = record.confirmed
        session.add(
            ReflectionRow(
                record_id=record.record_id,
                student_id=confirmed.student_id,
                period_start=utc(confirmed.period.start),
                period_end=utc(confirmed.period.end),
                confirmed_at=utc(confirmed.confirmed_at),
                saved_at=utc(record.saved_at),
            )
        )
        for position, signal in enumerate(confirmed.signals):
            values = self._signal_values(signal)
            session.add(
                ReflectionSignalRow(record_id=record.record_id, position=position, **values)
            )
        session.flush()
        return record

    def get(self, record_id: ConfirmedReflectionRecordId) -> StoredConfirmedReflection | None:
        row = self._session().get(ReflectionRow, record_id)
        return None if row is None else self._to_domain(row)

    def list_for_student(self, student_id: StudentId) -> tuple[StoredConfirmedReflection, ...]:
        rows = self._session().scalars(
            select(ReflectionRow)
            .where(ReflectionRow.student_id == student_id)
            .order_by(ReflectionRow.confirmed_at, ReflectionRow.record_id)
        )
        return tuple(self._to_domain(row) for row in rows)

    @staticmethod
    def _signal_values(signal: Any) -> dict[str, Any]:
        if isinstance(signal, EstimationFeedbackSignal):
            return {
                "kind": "estimation_feedback",
                "task_id": signal.task_id,
                "estimated_seconds": seconds(signal.estimated_duration),
                "actual_seconds": seconds(signal.actual_duration),
            }
        if isinstance(signal, WorkloadFeedbackSignal):
            return {"kind": "workload_feedback", "workload": signal.reported.value}
        if isinstance(signal, DifficultTopicSignal):
            return {"kind": "difficult_topic", "topic": signal.topic}
        if isinstance(signal, DeferredTaskSignal):
            return {"kind": "deferred_task", "task_id": signal.task_id}
        raise TypeError(f"unsupported reflection signal: {type(signal)!r}")

    def _to_domain(self, row: ReflectionRow) -> StoredConfirmedReflection:
        signals: list[Any] = []
        for item in self._session().scalars(
            select(ReflectionSignalRow)
            .where(ReflectionSignalRow.record_id == row.record_id)
            .order_by(ReflectionSignalRow.position)
        ):
            if item.kind == "estimation_feedback":
                assert item.task_id is not None
                assert item.estimated_seconds is not None
                assert item.actual_seconds is not None
                signals.append(
                    EstimationFeedbackSignal(
                        task_id=TaskId(item.task_id),
                        estimated_duration=duration(item.estimated_seconds),
                        actual_duration=duration(item.actual_seconds),
                    )
                )
            elif item.kind == "workload_feedback":
                assert item.workload is not None
                signals.append(WorkloadFeedbackSignal(reported=WorkloadFeedback(item.workload)))
            elif item.kind == "difficult_topic":
                assert item.topic is not None
                signals.append(DifficultTopicSignal(topic=item.topic))
            elif item.kind == "deferred_task":
                assert item.task_id is not None
                signals.append(DeferredTaskSignal(task_id=TaskId(item.task_id)))
            else:
                raise PersistenceError(
                    PersistenceErrorCode.RECORD_CONFLICT, "unknown reflection signal"
                )
        confirmed = ConfirmedReflectionSignals(
            student_id=StudentId(row.student_id),
            period=ReflectionPeriod(start=utc(row.period_start), end=utc(row.period_end)),
            confirmed_at=utc(row.confirmed_at),
            signals=tuple(signals),
        )
        return StoredConfirmedReflection(
            record_id=ConfirmedReflectionRecordId(row.record_id),
            confirmed=confirmed,
            saved_at=utc(row.saved_at),
        )

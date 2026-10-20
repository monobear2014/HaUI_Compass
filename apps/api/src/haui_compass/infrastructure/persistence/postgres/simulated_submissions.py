from collections.abc import Callable
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from haui_compass.application.ports.simulated_submissions import SimulatedSubmission
from haui_compass.infrastructure.persistence.postgres.mapping import utc
from haui_compass.infrastructure.persistence.postgres.models import SimulatedSubmissionRow


class PostgresSimulatedSubmissionRepository:
    def __init__(self, provider: Callable[[], Session]) -> None:
        self._provider = provider

    def first(self, event: SimulatedSubmission) -> SimulatedSubmission:
        session = self._provider()
        session.execute(
            insert(SimulatedSubmissionRow)
            .values(
                student_id=event.student_id,
                assignment_id=event.assignment_id,
                submitted_at=event.submitted_at,
            )
            .on_conflict_do_nothing()
        )
        row = session.get(SimulatedSubmissionRow, (event.student_id, event.assignment_id))
        assert row is not None
        return SimulatedSubmission(row.student_id, row.assignment_id, utc(row.submitted_at))

    def list_for_student(self, student_id: UUID) -> tuple[SimulatedSubmission, ...]:
        rows = self._provider().scalars(
            select(SimulatedSubmissionRow).where(SimulatedSubmissionRow.student_id == student_id)
        )
        return tuple(
            SimulatedSubmission(r.student_id, r.assignment_id, utc(r.submitted_at)) for r in rows
        )

from uuid import UUID

from haui_compass.application.ports.simulated_submissions import SimulatedSubmission


class InMemorySimulatedSubmissionRepository:
    def __init__(self) -> None:
        self._events: dict[tuple[UUID, UUID], SimulatedSubmission] = {}

    def first(self, event: SimulatedSubmission) -> SimulatedSubmission:
        return self._events.setdefault((event.student_id, event.assignment_id), event)

    def list_for_student(self, student_id: UUID) -> tuple[SimulatedSubmission, ...]:
        return tuple(row for (owner, _), row in self._events.items() if owner == student_id)

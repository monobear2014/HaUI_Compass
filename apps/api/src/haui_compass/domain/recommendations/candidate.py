"""ActionCandidate: one task the engine may recommend, with everything it may reason from."""

from dataclasses import dataclass

from haui_compass.domain.assignments.assignment import Assignment
from haui_compass.domain.risk.signal import RiskSignal
from haui_compass.domain.shared.errors import DomainValidationError
from haui_compass.domain.tasks.task import Task


@dataclass(frozen=True, slots=True, kw_only=True)
class ActionCandidate:
    """A task, the assignment it belongs to, and that assignment's current risk assessment.

    The risk signal should have been assessed at the same ``now`` the engine is given; the engine
    does not re-assess risk. Completed tasks may appear here and are ignored by the engine.
    """

    task: Task
    assignment: Assignment
    risk: RiskSignal

    def __post_init__(self) -> None:
        if self.task.assignment_id != self.assignment.id:
            raise DomainValidationError("ActionCandidate.task does not belong to the assignment")
        if self.risk.assignment_id != self.assignment.id:
            raise DomainValidationError("ActionCandidate.risk is for a different assignment")

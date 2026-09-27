from datetime import datetime, timedelta
from uuid import UUID

import pytest

from haui_compass.application.lms_mapping import SkippedAssignment, SkipReason
from haui_compass.application.ports.lms import ExternalRef
from haui_compass.application.use_cases.daily_recommendation import (
    AssignmentCapacity,
    AssignmentRisk,
    DailyRecommendationInputError,
    DailyRecommendationResult,
    GenerateDailyRecommendationRequest,
    InputErrorCode,
)
from haui_compass.domain.recommendations.recommendation import (
    NoRecommendation,
    NoRecommendationReason,
)
from haui_compass.domain.risk.signal import RiskLevel
from haui_compass.domain.shared.errors import DomainValidationError
from haui_compass.domain.students.ids import StudentId
from haui_compass.domain.students.state import CapacityState, ProgressState, StudentState
from support.builders import NOW, assignment_id, make_assignment, make_risk, make_task

HOUR = timedelta(hours=1)
DEADLINE = NOW + timedelta(days=2)


def state(as_of: datetime = NOW) -> StudentState:
    return StudentState(
        student_id=StudentId(UUID(int=10)),
        as_of=as_of,
        capacity=CapacityState(available=8 * HOUR, committed=2 * HOUR),
        progress=ProgressState(not_started=1, in_progress=0, completed=0),
    )


def nothing(as_of: datetime = NOW) -> NoRecommendation:
    return NoRecommendation(
        as_of=as_of, reason=NoRecommendationReason.NO_ACTIONABLE_TASKS, engine_version=1
    )


def result(**overrides: object) -> DailyRecommendationResult:
    values: dict[str, object] = {
        "as_of": NOW,
        "student_state": state(),
        "assignment_risks": (
            AssignmentRisk(
                assignment=make_assignment(2, deadline=DEADLINE),
                risk=make_risk(2, RiskLevel.LOW, deadline=DEADLINE),
            ),
        ),
        "recommendation": nothing(),
        "skipped_assignments": (),
    }
    values.update(overrides)
    return DailyRecommendationResult(**values)  # type: ignore[arg-type]


class TestAssignmentCapacity:
    def test_holds_its_values(self) -> None:
        c = AssignmentCapacity(assignment_id=assignment_id(2), available_until_deadline=3 * HOUR)
        assert c.available_until_deadline == 3 * HOUR

    def test_negative_capacity_is_rejected(self) -> None:
        with pytest.raises(DomainValidationError, match="must not be negative"):
            AssignmentCapacity(assignment_id=assignment_id(2), available_until_deadline=-HOUR)


class TestRequest:
    def test_capacities_default_to_none_supplied(self) -> None:
        request = GenerateDailyRecommendationRequest(
            student=ExternalRef("mock-lms", "student-001"),
            tasks=(make_task(1, 2),),
            available_capacity=8 * HOUR,
        )
        assert request.assignment_capacities == ()


class TestResult:
    def test_holds_its_parts(self) -> None:
        r = result(
            skipped_assignments=(
                SkippedAssignment(
                    source=ExternalRef("mock-lms", "x"), reason=SkipReason.NO_DEADLINE
                ),
            )
        )
        assert r.as_of == NOW
        assert len(r.assignment_risks) == 1
        assert r.skipped_assignments[0].reason is SkipReason.NO_DEADLINE

    def test_is_immutable(self) -> None:
        with pytest.raises(AttributeError):
            result().as_of = NOW  # type: ignore[misc]

    @pytest.mark.parametrize("part", ["student_state", "recommendation", "risk"])
    def test_mixed_snapshot_instants_are_rejected(self, part: str) -> None:
        later = NOW + HOUR
        overrides: dict[str, object]
        if part == "student_state":
            overrides = {"student_state": state(later)}
        elif part == "recommendation":
            overrides = {"recommendation": nothing(later)}
        else:
            overrides = {
                "assignment_risks": (
                    AssignmentRisk(
                        assignment=make_assignment(2, deadline=DEADLINE),
                        risk=make_risk(2, RiskLevel.LOW, deadline=DEADLINE, as_of=later),
                    ),
                )
            }
        with pytest.raises(DomainValidationError, match="one snapshot instant"):
            result(**overrides)


class TestInputError:
    def test_carries_a_machine_readable_code(self) -> None:
        error = DailyRecommendationInputError(InputErrorCode.DUPLICATE_TASK_ID, "duplicate")
        assert error.code is InputErrorCode.DUPLICATE_TASK_ID
        assert str(error) == "duplicate"
        assert isinstance(error, ValueError)

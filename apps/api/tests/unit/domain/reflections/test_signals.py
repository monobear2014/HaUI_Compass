from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest

from haui_compass.domain.reflections.reflection import ReflectionPeriod, WorkloadFeedback
from haui_compass.domain.reflections.signals import (
    CandidateReflectionSignals,
    ConfirmedReflectionSignals,
    DeferredTaskSignal,
    DifficultTopicSignal,
    EstimationFeedbackSignal,
    WorkloadFeedbackSignal,
)
from haui_compass.domain.shared.errors import DomainValidationError
from haui_compass.domain.students.ids import StudentId
from haui_compass.domain.tasks.task import TaskId

STUDENT_ID = StudentId(UUID(int=1))
TASK_ID = TaskId(UUID(int=10))
PERIOD = ReflectionPeriod(
    start=datetime(2026, 10, 1, tzinfo=UTC), end=datetime(2026, 10, 8, tzinfo=UTC)
)


class TestConcreteSignals:
    def test_estimation_feedback_keeps_both_numbers(self) -> None:
        s = EstimationFeedbackSignal(
            task_id=TASK_ID,
            estimated_duration=timedelta(minutes=45),
            actual_duration=timedelta(minutes=80),
        )
        assert s.estimated_duration == timedelta(minutes=45)
        assert s.actual_duration == timedelta(minutes=80)

    def test_estimation_feedback_rejects_negative_durations(self) -> None:
        with pytest.raises(DomainValidationError, match="must not be negative"):
            EstimationFeedbackSignal(
                task_id=TASK_ID,
                estimated_duration=timedelta(minutes=-1),
                actual_duration=timedelta(minutes=10),
            )

    def test_signals_are_immutable(self) -> None:
        s = DifficultTopicSignal(topic="Recursion")
        with pytest.raises(AttributeError):
            s.topic = "Graphs"  # type: ignore[misc]

    def test_signals_of_equal_value_compare_equal(self) -> None:
        assert DeferredTaskSignal(task_id=TASK_ID) == DeferredTaskSignal(task_id=TASK_ID)
        assert WorkloadFeedbackSignal(
            reported=WorkloadFeedback.TOO_HEAVY
        ) == WorkloadFeedbackSignal(reported=WorkloadFeedback.TOO_HEAVY)

    def test_signals_are_hashable(self) -> None:
        {DifficultTopicSignal(topic="Recursion"), DeferredTaskSignal(task_id=TASK_ID)}


class TestCandidateVsConfirmed:
    def test_are_distinct_types(self) -> None:
        types: tuple[type, type] = (CandidateReflectionSignals, ConfirmedReflectionSignals)
        assert types[0] is not types[1]

    def test_candidate_holds_proposed_signals(self) -> None:
        c = CandidateReflectionSignals(
            student_id=STUDENT_ID,
            period=PERIOD,
            signals=(DifficultTopicSignal(topic="Recursion"),),
        )
        assert c.signals == (DifficultTopicSignal(topic="Recursion"),)

    def test_confirmed_requires_aware_utc_confirmed_at(self) -> None:
        with pytest.raises(DomainValidationError, match="timezone-aware"):
            ConfirmedReflectionSignals(
                student_id=STUDENT_ID,
                period=PERIOD,
                confirmed_at=datetime(2026, 10, 8),
                signals=(),
            )

    def test_confirmed_before_period_start_is_rejected(self) -> None:
        with pytest.raises(DomainValidationError, match="must not be before"):
            ConfirmedReflectionSignals(
                student_id=STUDENT_ID,
                period=PERIOD,
                confirmed_at=PERIOD.start - timedelta(seconds=1),
                signals=(),
            )

    def test_confirmed_is_immutable(self) -> None:
        c = ConfirmedReflectionSignals(
            student_id=STUDENT_ID, period=PERIOD, confirmed_at=PERIOD.end, signals=()
        )
        with pytest.raises(AttributeError):
            c.signals = ()  # type: ignore[misc]

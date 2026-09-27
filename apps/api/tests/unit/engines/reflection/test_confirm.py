from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest

from haui_compass.domain.reflections.reflection import ReflectionPeriod, WorkloadFeedback
from haui_compass.domain.reflections.signals import (
    CandidateReflectionSignals,
    ConfirmedReflectionSignals,
    DeferredTaskSignal,
    DifficultTopicSignal,
    WorkloadFeedbackSignal,
)
from haui_compass.domain.students.ids import StudentId
from haui_compass.domain.tasks.task import TaskId
from haui_compass.engines.reflection.confirm import (
    ReflectionSignalNotCandidateError,
    confirm_reflection_signals,
)

STUDENT_ID = StudentId(UUID(int=1))
TASK_ID = TaskId(UUID(int=10))
PERIOD = ReflectionPeriod(
    start=datetime(2026, 10, 1, tzinfo=UTC), end=datetime(2026, 10, 8, tzinfo=UTC)
)
CONFIRMED_AT = PERIOD.end + timedelta(hours=1)

TOPIC_SIGNAL = DifficultTopicSignal(topic="Recursion")
DEFERRED_SIGNAL = DeferredTaskSignal(task_id=TASK_ID)
WORKLOAD_SIGNAL = WorkloadFeedbackSignal(reported=WorkloadFeedback.TOO_HEAVY)


def candidate(*signals: object) -> CandidateReflectionSignals:
    return CandidateReflectionSignals(
        student_id=STUDENT_ID,
        period=PERIOD,
        signals=tuple(signals),  # type: ignore[arg-type]
    )


class TestConfirmReflectionSignals:
    def test_confirms_a_subset_of_the_candidate(self) -> None:
        c = candidate(TOPIC_SIGNAL, DEFERRED_SIGNAL, WORKLOAD_SIGNAL)
        confirmed = confirm_reflection_signals(
            c, selected=[TOPIC_SIGNAL], confirmed_at=CONFIRMED_AT
        )
        assert isinstance(confirmed, ConfirmedReflectionSignals)
        assert confirmed.signals == (TOPIC_SIGNAL,)
        assert confirmed.student_id == STUDENT_ID
        assert confirmed.period == PERIOD

    def test_confirming_nothing_is_valid(self) -> None:
        c = candidate(TOPIC_SIGNAL)
        confirmed = confirm_reflection_signals(c, selected=[], confirmed_at=CONFIRMED_AT)
        assert confirmed.signals == ()

    def test_confirming_every_signal_is_valid(self) -> None:
        c = candidate(TOPIC_SIGNAL, DEFERRED_SIGNAL)
        confirmed = confirm_reflection_signals(
            c, selected=[TOPIC_SIGNAL, DEFERRED_SIGNAL], confirmed_at=CONFIRMED_AT
        )
        assert confirmed.signals == (TOPIC_SIGNAL, DEFERRED_SIGNAL)

    def test_selecting_a_signal_not_proposed_is_rejected(self) -> None:
        c = candidate(TOPIC_SIGNAL)
        with pytest.raises(ReflectionSignalNotCandidateError):
            confirm_reflection_signals(c, selected=[DEFERRED_SIGNAL], confirmed_at=CONFIRMED_AT)

    def test_selecting_the_same_signal_more_times_than_proposed_is_rejected(self) -> None:
        c = candidate(TOPIC_SIGNAL)
        with pytest.raises(ReflectionSignalNotCandidateError):
            confirm_reflection_signals(
                c, selected=[TOPIC_SIGNAL, TOPIC_SIGNAL], confirmed_at=CONFIRMED_AT
            )

    def test_selecting_a_signal_proposed_twice_is_allowed_twice(self) -> None:
        c = candidate(TOPIC_SIGNAL, TOPIC_SIGNAL)
        confirmed = confirm_reflection_signals(
            c, selected=[TOPIC_SIGNAL, TOPIC_SIGNAL], confirmed_at=CONFIRMED_AT
        )
        assert confirmed.signals == (TOPIC_SIGNAL, TOPIC_SIGNAL)

    def test_confirmed_type_is_not_candidate_type(self) -> None:
        c = candidate(TOPIC_SIGNAL)
        confirmed = confirm_reflection_signals(c, selected=[], confirmed_at=CONFIRMED_AT)
        assert not isinstance(confirmed, CandidateReflectionSignals)
        assert not isinstance(c, ConfirmedReflectionSignals)

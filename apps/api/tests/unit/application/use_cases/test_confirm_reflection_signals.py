from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest

from haui_compass.application.use_cases.confirm_reflection_signals import (
    ConfirmReflectionSignals,
    ConfirmReflectionSignalsRequest,
)
from haui_compass.domain.reflections.reflection import ReflectionPeriod
from haui_compass.domain.reflections.signals import (
    CandidateReflectionSignals,
    DifficultTopicSignal,
)
from haui_compass.domain.students.ids import StudentId
from haui_compass.engines.reflection.confirm import ReflectionSignalNotCandidateError
from support.clocks import FixedClock

STUDENT_ID = StudentId(UUID(int=1))
PERIOD = ReflectionPeriod(
    start=datetime(2026, 10, 1, tzinfo=UTC), end=datetime(2026, 10, 8, tzinfo=UTC)
)
NOW = PERIOD.end + timedelta(hours=3)
TOPIC_SIGNAL = DifficultTopicSignal(topic="Recursion")


def candidate() -> CandidateReflectionSignals:
    return CandidateReflectionSignals(student_id=STUDENT_ID, period=PERIOD, signals=(TOPIC_SIGNAL,))


def test_confirmed_at_comes_from_the_clock() -> None:
    result = ConfirmReflectionSignals(clock=FixedClock(NOW)).execute(
        ConfirmReflectionSignalsRequest(candidate=candidate(), selected_signals=(TOPIC_SIGNAL,))
    )
    assert result.confirmed.confirmed_at == NOW
    assert result.confirmed.signals == (TOPIC_SIGNAL,)


def test_confirming_nothing_yields_no_confirmed_signals() -> None:
    result = ConfirmReflectionSignals(clock=FixedClock(NOW)).execute(
        ConfirmReflectionSignalsRequest(candidate=candidate(), selected_signals=())
    )
    assert result.confirmed.signals == ()


def test_a_signal_never_proposed_is_rejected() -> None:
    other = DifficultTopicSignal(topic="Graphs")
    with pytest.raises(ReflectionSignalNotCandidateError):
        ConfirmReflectionSignals(clock=FixedClock(NOW)).execute(
            ConfirmReflectionSignalsRequest(candidate=candidate(), selected_signals=(other,))
        )

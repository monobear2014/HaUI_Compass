from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest

from haui_compass.application.use_cases.submit_reflection import (
    SubmitReflection,
    SubmitReflectionRequest,
)
from haui_compass.domain.assignments.assignment import AssignmentId
from haui_compass.domain.reflections.reflection import (
    ReflectionPeriod,
    ReflectionResponses,
    ReflectionUnknownTaskError,
)
from haui_compass.domain.reflections.signals import EstimationFeedbackSignal
from haui_compass.domain.shared.errors import DomainValidationError
from haui_compass.domain.students.ids import StudentId
from haui_compass.domain.tasks.execution import ExecutionOutcome, TaskExecution
from haui_compass.domain.tasks.task import Task, TaskId
from support.clocks import FixedClock

STUDENT_ID = StudentId(UUID(int=1))
ASSIGNMENT_ID = AssignmentId(UUID(int=99))
TASK_ID = TaskId(UUID(int=10))
PERIOD_START = datetime(2026, 10, 1, tzinfo=UTC)
PERIOD_END = datetime(2026, 10, 8, tzinfo=UTC)
NOW = PERIOD_END + timedelta(hours=2)


def task() -> Task:
    return Task(
        id=TASK_ID,
        assignment_id=ASSIGNMENT_ID,
        title="Draft introduction",
        estimated_duration=timedelta(minutes=45),
    )


def execution(minutes: int) -> TaskExecution:
    start = PERIOD_START + timedelta(days=1)
    return TaskExecution(
        task_id=TASK_ID,
        started_at=start,
        ended_at=start + timedelta(minutes=minutes),
        outcome=ExecutionOutcome.COMPLETED,
    )


def request(**overrides: object) -> SubmitReflectionRequest:
    values: dict[str, object] = {
        "student_id": STUDENT_ID,
        "period": ReflectionPeriod(start=PERIOD_START, end=PERIOD_END),
        "responses": ReflectionResponses(),
    }
    values.update(overrides)
    return SubmitReflectionRequest(**values)  # type: ignore[arg-type]


def test_submitted_at_comes_from_the_clock() -> None:
    result = SubmitReflection(clock=FixedClock(NOW)).execute(request())
    assert result.reflection.submitted_at == NOW


def test_produces_candidate_signals_from_execution_facts() -> None:
    result = SubmitReflection(clock=FixedClock(NOW)).execute(
        request(
            responses=ReflectionResponses(reflected_task_ids=(TASK_ID,)),
            tasks=(task(),),
            task_executions=(execution(80),),
        )
    )
    assert result.candidate_signals.signals == (
        EstimationFeedbackSignal(
            task_id=TASK_ID,
            estimated_duration=timedelta(minutes=45),
            actual_duration=timedelta(minutes=80),
        ),
    )


def test_reuses_the_execution_summary_engine_across_sessions() -> None:
    """Two sessions on the same task are aggregated, not reported twice."""
    second_start = PERIOD_START + timedelta(days=2)
    second = TaskExecution(
        task_id=TASK_ID,
        started_at=second_start,
        ended_at=second_start + timedelta(minutes=20),
        outcome=ExecutionOutcome.PARTIAL,
    )
    result = SubmitReflection(clock=FixedClock(NOW)).execute(
        request(
            responses=ReflectionResponses(reflected_task_ids=(TASK_ID,)),
            tasks=(task(),),
            task_executions=(execution(30), second),
        )
    )
    (signal,) = result.candidate_signals.signals
    assert isinstance(signal, EstimationFeedbackSignal)
    assert signal.actual_duration == timedelta(minutes=50)


def test_unknown_task_reference_is_rejected() -> None:
    with pytest.raises(ReflectionUnknownTaskError):
        SubmitReflection(clock=FixedClock(NOW)).execute(
            request(responses=ReflectionResponses(reflected_task_ids=(TASK_ID,)))
        )


def test_invalid_period_is_rejected() -> None:
    with pytest.raises(DomainValidationError, match="end must be strictly after"):
        request(period=ReflectionPeriod(start=PERIOD_END, end=PERIOD_START))

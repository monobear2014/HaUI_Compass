"""Execution history -> SubmitReflection -> candidate signals -> ConfirmReflectionSignals.

Proves the whole pipeline composes end to end, reusing the existing execution-tracking engine for
aggregation. It does not re-test any engine's own rules (those have their own unit tests) and it
does not touch StudentState: this branch's confirmed signals are not yet consumed by it.
"""

from datetime import timedelta
from uuid import UUID

from haui_compass.application.use_cases.confirm_reflection_signals import (
    ConfirmReflectionSignals,
    ConfirmReflectionSignalsRequest,
)
from haui_compass.application.use_cases.submit_reflection import (
    SubmitReflection,
    SubmitReflectionRequest,
)
from haui_compass.domain.assignments.assignment import AssignmentId
from haui_compass.domain.reflections.reflection import ReflectionPeriod, ReflectionResponses
from haui_compass.domain.reflections.signals import (
    ConfirmedReflectionSignals,
    DeferredTaskSignal,
    DifficultTopicSignal,
    EstimationFeedbackSignal,
)
from haui_compass.domain.students.ids import StudentId
from haui_compass.domain.tasks.execution import ExecutionOutcome, TaskExecution
from haui_compass.domain.tasks.task import Task, TaskId
from support.builders import NOW
from support.clocks import FixedClock

ASSIGNMENT_ID = AssignmentId(UUID(int=50))
STUDENT_ID = StudentId(UUID(int=1))
ESSAY_TASK = TaskId(UUID(int=1))
READING_TASK = TaskId(UUID(int=2))
PERIOD = ReflectionPeriod(start=NOW - timedelta(days=7), end=NOW)


def essay_task() -> Task:
    return Task(
        id=ESSAY_TASK,
        assignment_id=ASSIGNMENT_ID,
        title="Draft essay introduction",
        estimated_duration=timedelta(minutes=45),
    )


def reading_task() -> Task:
    return Task(
        id=READING_TASK,
        assignment_id=ASSIGNMENT_ID,
        title="Read chapter 4",
        estimated_duration=timedelta(minutes=30),
    )


def essay_execution() -> TaskExecution:
    start = PERIOD.start + timedelta(days=1)
    return TaskExecution(
        task_id=ESSAY_TASK,
        started_at=start,
        ended_at=start + timedelta(minutes=80),
        outcome=ExecutionOutcome.COMPLETED,
    )


class TestExecutionToConfirmedSignals:
    def test_full_pipeline_produces_confirmed_signals_from_facts_and_self_report(self) -> None:
        submit_clock = FixedClock(NOW)
        responses = ReflectionResponses(
            reflected_task_ids=(ESSAY_TASK,),
            difficult_topics=("Thesis statements",),
            deferred_task_ids=(READING_TASK,),
        )

        submitted = SubmitReflection(clock=submit_clock).execute(
            SubmitReflectionRequest(
                student_id=STUDENT_ID,
                period=PERIOD,
                responses=responses,
                tasks=(essay_task(), reading_task()),
                task_executions=(essay_execution(),),
            )
        )

        assert submitted.reflection.submitted_at == NOW
        estimation_signal = EstimationFeedbackSignal(
            task_id=ESSAY_TASK,
            estimated_duration=timedelta(minutes=45),
            actual_duration=timedelta(minutes=80),
        )
        deferred_signal = DeferredTaskSignal(task_id=READING_TASK)
        topic_signal = DifficultTopicSignal(topic="Thesis statements")
        assert set(submitted.candidate_signals.signals) == {
            estimation_signal,
            deferred_signal,
            topic_signal,
        }

        # The student reviews the proposals and confirms only two of the three.
        confirm_clock = FixedClock(NOW + timedelta(minutes=5))
        confirmed_result = ConfirmReflectionSignals(clock=confirm_clock).execute(
            ConfirmReflectionSignalsRequest(
                candidate=submitted.candidate_signals,
                selected_signals=(estimation_signal, deferred_signal),
            )
        )

        confirmed = confirmed_result.confirmed
        assert isinstance(confirmed, ConfirmedReflectionSignals)
        assert confirmed.confirmed_at == NOW + timedelta(minutes=5)
        assert set(confirmed.signals) == {estimation_signal, deferred_signal}
        assert topic_signal not in confirmed.signals  # rejected proposal never becomes a fact

from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest

from haui_compass.domain.assignments.assignment import AssignmentId
from haui_compass.domain.reflections.reflection import (
    Reflection,
    ReflectionPeriod,
    ReflectionResponses,
    ReflectionUnknownTaskError,
    WorkloadFeedback,
)
from haui_compass.domain.reflections.signals import (
    DeferredTaskSignal,
    DifficultTopicSignal,
    EstimationFeedbackSignal,
    WorkloadFeedbackSignal,
)
from haui_compass.domain.students.ids import StudentId
from haui_compass.domain.tasks.execution import ExecutionOutcome, TaskExecution
from haui_compass.domain.tasks.task import Task, TaskId
from haui_compass.engines.execution.summary import summarize_task_executions
from haui_compass.engines.reflection.candidates import generate_candidate_signals

STUDENT_ID = StudentId(UUID(int=1))
ASSIGNMENT_ID = AssignmentId(UUID(int=99))
PERIOD = ReflectionPeriod(
    start=datetime(2026, 10, 1, tzinfo=UTC), end=datetime(2026, 10, 8, tzinfo=UTC)
)
TASK_A = TaskId(UUID(int=10))
TASK_B = TaskId(UUID(int=11))
UNKNOWN_TASK = TaskId(UUID(int=999))


def task(task_id: TaskId, estimated_minutes: int) -> Task:
    return Task(
        id=task_id,
        assignment_id=ASSIGNMENT_ID,
        title="Some task",
        estimated_duration=timedelta(minutes=estimated_minutes),
    )


def one_execution(task_id: TaskId, minutes: int) -> TaskExecution:
    start = datetime(2026, 10, 2, 9, 0, tzinfo=UTC)
    return TaskExecution(
        task_id=task_id,
        started_at=start,
        ended_at=start + timedelta(minutes=minutes),
        outcome=ExecutionOutcome.COMPLETED,
    )


def reflection(**overrides: object) -> Reflection:
    values: dict[str, object] = {
        "student_id": STUDENT_ID,
        "period": PERIOD,
        "submitted_at": PERIOD.end,
        "responses": ReflectionResponses(),
    }
    values.update(overrides)
    return Reflection(**values)  # type: ignore[arg-type]


class TestEstimationFeedback:
    def test_emits_a_signal_when_executions_exist(self) -> None:
        r = reflection(responses=ReflectionResponses(reflected_task_ids=(TASK_A,)))
        summary = summarize_task_executions([one_execution(TASK_A, 80)])
        candidate = generate_candidate_signals(
            r,
            tasks_by_id={TASK_A: task(TASK_A, 45)},
            execution_summaries_by_task={TASK_A: summary},
        )
        assert candidate.signals == (
            EstimationFeedbackSignal(
                task_id=TASK_A,
                estimated_duration=timedelta(minutes=45),
                actual_duration=timedelta(minutes=80),
            ),
        )

    def test_no_signal_when_no_execution_summary_yet(self) -> None:
        r = reflection(responses=ReflectionResponses(reflected_task_ids=(TASK_A,)))
        candidate = generate_candidate_signals(
            r, tasks_by_id={TASK_A: task(TASK_A, 45)}, execution_summaries_by_task={}
        )
        assert candidate.signals == ()

    def test_unknown_reflected_task_is_rejected(self) -> None:
        r = reflection(responses=ReflectionResponses(reflected_task_ids=(UNKNOWN_TASK,)))
        with pytest.raises(ReflectionUnknownTaskError):
            generate_candidate_signals(r, tasks_by_id={}, execution_summaries_by_task={})

    def test_unknown_deferred_task_is_rejected(self) -> None:
        r = reflection(responses=ReflectionResponses(deferred_task_ids=(UNKNOWN_TASK,)))
        with pytest.raises(ReflectionUnknownTaskError):
            generate_candidate_signals(r, tasks_by_id={}, execution_summaries_by_task={})


class TestSelfReportSignals:
    def test_workload_feedback_signal(self) -> None:
        r = reflection(responses=ReflectionResponses(workload_feedback=WorkloadFeedback.TOO_HEAVY))
        candidate = generate_candidate_signals(r, tasks_by_id={}, execution_summaries_by_task={})
        assert candidate.signals == (WorkloadFeedbackSignal(reported=WorkloadFeedback.TOO_HEAVY),)

    def test_difficult_topic_signals(self) -> None:
        r = reflection(responses=ReflectionResponses(difficult_topics=("Recursion", "Graphs")))
        candidate = generate_candidate_signals(r, tasks_by_id={}, execution_summaries_by_task={})
        assert candidate.signals == (
            DifficultTopicSignal(topic="Graphs"),
            DifficultTopicSignal(topic="Recursion"),
        )

    def test_deferred_task_signals(self) -> None:
        r = reflection(responses=ReflectionResponses(deferred_task_ids=(TASK_A,)))
        candidate = generate_candidate_signals(
            r, tasks_by_id={TASK_A: task(TASK_A, 30)}, execution_summaries_by_task={}
        )
        assert candidate.signals == (DeferredTaskSignal(task_id=TASK_A),)

    def test_self_report_is_never_derived_from_execution_facts(self) -> None:
        """A task that ran long does not, by itself, produce a workload or deferral signal."""
        r = reflection(responses=ReflectionResponses(reflected_task_ids=(TASK_A,)))
        summary = summarize_task_executions([one_execution(TASK_A, 500)])
        candidate = generate_candidate_signals(
            r,
            tasks_by_id={TASK_A: task(TASK_A, 30)},
            execution_summaries_by_task={TASK_A: summary},
        )
        assert all(not isinstance(s, WorkloadFeedbackSignal) for s in candidate.signals)
        assert all(not isinstance(s, DeferredTaskSignal) for s in candidate.signals)


class TestDeterminism:
    def test_output_is_order_independent_in_task_mapping(self) -> None:
        r = reflection(responses=ReflectionResponses(reflected_task_ids=(TASK_A, TASK_B)))
        summaries = {
            TASK_A: summarize_task_executions([one_execution(TASK_A, 40)]),
            TASK_B: summarize_task_executions([one_execution(TASK_B, 20)]),
        }
        tasks = {TASK_A: task(TASK_A, 45), TASK_B: task(TASK_B, 15)}
        first = generate_candidate_signals(
            r, tasks_by_id=tasks, execution_summaries_by_task=summaries
        )
        second = generate_candidate_signals(
            r,
            tasks_by_id=dict(reversed(list(tasks.items()))),
            execution_summaries_by_task=dict(reversed(list(summaries.items()))),
        )
        assert first.signals == second.signals

    def test_repeated_calls_are_identical(self) -> None:
        r = reflection(
            responses=ReflectionResponses(
                difficult_topics=("Recursion",), deferred_task_ids=(TASK_A,)
            )
        )
        tasks = {TASK_A: task(TASK_A, 45)}
        first = generate_candidate_signals(r, tasks_by_id=tasks, execution_summaries_by_task={})
        second = generate_candidate_signals(r, tasks_by_id=tasks, execution_summaries_by_task={})
        assert first == second

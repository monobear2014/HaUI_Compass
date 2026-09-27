"""Execution tracking connected to StudentState and to GenerateDailyRecommendation.

These prove the new pieces compose with the existing pipeline; they do not re-test any engine's
own rules (those have their own unit tests).
"""

from datetime import timedelta
from uuid import UUID

from haui_compass.application.lms_mapping import student_id_for
from haui_compass.application.use_cases.daily_recommendation import (
    GenerateDailyRecommendationRequest,
)
from haui_compass.application.use_cases.generate_daily_recommendation import (
    GenerateDailyRecommendation,
)
from haui_compass.application.use_cases.record_task_execution import (
    RecordTaskExecution,
    RecordTaskExecutionRequest,
)
from haui_compass.domain.assignments.assignment import AssignmentId
from haui_compass.domain.recommendations.recommendation import NoRecommendation, Recommendation
from haui_compass.domain.tasks.execution import ExecutionOutcome
from haui_compass.domain.tasks.task import Task, TaskId, TaskStatus
from haui_compass.engines.student_state.derive import derive_student_state
from support.builders import NOW
from support.clocks import FixedClock
from support.daily import STUDENT, StubLMS, aid, days, task

HOUR = timedelta(hours=1)


def make_task(n: int, assignment: AssignmentId, hours: float = 1) -> Task:
    return Task(
        id=TaskId(UUID(int=n)),
        assignment_id=assignment,
        title=f"Task {n}",
        estimated_duration=timedelta(hours=hours),
    )


class TestStudentStateIntegration:
    def test_recording_execution_updates_progress_without_new_logic(self) -> None:
        """Task -> RecordTaskExecution -> updated Task -> derive_student_state, with no progress
        rule duplicated here: derive_student_state already turns statuses into counts."""
        a = aid("essay")
        t1, t2 = make_task(1, a), make_task(2, a)
        before = derive_student_state(
            student_id=student_id_for(STUDENT),
            tasks=[t1, t2],
            available_capacity=10 * HOUR,
            now=NOW,
        )
        assert (before.progress.not_started, before.progress.completed) == (2, 0)

        result = RecordTaskExecution().execute(
            RecordTaskExecutionRequest(
                task=t1,
                started_at=NOW,
                ended_at=NOW + timedelta(minutes=45),
                outcome=ExecutionOutcome.COMPLETED,
            )
        )
        after = derive_student_state(
            student_id=student_id_for(STUDENT),
            tasks=[result.updated_task, t2],
            available_capacity=10 * HOUR,
            now=NOW + timedelta(hours=1),
        )
        assert (after.progress.not_started, after.progress.completed) == (1, 1)
        assert (
            after.capacity.committed == t2.estimated_duration
        )  # t1's effort is no longer committed


class TestDailyRecommendationIntegration:
    def test_partial_then_completed_removes_the_task_from_eligibility(self) -> None:
        """Recommendation -> execution -> recommendation, across the real daily-recommendation
        use case. The one required invariant: completed work disappears from NBA eligibility."""
        assignment_a, assignment_b = aid("a"), aid("b")
        clock = FixedClock(NOW)
        lms = StubLMS([("a", days(1)), ("b", days(9))])
        use_case = GenerateDailyRecommendation(lms=lms, clock=clock)

        task_a = task(1, assignment_a, hours=1)
        task_b = task(2, assignment_b, hours=1)

        def recommend(current_task_a: Task) -> Recommendation | NoRecommendation:
            request = GenerateDailyRecommendationRequest(
                student=STUDENT, tasks=(current_task_a, task_b), available_capacity=10 * HOUR
            )
            return use_case.execute(request).recommendation

        first = recommend(task_a)
        assert isinstance(first, Recommendation)
        assert first.task_id == task_a.id  # the sooner deadline wins over an untouched runner-up

        clock.advance(timedelta(hours=2))
        after_partial = (
            RecordTaskExecution()
            .execute(
                RecordTaskExecutionRequest(
                    task=task_a,
                    started_at=NOW,
                    ended_at=NOW + timedelta(minutes=20),
                    outcome=ExecutionOutcome.PARTIAL,
                )
            )
            .updated_task
        )
        assert after_partial.status is TaskStatus.IN_PROGRESS

        second = recommend(after_partial)
        assert isinstance(second, Recommendation)
        assert second.task_id == task_a.id  # still the only real contender; still eligible

        clock.advance(timedelta(hours=1))
        after_completed = (
            RecordTaskExecution()
            .execute(
                RecordTaskExecutionRequest(
                    task=after_partial,
                    started_at=NOW,
                    ended_at=NOW + timedelta(minutes=40),
                    outcome=ExecutionOutcome.COMPLETED,
                )
            )
            .updated_task
        )
        assert after_completed.status is TaskStatus.COMPLETED

        third = recommend(after_completed)
        assert isinstance(third, Recommendation)
        assert third.task_id == task_b.id  # A is gone; B is the only eligible task left
        assert third.evidence.eligible_candidate_count == 1

    def test_a_fully_completed_workload_yields_no_recommendation(self) -> None:
        clock = FixedClock(NOW)
        lms = StubLMS([("a", days(1))])
        use_case = GenerateDailyRecommendation(lms=lms, clock=clock)
        task_a = task(1, aid("a"))

        completed = (
            RecordTaskExecution()
            .execute(
                RecordTaskExecutionRequest(
                    task=task_a,
                    started_at=NOW,
                    ended_at=NOW + timedelta(minutes=10),
                    outcome=ExecutionOutcome.COMPLETED,
                )
            )
            .updated_task
        )

        result = use_case.execute(
            GenerateDailyRecommendationRequest(
                student=STUDENT, tasks=(completed,), available_capacity=HOUR
            )
        )
        assert isinstance(result.recommendation, NoRecommendation)

"""Orchestration tests for GenerateDailyRecommendation.

These check that the use case wires the existing engines together correctly; the engines' own
rules are covered by their own tests.
"""

import inspect
import random
from collections.abc import Sequence
from datetime import datetime, timedelta

import pytest

from haui_compass.application.lms_mapping import SkipReason
from haui_compass.application.ports.lms import ExternalRef, LMSNotFoundError
from haui_compass.application.use_cases import generate_daily_recommendation as use_case_module
from haui_compass.application.use_cases.daily_recommendation import (
    DailyRecommendationInputError,
    DailyRecommendationResult,
    GenerateDailyRecommendationRequest,
    InputErrorCode,
)
from haui_compass.application.use_cases.generate_daily_recommendation import (
    GenerateDailyRecommendation,
)
from haui_compass.domain.recommendations.policy import RecommendationPolicy
from haui_compass.domain.recommendations.recommendation import (
    NoRecommendation,
    RankingDimension,
    Recommendation,
    RecommendationReasonCode,
)
from haui_compass.domain.risk.policy import RiskPolicy
from haui_compass.domain.risk.signal import RiskLevel, RiskReasonCode
from haui_compass.domain.shared.errors import DomainValidationError
from haui_compass.domain.tasks.task import Task, TaskStatus
from support.builders import NOW
from support.clocks import FixedClock
from support.daily import HOUR, STUDENT, StubLMS, aid, cap, days, task

L, M, H, U = RiskLevel.LOW, RiskLevel.MEDIUM, RiskLevel.HIGH, RiskLevel.UNKNOWN
DONE, STARTED, TODO = TaskStatus.COMPLETED, TaskStatus.IN_PROGRESS, TaskStatus.NOT_STARTED
Reason = RecommendationReasonCode


class CountingClock:
    def __init__(self, now: datetime) -> None:
        self._clock = FixedClock(now)
        self.reads = 0

    def now(self) -> datetime:
        self.reads += 1
        return self._clock.now()


def run(
    tasks: list[Task],
    *,
    assignments: Sequence[tuple[str, datetime | None]],
    capacities: Sequence[tuple[str, float]] | None = None,
    available: timedelta = 20 * HOUR,
    clock: CountingClock | None = None,
    **kwargs: object,
) -> DailyRecommendationResult:
    use_case = GenerateDailyRecommendation(
        lms=StubLMS(assignments),
        clock=clock or CountingClock(NOW),
        **kwargs,  # type: ignore[arg-type]
    )
    return use_case.execute(
        GenerateDailyRecommendationRequest(
            student=STUDENT,
            tasks=tuple(tasks),
            available_capacity=available,
            assignment_capacities=tuple(cap(aid(k), h) for k, h in (capacities or [])),
        )
    )


def recommended(result: DailyRecommendationResult) -> Recommendation:
    assert isinstance(result.recommendation, Recommendation), result.recommendation
    return result.recommendation


def risk_of(result: DailyRecommendationResult, key: str):  # type: ignore[no-untyped-def]
    return next(i.risk for i in result.assignment_risks if i.assignment.id == aid(key))


# --- the decision follows the engines -----------------------------------------------------------


def test_a_high_risk_assignment_wins_over_an_earlier_low_risk_one() -> None:
    result = run(
        [task(1, aid("soon"), hours=1), task(2, aid("late"), hours=5)],
        assignments=[("soon", days(1)), ("late", days(10))],
        capacities=[("soon", 8), ("late", 2)],  # late: 5h of work, 2h of capacity
    )
    r = recommended(result)
    assert r.task_id.int == 2
    assert risk_of(result, "late").level is H
    assert risk_of(result, "soon").level is L
    assert r.reason_codes[0] is Reason.HIGH_ASSIGNMENT_RISK
    assert r.evidence.deciding_dimension is RankingDimension.RISK


def test_an_earlier_deadline_breaks_a_tie_in_risk() -> None:
    result = run(
        [task(1, aid("a"), hours=1), task(2, aid("b"), hours=1)],
        assignments=[("a", days(5)), ("b", days(2))],
        capacities=[("a", 10), ("b", 10)],
    )
    r = recommended(result)
    assert r.task_id.int == 2
    assert r.reason_codes == (Reason.EARLIEST_DEADLINE,)
    assert r.evidence.deciding_dimension is RankingDimension.DEADLINE
    assert {risk_of(result, "a").level, risk_of(result, "b").level} == {L}


def test_unknown_risk_outranks_low_but_not_high() -> None:
    assignments = [("known", days(1)), ("unknown", days(9)), ("bad", days(20))]
    tasks = [task(1, aid("known")), task(2, aid("unknown")), task(3, aid("bad"), hours=6)]
    without_bad = run(tasks[:2], assignments=assignments, capacities=[("known", 10)])
    assert recommended(without_bad).task_id.int == 2
    assert recommended(without_bad).reason_codes[0] is Reason.UNKNOWN_ASSIGNMENT_RISK
    with_bad = run(tasks, assignments=assignments, capacities=[("known", 10), ("bad", 2)])
    assert recommended(with_bad).task_id.int == 3


def test_missing_assignment_capacity_is_unknown_and_never_borrowed_from_general_capacity() -> None:
    result = run([task(1, aid("a"), hours=2)], assignments=[("a", days(3))], available=1000 * HOUR)
    signal = risk_of(result, "a")
    assert signal.level is U
    assert signal.reason_codes == (RiskReasonCode.MISSING_CAPACITY,)
    assert signal.evidence.available_capacity is None
    assert result.student_state.capacity.available == 1000 * HOUR


def test_an_assignments_capacity_only_applies_to_that_assignment() -> None:
    result = run(
        [task(1, aid("a"), hours=4), task(2, aid("b"), hours=4)],
        assignments=[("a", days(3)), ("b", days(3))],
        capacities=[("a", 5)],
    )
    assert risk_of(result, "a").evidence.available_capacity == 5 * HOUR
    assert risk_of(result, "b").evidence.available_capacity is None


def test_remaining_effort_comes_from_open_tasks_only() -> None:
    result = run(
        [
            task(1, aid("a"), hours=3, status=DONE),
            task(2, aid("a"), hours=2, status=STARTED),
            task(3, aid("a"), hours=1),
        ],
        assignments=[("a", days(3))],
        capacities=[("a", 10)],
    )
    evidence = risk_of(result, "a").evidence
    assert evidence.remaining_effort == 3 * HOUR
    assert evidence.open_task_count == 2


def test_the_lms_effort_estimate_is_not_used_or_invented() -> None:
    # The stub's assignments carry no LMS effort at all; effort still comes from the tasks.
    result = run([task(1, aid("a"), hours=2)], assignments=[("a", days(3))], capacities=[("a", 10)])
    assert risk_of(result, "a").evidence.remaining_effort == 2 * HOUR
    assert risk_of(result, "a").level is not U


def test_an_assignment_with_no_tasks_gets_no_risk_signal_and_is_never_recommended() -> None:
    result = run(
        [task(1, aid("has-tasks"))],
        assignments=[("has-tasks", days(3)), ("no-tasks", days(1))],
        capacities=[("has-tasks", 10), ("no-tasks", 10)],
    )
    assert [i.assignment.id for i in result.assignment_risks] == [aid("has-tasks")]
    assert recommended(result).assignment_id == aid("has-tasks")


def test_only_supplied_tasks_can_be_recommended() -> None:
    supplied = [task(7, aid("a")), task(8, aid("b"))]
    result = run(supplied, assignments=[("a", days(2)), ("b", days(4)), ("c", days(1))])
    assert recommended(result).task_id in {t.id for t in supplied}


# --- empty and finished states are valid --------------------------------------------------------


def test_no_tasks_is_a_valid_no_recommendation() -> None:
    result = run([], assignments=[("a", days(3)), ("undated", None)])
    assert isinstance(result.recommendation, NoRecommendation)
    assert result.assignment_risks == ()
    assert result.student_state.progress.total == 0
    assert result.student_state.progress.completion_ratio is None
    assert [s.reason for s in result.skipped_assignments] == [SkipReason.NO_DEADLINE]


def test_all_tasks_completed_means_no_recommendation_but_risk_is_still_reported() -> None:
    result = run(
        [task(1, aid("a"), status=DONE), task(2, aid("a"), status=DONE)],
        assignments=[("a", days(3))],
    )
    assert isinstance(result.recommendation, NoRecommendation)
    signal = risk_of(result, "a")
    assert signal.level is L and signal.reason_codes == (RiskReasonCode.NO_REMAINING_WORK,)
    assert result.student_state.progress.completed == 2
    assert result.student_state.capacity.committed == timedelta(0)


def test_completed_tasks_contribute_no_effort_or_count_to_risk() -> None:
    result = run(
        [task(1, aid("a"), hours=3, status=DONE), task(2, aid("a"), hours=1)],
        assignments=[("a", days(3))],
        capacities=[("a", 10)],
    )
    evidence = risk_of(result, "a").evidence
    assert evidence.remaining_effort == 1 * HOUR
    assert evidence.open_task_count == 1


def test_completed_tasks_are_never_recommended() -> None:
    result = run(
        [task(1, aid("a"), status=DONE), task(2, aid("b"))],
        assignments=[("a", days(1)), ("b", days(9))],
    )
    assert recommended(result).task_id.int == 2
    assert recommended(result).evidence.eligible_candidate_count == 1


# --- invalid input is reported, never silently dropped ------------------------------------------


def error_code(*args: object, **kwargs: object) -> InputErrorCode:
    with pytest.raises(DailyRecommendationInputError) as info:
        run(*args, **kwargs)  # type: ignore[arg-type]
    return info.value.code


def test_a_task_for_an_unknown_assignment_is_rejected() -> None:
    assert (
        error_code([task(1, aid("ghost"))], assignments=[("a", days(3))])
        is InputErrorCode.TASK_FOR_UNKNOWN_ASSIGNMENT
    )


def test_a_task_for_an_undated_assignment_is_rejected_with_its_own_code() -> None:
    assert (
        error_code([task(1, aid("undated"))], assignments=[("undated", None)])
        is InputErrorCode.TASK_FOR_UNDATED_ASSIGNMENT
    )


def test_duplicate_task_ids_are_rejected() -> None:
    assert (
        error_code([task(1, aid("a")), task(1, aid("a"))], assignments=[("a", days(3))])
        is InputErrorCode.DUPLICATE_TASK_ID
    )


def test_duplicate_or_unknown_assignment_capacities_are_rejected() -> None:
    assert (
        error_code(
            [task(1, aid("a"))], assignments=[("a", days(3))], capacities=[("a", 1), ("a", 2)]
        )
        is InputErrorCode.DUPLICATE_ASSIGNMENT_CAPACITY
    )
    assert (
        error_code([task(1, aid("a"))], assignments=[("a", days(3))], capacities=[("ghost", 1)])
        is InputErrorCode.CAPACITY_FOR_UNKNOWN_ASSIGNMENT
    )
    assert (
        error_code([], assignments=[("undated", None)], capacities=[("undated", 1)])
        is InputErrorCode.CAPACITY_FOR_UNKNOWN_ASSIGNMENT
    )


def test_an_unknown_student_propagates_the_lms_error() -> None:
    use_case = GenerateDailyRecommendation(lms=StubLMS([]), clock=FixedClock(NOW))
    with pytest.raises(LMSNotFoundError):
        use_case.execute(
            GenerateDailyRecommendationRequest(
                student=ExternalRef("stub", "nobody"), tasks=(), available_capacity=HOUR
            )
        )


def test_negative_general_capacity_is_rejected() -> None:
    with pytest.raises(DomainValidationError, match="must not be negative"):
        run([], assignments=[], available=-HOUR)


# --- one snapshot instant, determinism ----------------------------------------------------------


def test_the_clock_is_read_once_and_every_part_shares_that_instant() -> None:
    clock = CountingClock(NOW)
    result = run(
        [task(1, aid("a")), task(2, aid("b"))],
        assignments=[("a", days(2)), ("b", days(4))],
        capacities=[("a", 5), ("b", 5)],
        clock=clock,
    )
    assert clock.reads == 1
    assert result.as_of == NOW
    assert result.student_state.as_of == NOW
    assert result.recommendation.as_of == NOW
    assert all(item.risk.as_of == NOW for item in result.assignment_risks)


def test_a_later_run_uses_a_later_instant() -> None:
    fixed = FixedClock(NOW)
    use_case = GenerateDailyRecommendation(lms=StubLMS([("a", days(3))]), clock=fixed)
    request = GenerateDailyRecommendationRequest(
        student=STUDENT, tasks=(task(1, aid("a")),), available_capacity=HOUR
    )
    first = use_case.execute(request)
    fixed.advance(timedelta(hours=5))
    second = use_case.execute(request)
    assert second.as_of == first.as_of + timedelta(hours=5)
    assert second.recommendation.as_of == second.as_of


def test_the_same_request_gives_the_same_result_whatever_the_task_order() -> None:
    rng = random.Random(3)
    tasks = [
        task(n, aid(k), hours=n) for n, k in [(1, "a"), (2, "b"), (3, "a"), (4, "c"), (5, "b")]
    ]
    assignments = [("a", days(4)), ("b", days(2)), ("c", days(9))]
    capacities = [("a", 6), ("b", 2)]
    baseline = run(tasks, assignments=assignments, capacities=capacities)
    assert baseline == run(tasks, assignments=assignments, capacities=capacities)
    for _ in range(10):
        shuffled = list(tasks)
        rng.shuffle(shuffled)
        assert run(shuffled, assignments=assignments, capacities=capacities) == baseline


def test_risk_signals_are_ordered_by_deadline() -> None:
    result = run(
        [task(1, aid("later")), task(2, aid("sooner"))],
        assignments=[("later", days(8)), ("sooner", days(2))],
    )
    assert [i.assignment.id for i in result.assignment_risks] == [aid("sooner"), aid("later")]


# --- policies and independence ------------------------------------------------------------------


def test_the_injected_policies_are_honoured() -> None:
    from fractions import Fraction

    strict = RiskPolicy(engine_version=5, low_slack_ratio=Fraction(2))  # needs 200% spare capacity
    lenient_unknown = RecommendationPolicy(engine_version=9, unknown_risk_treated_as=L)
    result = run(
        [task(1, aid("a"), hours=1)],
        assignments=[("a", days(3))],
        capacities=[("a", 2)],
        risk_policy=strict,
        recommendation_policy=lenient_unknown,
    )
    assert risk_of(result, "a").level is M
    assert risk_of(result, "a").engine_version == 5
    assert recommended(result).engine_version == 9


def test_the_use_case_depends_on_the_port_not_on_the_mock_or_infrastructure() -> None:
    source = inspect.getsource(use_case_module)
    assert "infrastructure" not in source
    assert "MockLMSProvider" not in source
    assert "datetime.now" not in source and "date.today" not in source

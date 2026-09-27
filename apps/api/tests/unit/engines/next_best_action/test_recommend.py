"""Specification of Next Best Action v0 (written before the engine).

Ranking is an ordered comparison, not a weighted score. Among tasks that are not completed, the
best is the first under this order (each step only matters when all earlier steps tie):

  1. assignment risk tier: HIGH, then MEDIUM (UNKNOWN is ordered as the policy's tier, MEDIUM by
     default), then LOW
  2. earlier assignment deadline
  3. in-progress before not-started
  4. lower assignment id, then lower task id (a stable, arbitrary-but-reproducible tie-break)

Reason codes and evidence explain the choice; there is no natural-language output and no
``risk_if_deferred`` in v0. Thresholds and tiers are unvalidated MVP heuristics.
"""

import itertools
import random
from collections.abc import Iterator
from dataclasses import dataclass, replace
from datetime import datetime, timedelta, timezone

import pytest

from haui_compass.domain.recommendations.candidate import ActionCandidate
from haui_compass.domain.recommendations.policy import (
    DEFAULT_RECOMMENDATION_POLICY,
    RecommendationPolicy,
)
from haui_compass.domain.recommendations.recommendation import (
    NextBestActionResult,
    NoRecommendation,
    NoRecommendationReason,
    RankingDimension,
    Recommendation,
    RecommendationReasonCode,
)
from haui_compass.domain.risk.signal import RiskLevel
from haui_compass.domain.shared.errors import DomainValidationError
from haui_compass.domain.tasks.task import TaskStatus
from haui_compass.engines.next_best_action.recommend import recommend_next_action
from support.builders import NOW, make_assignment, make_candidate, make_risk, make_task, task_id

L, M, H, U = RiskLevel.LOW, RiskLevel.MEDIUM, RiskLevel.HIGH, RiskLevel.UNKNOWN
DONE, STARTED, TODO = TaskStatus.COMPLETED, TaskStatus.IN_PROGRESS, TaskStatus.NOT_STARTED
Reason = RecommendationReasonCode


def days(n: float) -> datetime:
    return NOW + timedelta(days=n)


def recommend(
    candidates: list[ActionCandidate],
    *,
    now: datetime = NOW,
    policy: RecommendationPolicy = DEFAULT_RECOMMENDATION_POLICY,
) -> NextBestActionResult:
    return recommend_next_action(candidates, now=now, policy=policy)


def pick(candidates: list[ActionCandidate], **kwargs: object) -> Recommendation:
    result = recommend(candidates, **kwargs)  # type: ignore[arg-type]
    assert isinstance(result, Recommendation), result
    return result


def winner_of(*candidates: ActionCandidate) -> int:
    """Task id (as int) chosen from the candidates, trying both input orders."""
    forward = pick(list(candidates)).task_id.int
    backward = pick(list(reversed(candidates))).task_id.int
    assert forward == backward, "result depends on input order"
    return forward


# --- eligibility and the empty state --------------------------------------------------------


def test_no_candidates_is_a_typed_no_recommendation() -> None:
    result = recommend([])
    assert isinstance(result, NoRecommendation)
    assert result.reason is NoRecommendationReason.NO_ACTIONABLE_TASKS
    assert result.as_of == NOW
    assert result.engine_version == 1


def test_only_completed_tasks_means_no_recommendation() -> None:
    result = recommend([make_candidate(1, status=DONE), make_candidate(2, status=DONE)])
    assert isinstance(result, NoRecommendation)
    assert result.reason is NoRecommendationReason.NO_ACTIONABLE_TASKS


def test_a_completed_task_is_never_selected_even_if_it_would_otherwise_win() -> None:
    finished_urgent = make_candidate(1, level=H, deadline=days(-1), status=DONE)
    open_relaxed = make_candidate(2, level=L, deadline=days(30))
    assert winner_of(finished_urgent, open_relaxed) == 2


def test_a_single_actionable_task_is_selected() -> None:
    r = pick([make_candidate(1, level=L), make_candidate(2, status=DONE)])
    assert r.task_id == task_id(1)
    assert r.reason_codes == (Reason.ONLY_ACTIONABLE_TASK,)
    assert r.evidence.deciding_dimension is RankingDimension.ONLY_CANDIDATE
    assert r.evidence.eligible_candidate_count == 1


def test_a_single_risky_task_reports_both_risk_and_that_it_is_the_only_one() -> None:
    r = pick([make_candidate(1, level=H)])
    assert r.reason_codes == (Reason.HIGH_ASSIGNMENT_RISK, Reason.ONLY_ACTIONABLE_TASK)


# --- 1. risk tier ------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("higher", "lower"),
    [(H, M), (H, L), (M, L), (H, U), (U, L)],
    ids=["high>medium", "high>low", "medium>low", "high>unknown", "unknown>low"],
)
def test_higher_risk_beats_otherwise_equivalent_lower_risk(
    higher: RiskLevel, lower: RiskLevel
) -> None:
    a = make_candidate(1, level=lower, deadline=days(3))
    b = make_candidate(2, level=higher, deadline=days(3))
    assert winner_of(a, b) == 2


def test_risk_outranks_deadline() -> None:
    relaxed_soon = make_candidate(1, level=L, deadline=days(1))
    risky_later = make_candidate(2, level=H, deadline=days(20))
    assert winner_of(relaxed_soon, risky_later) == 2


@pytest.mark.parametrize(
    ("level", "code"),
    [
        (H, Reason.HIGH_ASSIGNMENT_RISK),
        (M, Reason.MEDIUM_ASSIGNMENT_RISK),
        (U, Reason.UNKNOWN_ASSIGNMENT_RISK),
    ],
)
def test_the_risk_reason_is_reported_and_leads(
    level: RiskLevel, code: RecommendationReasonCode
) -> None:
    r = pick([make_candidate(1, level=level), make_candidate(2, level=L, deadline=days(9))])
    assert r.reason_codes[0] is code
    assert r.evidence.risk_level is level


def test_low_risk_has_no_risk_reason() -> None:
    r = pick(
        [make_candidate(1, level=L, deadline=days(1)), make_candidate(2, level=L, deadline=days(2))]
    )
    assert r.reason_codes == (Reason.EARLIEST_DEADLINE,)


# --- UNKNOWN risk -------------------------------------------------------------------------------


def test_unknown_risk_is_never_treated_as_low() -> None:
    unknown_later = make_candidate(1, level=U, deadline=days(10))
    low_sooner = make_candidate(2, level=L, deadline=days(1))
    assert winner_of(unknown_later, low_sooner) == 1


def test_unknown_risk_does_not_outrank_known_high_risk() -> None:
    unknown_sooner = make_candidate(1, level=U, deadline=days(1))
    high_later = make_candidate(2, level=H, deadline=days(9))
    assert winner_of(unknown_sooner, high_later) == 2


def test_by_default_unknown_shares_the_medium_tier_so_the_deadline_decides() -> None:
    unknown_later = make_candidate(1, level=U, deadline=days(5))
    medium_sooner = make_candidate(2, level=M, deadline=days(2))
    assert winner_of(unknown_later, medium_sooner) == 2
    unknown_sooner = make_candidate(3, level=U, deadline=days(2))
    medium_later = make_candidate(4, level=M, deadline=days(5))
    assert winner_of(unknown_sooner, medium_later) == 3


def test_the_unknown_tier_is_a_policy_choice() -> None:
    unknown_later = make_candidate(1, level=U, deadline=days(9))
    medium_sooner = make_candidate(2, level=M, deadline=days(1))
    as_high = RecommendationPolicy(engine_version=2, unknown_risk_treated_as=H)
    as_low = RecommendationPolicy(engine_version=3, unknown_risk_treated_as=L)
    assert pick([unknown_later, medium_sooner], policy=as_high).task_id == task_id(1)
    assert pick([unknown_later, medium_sooner], policy=as_low).task_id == task_id(2)


def test_the_result_reports_the_real_unknown_level_not_the_ordering_tier() -> None:
    r = pick([make_candidate(1, level=U), make_candidate(2, level=L, deadline=days(9))])
    assert r.evidence.risk_level is U
    assert r.reason_codes[0] is Reason.UNKNOWN_ASSIGNMENT_RISK


def test_the_engine_version_comes_from_the_policy() -> None:
    policy = RecommendationPolicy(engine_version=7, unknown_risk_treated_as=M)
    assert pick([make_candidate(1)], policy=policy).engine_version == 7
    empty = recommend([], policy=policy)
    assert isinstance(empty, NoRecommendation) and empty.engine_version == 7


# --- 2. deadline --------------------------------------------------------------------------------


@pytest.mark.parametrize("level", [L, M, H, U])
def test_within_a_risk_tier_the_earlier_deadline_wins(level: RiskLevel) -> None:
    sooner = make_candidate(1, level=level, deadline=days(2))
    later = make_candidate(2, level=level, deadline=days(5))
    assert winner_of(later, sooner) == 1


def test_earlier_deadline_is_reported() -> None:
    r = pick([make_candidate(1, deadline=days(5)), make_candidate(2, deadline=days(2))])
    assert r.task_id == task_id(2)
    assert r.reason_codes == (Reason.EARLIEST_DEADLINE,)
    assert r.evidence.deciding_dimension is RankingDimension.DEADLINE


def test_an_overdue_task_is_ranked_by_its_deadline_like_any_other() -> None:
    overdue = make_candidate(1, level=H, deadline=days(-2))
    upcoming = make_candidate(2, level=H, deadline=days(1))
    r = pick([upcoming, overdue])
    assert r.task_id == task_id(1)
    assert r.evidence.time_until_deadline == timedelta(days=-2)


def test_deadlines_that_are_equal_do_not_decide() -> None:
    a = make_candidate(1, deadline=days(3), status=TODO)
    b = make_candidate(2, deadline=days(3), status=STARTED)
    r = pick([a, b])
    assert r.task_id == task_id(2)  # decided by the next step: status
    assert r.evidence.deciding_dimension is RankingDimension.STATUS


# --- 3. status ----------------------------------------------------------------------------------


def test_an_in_progress_task_beats_a_not_started_one_when_everything_else_ties() -> None:
    todo = make_candidate(1, status=TODO)
    started = make_candidate(2, status=STARTED)
    assert winner_of(todo, started) == 2
    r = pick([todo, started])
    assert Reason.CONTINUE_IN_PROGRESS_TASK in r.reason_codes


def test_in_progress_does_not_override_earlier_deadline_or_higher_risk() -> None:
    started_later = make_candidate(1, deadline=days(6), status=STARTED)
    todo_sooner = make_candidate(2, deadline=days(2), status=TODO)
    assert winner_of(started_later, todo_sooner) == 2
    started_safe = make_candidate(3, level=L, status=STARTED)
    todo_risky = make_candidate(4, level=H, status=TODO)
    assert winner_of(started_safe, todo_risky) == 4


def test_tasks_of_one_assignment_share_its_risk_and_deadline() -> None:
    a1 = make_candidate(1, 10, level=H, deadline=days(2), status=TODO)
    a2 = make_candidate(2, 10, level=H, deadline=days(2), status=STARTED)
    assert winner_of(a1, a2) == 2


# --- 4. stable tie-break ------------------------------------------------------------------------


def test_full_ties_are_broken_by_assignment_id_then_task_id() -> None:
    assert winner_of(make_candidate(5, 20), make_candidate(6, 10)) == 6  # lower assignment id
    assert winner_of(make_candidate(9, 10), make_candidate(8, 10)) == 8  # same assignment: task id


def test_a_full_tie_says_so() -> None:
    r = pick([make_candidate(1), make_candidate(2)])
    assert r.reason_codes == (Reason.STABLE_TIE_BREAK,)
    assert r.evidence.deciding_dimension is RankingDimension.STABLE_ORDER


def test_input_order_never_changes_the_result() -> None:
    pool = [
        make_candidate(1, level=M, deadline=days(3)),
        make_candidate(2, level=M, deadline=days(3), status=STARTED),
        make_candidate(3, level=H, deadline=days(9)),
        make_candidate(4, level=L, deadline=days(1)),
    ]
    results = {pick(list(p)) for p in itertools.permutations(pool)}
    assert len(results) == 1


def test_accepts_any_iterable() -> None:
    def generate() -> Iterator[ActionCandidate]:
        yield make_candidate(1, deadline=days(4))
        yield make_candidate(2, deadline=days(2))

    result = recommend_next_action(generate(), now=NOW)
    assert isinstance(result, Recommendation) and result.task_id == task_id(2)


def test_the_same_input_gives_the_same_output() -> None:
    pool = [make_candidate(1, level=M), make_candidate(2, level=H, deadline=days(2))]
    assert recommend(pool) == recommend(pool)


# --- evidence and metadata ----------------------------------------------------------------------


def test_evidence_exposes_the_facts_behind_the_choice() -> None:
    chosen = make_candidate(1, level=H, deadline=days(2), status=STARTED, minutes=90)
    r = pick([chosen, make_candidate(2, level=L, deadline=days(9)), make_candidate(3, status=DONE)])
    e = r.evidence
    assert r.task_id == task_id(1) and r.as_of == NOW
    assert e.deadline == days(2)
    assert e.time_until_deadline == timedelta(days=2)
    assert e.estimated_duration == timedelta(minutes=90)
    assert e.task_status is STARTED
    assert e.risk_level is H
    assert e.risk_reason_codes == chosen.risk.reason_codes
    assert e.risk_engine_version == 1
    assert e.eligible_candidate_count == 2  # the completed task is not eligible
    assert e.deciding_dimension is RankingDimension.RISK


def test_the_deciding_dimension_is_the_first_step_that_separates_first_and_second() -> None:
    assert (
        pick([make_candidate(1, level=H), make_candidate(2, level=L)]).evidence.deciding_dimension
        is RankingDimension.RISK
    )
    assert (
        pick(
            [make_candidate(1, deadline=days(1)), make_candidate(2, deadline=days(2))]
        ).evidence.deciding_dimension
        is RankingDimension.DEADLINE
    )
    assert (
        pick([make_candidate(1, status=STARTED), make_candidate(2)]).evidence.deciding_dimension
        is RankingDimension.STATUS
    )


def test_result_is_immutable() -> None:
    r = pick([make_candidate(1)])
    with pytest.raises(AttributeError):
        r.engine_version = 2  # type: ignore[misc]


# --- time handling -------------------------------------------------------------------------------


def test_timezone_offsets_do_not_change_the_result() -> None:
    hanoi = timezone(timedelta(hours=7))
    utc_pool = [make_candidate(1, deadline=days(4)), make_candidate(2, deadline=days(2))]
    local_pool = [
        ActionCandidate(
            task=c.task,
            assignment=replace(c.assignment, deadline=c.assignment.deadline.astimezone(hanoi)),
            risk=c.risk,
        )
        for c in utc_pool
    ]
    assert pick(local_pool, now=NOW.astimezone(hanoi)) == pick(utc_pool)


def test_naive_now_is_rejected() -> None:
    with pytest.raises(DomainValidationError, match="timezone-aware"):
        recommend([make_candidate(1)], now=datetime(2026, 10, 5, 8, 0))


def test_duplicate_task_ids_are_rejected() -> None:
    with pytest.raises(DomainValidationError, match="duplicate"):
        recommend([make_candidate(1), make_candidate(1)])


# --- invariants over random inputs (seeded, stdlib only) -----------------------------------------


@dataclass(frozen=True)
class Spec:
    """Per-assignment risk/deadline plus tasks; tasks of one assignment share both."""

    assignments: dict[int, tuple[RiskLevel, float]]  # assignment -> (level, deadline in days)
    tasks: tuple[tuple[int, int, TaskStatus], ...]  # (task, assignment, status)


def build(spec: Spec) -> list[ActionCandidate]:
    out: list[ActionCandidate] = []
    for task_n, assignment_n, status in spec.tasks:
        level, deadline_days = spec.assignments[assignment_n]
        assignment = make_assignment(assignment_n, deadline=days(deadline_days))
        out.append(
            ActionCandidate(
                task=make_task(task_n, assignment_n, status=status),
                assignment=assignment,
                risk=make_risk(assignment_n, level, deadline=assignment.deadline),
            )
        )
    return out


def random_spec(rng: random.Random) -> Spec:
    assignments = {
        n: (rng.choice([L, M, H, U]), float(rng.randint(-3, 20)))
        for n in range(1, rng.randint(2, 4) + 1)
    }
    tasks = tuple(
        (t, rng.choice(list(assignments)), rng.choice([DONE, STARTED, TODO]))
        for t in range(1, rng.randint(1, 9) + 1)
    )
    return Spec(assignments, tasks)


def winner_task(spec: Spec) -> int | None:
    result = recommend(build(spec))
    return result.task_id.int if isinstance(result, Recommendation) else None


@pytest.mark.parametrize("seed", range(80))
def test_result_is_independent_of_order_and_never_completed(seed: int) -> None:
    rng = random.Random(seed)
    spec = random_spec(rng)
    candidates = build(spec)
    shuffled = list(candidates)
    rng.shuffle(shuffled)
    result = recommend(candidates)
    assert result == recommend(shuffled)
    open_tasks = [t for t in spec.tasks if t[2] is not DONE]
    if not open_tasks:
        assert isinstance(result, NoRecommendation)
    else:
        assert isinstance(result, Recommendation)
        assert result.evidence.task_status is not DONE
        assert result.evidence.eligible_candidate_count == len(open_tasks)


@pytest.mark.parametrize("seed", range(80))
def test_raising_the_winners_risk_keeps_it_the_winner(seed: int) -> None:
    spec = random_spec(random.Random(seed))
    winner = winner_task(spec)
    if winner is None:
        return
    assignment_n = next(a for t, a, _ in spec.tasks if t == winner)
    _, deadline_days = spec.assignments[assignment_n]
    raised = Spec({**spec.assignments, assignment_n: (H, deadline_days)}, spec.tasks)
    assert winner_task(raised) == winner


@pytest.mark.parametrize("seed", range(80))
def test_moving_the_winners_deadline_earlier_keeps_it_the_winner(seed: int) -> None:
    spec = random_spec(random.Random(seed))
    winner = winner_task(spec)
    if winner is None:
        return
    assignment_n = next(a for t, a, _ in spec.tasks if t == winner)
    level, deadline_days = spec.assignments[assignment_n]
    earlier = Spec({**spec.assignments, assignment_n: (level, deadline_days - 5)}, spec.tasks)
    assert winner_task(earlier) == winner


@pytest.mark.parametrize("seed", range(80))
def test_removing_a_losing_candidate_does_not_change_the_winner(seed: int) -> None:
    rng = random.Random(seed)
    spec = random_spec(rng)
    winner = winner_task(spec)
    others = [t for t in spec.tasks if t[0] != winner]
    if winner is None or not others:
        return
    dropped = rng.choice(others)
    reduced = Spec(spec.assignments, tuple(t for t in spec.tasks if t != dropped))
    assert winner_task(reduced) == winner


@pytest.mark.parametrize("seed", range(80))
def test_completing_the_recommended_task_removes_it_from_eligibility(seed: int) -> None:
    spec = random_spec(random.Random(seed))
    winner = winner_task(spec)
    if winner is None:
        return
    completed = Spec(
        spec.assignments,
        tuple((t, a, DONE if t == winner else s) for t, a, s in spec.tasks),
    )
    assert winner_task(completed) != winner

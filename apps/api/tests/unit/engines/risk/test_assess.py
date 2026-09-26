"""Specification of Risk Engine v0 (written before the engine).

Risk v0 answers one question: given the work remaining and the capacity available before this
deadline, how constrained is this assignment? It is a deterministic rule-based assessment, not a
probability. The thresholds are unvalidated MVP heuristics (see ``RiskPolicy``).

Decision order, first match wins:
  1. no open tasks                     -> LOW      NO_REMAINING_WORK
  2. deadline <= now                   -> HIGH     DEADLINE_PASSED
  3. effort or capacity unknown        -> UNKNOWN  MISSING_EFFORT_ESTIMATE / MISSING_CAPACITY
  4. capacity == 0 and effort > 0      -> HIGH     NO_CAPACITY_BEFORE_DEADLINE
  5. effort > capacity (slack < 0)     -> HIGH     EFFORT_EXCEEDS_CAPACITY
  6. slack < low_slack_ratio * effort  -> MEDIUM   LOW_SLACK
  7. otherwise                         -> LOW      SUFFICIENT_SLACK
"""

import random
from datetime import UTC, datetime, timedelta, timezone
from fractions import Fraction
from uuid import UUID

import pytest

from haui_compass.domain.assignments.assignment import AssignmentId
from haui_compass.domain.risk.context import AssignmentRiskContext
from haui_compass.domain.risk.policy import DEFAULT_RISK_POLICY, RiskPolicy
from haui_compass.domain.risk.signal import RiskLevel, RiskReasonCode, RiskSignal
from haui_compass.engines.risk.assess import assess_assignment_risk

MINUTE = timedelta(minutes=1)
HOUR = timedelta(hours=1)
NOW = datetime(2026, 10, 5, 8, 0, tzinfo=UTC)
DEADLINE = NOW + timedelta(days=2)
ASSIGNMENT_ID = AssignmentId(UUID(int=2))

R = RiskReasonCode
L = RiskLevel


def assess(
    *,
    effort: timedelta | None = 3 * HOUR,
    capacity: timedelta | None = 5 * HOUR,
    open_tasks: int = 2,
    now: datetime = NOW,
    deadline: datetime = DEADLINE,
    policy: RiskPolicy = DEFAULT_RISK_POLICY,
) -> RiskSignal:
    return assess_assignment_risk(
        AssignmentRiskContext(
            assignment_id=ASSIGNMENT_ID,
            now=now,
            deadline=deadline,
            open_task_count=open_tasks,
            remaining_effort=effort,
            available_capacity_until_deadline=capacity,
        ),
        policy,
    )


# --- 1. nothing left to do -------------------------------------------------------------------


@pytest.mark.parametrize(
    ("effort", "capacity", "deadline"),
    [
        (timedelta(0), 5 * HOUR, DEADLINE),
        (None, None, DEADLINE),
        (timedelta(0), timedelta(0), DEADLINE),
        (timedelta(0), 5 * HOUR, NOW - 3 * HOUR),
        (timedelta(0), 5 * HOUR, NOW),
    ],
    ids=["normal", "unknown-inputs", "zero-capacity", "deadline-passed", "at-deadline"],
)
def test_no_open_tasks_is_low_whatever_else_is_true(
    effort: timedelta | None, capacity: timedelta | None, deadline: datetime
) -> None:
    signal = assess(open_tasks=0, effort=effort, capacity=capacity, deadline=deadline)
    assert signal.level is L.LOW
    assert signal.reason_codes == (R.NO_REMAINING_WORK,)


# --- 2. deadline passed ------------------------------------------------------------------------


@pytest.mark.parametrize(
    "deadline",
    [NOW - timedelta(days=3), NOW - MINUTE, NOW],
    ids=["days-ago", "minute-ago", "exactly-now"],
)
def test_unfinished_work_past_the_deadline_is_high(deadline: datetime) -> None:
    signal = assess(deadline=deadline)
    assert signal.level is L.HIGH
    assert signal.reason_codes == (R.DEADLINE_PASSED,)


def test_passed_deadline_is_high_even_when_inputs_are_unknown() -> None:
    signal = assess(deadline=NOW - HOUR, effort=None, capacity=None)
    assert signal.level is L.HIGH
    assert signal.reason_codes == (R.DEADLINE_PASSED,)


def test_one_minute_before_the_deadline_it_has_not_passed() -> None:
    assert assess(deadline=NOW + MINUTE).reason_codes != (R.DEADLINE_PASSED,)


# --- 3. missing information is UNKNOWN, never low risk ----------------------------------------


def test_missing_effort_estimate_is_unknown() -> None:
    signal = assess(effort=None)
    assert signal.level is L.UNKNOWN
    assert signal.reason_codes == (R.MISSING_EFFORT_ESTIMATE,)


def test_missing_capacity_is_unknown() -> None:
    signal = assess(capacity=None)
    assert signal.level is L.UNKNOWN
    assert signal.reason_codes == (R.MISSING_CAPACITY,)


def test_both_missing_reports_both_reasons() -> None:
    signal = assess(effort=None, capacity=None)
    assert signal.level is L.UNKNOWN
    assert signal.reason_codes == (R.MISSING_EFFORT_ESTIMATE, R.MISSING_CAPACITY)


def test_unknown_effort_is_not_treated_as_zero() -> None:
    assert assess(effort=None).level is not assess(effort=timedelta(0)).level


# --- 4-7. slack ---------------------------------------------------------------------------------


def test_no_capacity_before_the_deadline_is_high() -> None:
    signal = assess(effort=HOUR, capacity=timedelta(0))
    assert signal.level is L.HIGH
    assert signal.reason_codes == (R.NO_CAPACITY_BEFORE_DEADLINE,)


def test_effort_greater_than_capacity_is_high() -> None:
    signal = assess(effort=5 * HOUR, capacity=3 * HOUR)
    assert signal.level is L.HIGH
    assert signal.reason_codes == (R.EFFORT_EXCEEDS_CAPACITY,)
    assert signal.evidence.slack == -2 * HOUR


def test_effort_exactly_equal_to_capacity_fits_but_is_tight() -> None:
    signal = assess(effort=5 * HOUR, capacity=5 * HOUR)
    assert signal.level is L.MEDIUM
    assert signal.reason_codes == (R.LOW_SLACK,)
    assert signal.evidence.slack == timedelta(0)


def test_plenty_of_slack_is_low() -> None:
    signal = assess(effort=3 * HOUR, capacity=5 * HOUR)
    assert signal.level is L.LOW
    assert signal.reason_codes == (R.SUFFICIENT_SLACK,)
    assert signal.evidence.slack == 2 * HOUR


@pytest.mark.parametrize(
    ("capacity", "level"),
    [
        (4 * HOUR + 59 * MINUTE, L.MEDIUM),  # 59 min spare of 240 min work: just under 25%
        (5 * HOUR, L.LOW),  # exactly 25% spare: the boundary belongs to LOW
        (5 * HOUR + MINUTE, L.LOW),
        (4 * HOUR, L.MEDIUM),  # zero spare
        (4 * HOUR - MINUTE, L.HIGH),  # one minute short
    ],
    ids=["just-under", "exactly-25pct", "just-over", "zero-slack", "one-minute-short"],
)
def test_slack_threshold_boundary_for_four_hours_of_work(
    capacity: timedelta, level: RiskLevel
) -> None:
    assert assess(effort=4 * HOUR, capacity=capacity).level is level


def test_zero_effort_with_open_tasks_takes_the_estimate_literally() -> None:
    signal = assess(effort=timedelta(0), capacity=5 * HOUR)
    assert signal.level is L.LOW
    assert signal.reason_codes == (R.SUFFICIENT_SLACK,)
    assert signal.evidence.slack_ratio is None


def test_zero_effort_and_zero_capacity_still_fits() -> None:
    assert assess(effort=timedelta(0), capacity=timedelta(0)).level is L.LOW


# --- policy ---------------------------------------------------------------------------------------


def test_the_threshold_comes_from_the_policy() -> None:
    # 4h of work with 5h available is exactly 25% spare
    assert assess(effort=4 * HOUR, capacity=5 * HOUR).level is L.LOW
    strict = RiskPolicy(engine_version=2, low_slack_ratio=Fraction(1, 2))
    assert assess(effort=4 * HOUR, capacity=5 * HOUR, policy=strict).level is L.MEDIUM


def test_the_signal_records_the_policy_version() -> None:
    assert assess().engine_version == 1
    assert (
        assess(policy=RiskPolicy(engine_version=7, low_slack_ratio=Fraction(1, 3))).engine_version
        == 7
    )


# --- evidence and metadata ------------------------------------------------------------------------


def test_evidence_exposes_the_numbers_behind_the_level() -> None:
    e = assess(effort=3 * HOUR, capacity=5 * HOUR, open_tasks=2).evidence
    assert e.deadline == DEADLINE
    assert e.time_until_deadline == timedelta(days=2)
    assert e.open_task_count == 2
    assert e.remaining_effort == 3 * HOUR
    assert e.available_capacity == 5 * HOUR
    assert e.slack == 2 * HOUR
    assert e.slack_ratio == pytest.approx(2 / 3)


def test_slack_is_not_defined_once_the_deadline_has_passed() -> None:
    e = assess(deadline=NOW - HOUR).evidence
    assert e.time_until_deadline == -HOUR
    assert e.slack is None
    assert e.slack_ratio is None


def test_slack_is_not_defined_when_an_input_is_unknown() -> None:
    assert assess(effort=None).evidence.slack is None
    assert assess(capacity=None).evidence.slack is None


def test_signal_identifies_assignment_and_time() -> None:
    signal = assess()
    assert signal.assignment_id == ASSIGNMENT_ID
    assert signal.as_of == NOW


def test_timezone_offsets_do_not_change_the_result() -> None:
    hanoi = timezone(timedelta(hours=7))
    utc_signal = assess()
    local_signal = assess(now=NOW.astimezone(hanoi), deadline=DEADLINE.astimezone(hanoi))
    assert local_signal == utc_signal
    assert local_signal.as_of.utcoffset() == timedelta(0)


def test_naive_datetimes_are_rejected() -> None:
    with pytest.raises(ValueError, match="timezone-aware"):
        assess(now=datetime(2026, 10, 5, 8, 0))


def test_same_input_gives_same_output() -> None:
    assert assess() == assess()


# --- invariants over random inputs (seeded, stdlib only) --------------------------------------


def known_context_args(rng: random.Random) -> tuple[timedelta, timedelta, timedelta]:
    effort = rng.randint(1, 600) * MINUTE
    capacity = rng.randint(0, 900) * MINUTE
    until_deadline = rng.randint(1, 20_000) * MINUTE
    return effort, capacity, until_deadline


def severity(signal: RiskSignal) -> int:
    value = signal.level.severity
    assert value is not None, f"unexpected UNKNOWN: {signal}"
    return value


@pytest.mark.parametrize("seed", range(60))
def test_more_remaining_work_never_lowers_risk(seed: int) -> None:
    rng = random.Random(seed)
    effort, capacity, until = known_context_args(rng)
    extra = rng.randint(1, 300) * MINUTE
    base = assess(effort=effort, capacity=capacity, deadline=NOW + until)
    more = assess(effort=effort + extra, capacity=capacity, deadline=NOW + until)
    assert severity(more) >= severity(base)


@pytest.mark.parametrize("seed", range(60))
def test_less_available_capacity_never_lowers_risk(seed: int) -> None:
    rng = random.Random(seed)
    effort, capacity, until = known_context_args(rng)
    less = timedelta(minutes=rng.randint(0, int(capacity / MINUTE)))
    base = assess(effort=effort, capacity=capacity, deadline=NOW + until)
    reduced = assess(effort=effort, capacity=less, deadline=NOW + until)
    assert severity(reduced) >= severity(base)


@pytest.mark.parametrize("seed", range(60))
def test_a_later_deadline_never_raises_risk_by_itself(seed: int) -> None:
    rng = random.Random(seed)
    effort, capacity, _ = known_context_args(rng)
    first = NOW + rng.randint(-2_000, 5_000) * MINUTE  # may already be in the past
    later = first + rng.randint(1, 5_000) * MINUTE
    early_signal = assess(effort=effort, capacity=capacity, deadline=first)
    late_signal = assess(effort=effort, capacity=capacity, deadline=later)
    assert severity(late_signal) <= severity(early_signal)


@pytest.mark.parametrize("seed", range(40))
def test_finished_work_never_reports_workload_risk(seed: int) -> None:
    rng = random.Random(seed)
    signal = assess(
        open_tasks=0,
        effort=rng.choice([None, timedelta(0)]),
        capacity=rng.choice([None, timedelta(0), rng.randint(1, 900) * MINUTE]),
        deadline=NOW + rng.randint(-2_000, 5_000) * MINUTE,
    )
    assert signal.level is L.LOW
    assert signal.reason_codes == (R.NO_REMAINING_WORK,)


@pytest.mark.parametrize("seed", range(60))
def test_complete_information_is_never_unknown_and_slack_is_consistent(seed: int) -> None:
    rng = random.Random(seed)
    effort, capacity, until = known_context_args(rng)
    signal = assess(effort=effort, capacity=capacity, deadline=NOW + until)
    assert signal.level is not L.UNKNOWN
    assert signal.evidence.slack == capacity - effort
    if signal.level is L.HIGH:
        assert capacity < effort

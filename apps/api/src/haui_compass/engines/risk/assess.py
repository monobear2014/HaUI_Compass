"""Risk Engine v0: how constrained is one assignment, given remaining effort and capacity?

A deterministic, rule-based assessment. It is not a machine-learning model and not a calibrated
probability of a late submission. The thresholds live in ``RiskPolicy`` and are unvalidated MVP
heuristics. Pure: no clock, I/O, or randomness; ``context.now`` is the only notion of time.
"""

from datetime import timedelta
from fractions import Fraction

from haui_compass.domain.risk.context import AssignmentRiskContext
from haui_compass.domain.risk.policy import DEFAULT_RISK_POLICY, RiskPolicy
from haui_compass.domain.risk.signal import RiskEvidence, RiskLevel, RiskReasonCode, RiskSignal

_MICROSECOND = timedelta(microseconds=1)


def assess_assignment_risk(
    context: AssignmentRiskContext, policy: RiskPolicy = DEFAULT_RISK_POLICY
) -> RiskSignal:
    """Assess one assignment. Rules apply in this order and the first match decides:

    1. no open tasks                       -> LOW      NO_REMAINING_WORK
    2. deadline <= now                     -> HIGH     DEADLINE_PASSED
    3. effort or capacity unknown          -> UNKNOWN  MISSING_EFFORT_ESTIMATE / MISSING_CAPACITY
    4. capacity is zero, effort > 0        -> HIGH     NO_CAPACITY_BEFORE_DEADLINE
    5. effort > capacity (negative slack)  -> HIGH     EFFORT_EXCEEDS_CAPACITY
    6. slack < low_slack_ratio * effort    -> MEDIUM   LOW_SLACK
    7. otherwise                           -> LOW      SUFFICIENT_SLACK

    ``deadline == now`` counts as passed: no time is left to do any work. Slack is capacity minus
    effort. The threshold in rule 6 is compared exactly (integer microseconds and ``Fraction``).
    """
    effort = context.remaining_effort
    capacity = context.available_capacity_until_deadline
    time_left = context.time_until_deadline
    deadline_passed = time_left <= timedelta(0)

    slack = capacity - effort if capacity is not None and effort is not None else None
    if deadline_passed:
        slack = None  # capacity "until" a deadline that has already gone by is meaningless
    slack_ratio = slack / effort if slack is not None and effort else None

    level, reasons = _classify(
        open_task_count=context.open_task_count,
        deadline_passed=deadline_passed,
        effort=effort,
        capacity=capacity,
        slack=slack,
        policy=policy,
    )
    return RiskSignal(
        assignment_id=context.assignment_id,
        as_of=context.now,
        level=level,
        reason_codes=reasons,
        evidence=RiskEvidence(
            deadline=context.deadline,
            time_until_deadline=time_left,
            open_task_count=context.open_task_count,
            remaining_effort=effort,
            available_capacity=capacity,
            slack=slack,
            slack_ratio=slack_ratio,
        ),
        engine_version=policy.engine_version,
    )


def _classify(
    *,
    open_task_count: int,
    deadline_passed: bool,
    effort: timedelta | None,
    capacity: timedelta | None,
    slack: timedelta | None,
    policy: RiskPolicy,
) -> tuple[RiskLevel, tuple[RiskReasonCode, ...]]:
    if open_task_count == 0:
        return RiskLevel.LOW, (RiskReasonCode.NO_REMAINING_WORK,)
    if deadline_passed:
        return RiskLevel.HIGH, (RiskReasonCode.DEADLINE_PASSED,)

    missing: list[RiskReasonCode] = []
    if effort is None:
        missing.append(RiskReasonCode.MISSING_EFFORT_ESTIMATE)
    if capacity is None:
        missing.append(RiskReasonCode.MISSING_CAPACITY)
    if missing or effort is None or capacity is None or slack is None:
        return RiskLevel.UNKNOWN, tuple(missing)

    if capacity == timedelta(0) and effort > timedelta(0):
        return RiskLevel.HIGH, (RiskReasonCode.NO_CAPACITY_BEFORE_DEADLINE,)
    if slack < timedelta(0):
        return RiskLevel.HIGH, (RiskReasonCode.EFFORT_EXCEEDS_CAPACITY,)
    if effort > timedelta(0):
        spare_share = Fraction(slack // _MICROSECOND, effort // _MICROSECOND)
        if spare_share < policy.low_slack_ratio:
            return RiskLevel.MEDIUM, (RiskReasonCode.LOW_SLACK,)
    return RiskLevel.LOW, (RiskReasonCode.SUFFICIENT_SLACK,)

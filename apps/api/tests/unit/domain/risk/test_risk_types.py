from datetime import UTC, datetime, timedelta, timezone
from fractions import Fraction
from uuid import UUID

import pytest

from haui_compass.domain.assignments.assignment import AssignmentId
from haui_compass.domain.risk.context import AssignmentRiskContext
from haui_compass.domain.risk.policy import DEFAULT_RISK_POLICY, RiskPolicy
from haui_compass.domain.risk.signal import RiskEvidence, RiskLevel, RiskReasonCode, RiskSignal
from haui_compass.domain.shared.errors import DomainValidationError

HOUR = timedelta(hours=1)
NOW = datetime(2026, 10, 5, 8, 0, tzinfo=UTC)
DEADLINE = NOW + timedelta(days=2)
ASSIGNMENT_ID = AssignmentId(UUID(int=2))


def context(**overrides: object) -> AssignmentRiskContext:
    values: dict[str, object] = {
        "assignment_id": ASSIGNMENT_ID,
        "now": NOW,
        "deadline": DEADLINE,
        "open_task_count": 2,
        "remaining_effort": 3 * HOUR,
        "available_capacity_until_deadline": 5 * HOUR,
    }
    values.update(overrides)
    return AssignmentRiskContext(**values)  # type: ignore[arg-type]


def evidence(**overrides: object) -> RiskEvidence:
    values: dict[str, object] = {
        "deadline": DEADLINE,
        "time_until_deadline": DEADLINE - NOW,
        "open_task_count": 2,
        "remaining_effort": 3 * HOUR,
        "available_capacity": 5 * HOUR,
        "slack": 2 * HOUR,
        "slack_ratio": 2 / 3,
    }
    values.update(overrides)
    return RiskEvidence(**values)  # type: ignore[arg-type]


def signal(**overrides: object) -> RiskSignal:
    values: dict[str, object] = {
        "assignment_id": ASSIGNMENT_ID,
        "as_of": NOW,
        "level": RiskLevel.LOW,
        "reason_codes": (RiskReasonCode.SUFFICIENT_SLACK,),
        "evidence": evidence(),
        "engine_version": 1,
    }
    values.update(overrides)
    return RiskSignal(**values)  # type: ignore[arg-type]


class TestRiskLevel:
    def test_known_levels_are_ordered_by_severity(self) -> None:
        assert RiskLevel.LOW.severity == 0
        assert RiskLevel.MEDIUM.severity == 1
        assert RiskLevel.HIGH.severity == 2

    def test_unknown_has_no_severity(self) -> None:
        assert RiskLevel.UNKNOWN.severity is None


class TestPolicy:
    def test_default_policy_is_version_one_with_a_quarter_threshold(self) -> None:
        assert DEFAULT_RISK_POLICY.engine_version == 1
        assert DEFAULT_RISK_POLICY.low_slack_ratio == Fraction(1, 4)

    def test_version_must_be_positive(self) -> None:
        with pytest.raises(DomainValidationError, match="engine_version"):
            RiskPolicy(engine_version=0, low_slack_ratio=Fraction(1, 4))

    @pytest.mark.parametrize("ratio", [Fraction(0), Fraction(-1, 4)])
    def test_threshold_must_be_positive(self, ratio: Fraction) -> None:
        with pytest.raises(DomainValidationError, match="low_slack_ratio"):
            RiskPolicy(engine_version=1, low_slack_ratio=ratio)


class TestContext:
    def test_holds_its_values(self) -> None:
        ctx = context()
        assert ctx.time_until_deadline == timedelta(days=2)
        assert ctx.remaining_effort == 3 * HOUR

    def test_time_until_deadline_is_negative_after_the_deadline(self) -> None:
        assert context(deadline=NOW - HOUR).time_until_deadline == -HOUR

    def test_naive_datetimes_are_rejected(self) -> None:
        with pytest.raises(DomainValidationError, match="timezone-aware"):
            context(now=datetime(2026, 10, 5, 8, 0))
        with pytest.raises(DomainValidationError, match="timezone-aware"):
            context(deadline=datetime(2026, 10, 7, 8, 0))

    def test_datetimes_are_normalised_to_utc(self) -> None:
        hanoi = timezone(timedelta(hours=7))
        ctx = context(now=datetime(2026, 10, 5, 15, 0, tzinfo=hanoi))
        assert ctx.now == NOW
        assert ctx.now.utcoffset() == timedelta(0)

    def test_unknown_effort_and_capacity_are_allowed_and_not_zero(self) -> None:
        ctx = context(remaining_effort=None, available_capacity_until_deadline=None)
        assert ctx.remaining_effort is None
        assert ctx.available_capacity_until_deadline is None

    @pytest.mark.parametrize("field", ["remaining_effort", "available_capacity_until_deadline"])
    def test_negative_durations_are_rejected(self, field: str) -> None:
        with pytest.raises(DomainValidationError, match="must not be negative"):
            context(**{field: -HOUR})

    def test_negative_open_task_count_is_rejected(self) -> None:
        with pytest.raises(DomainValidationError, match="must not be negative"):
            context(open_task_count=-1)

    def test_effort_without_open_tasks_is_inconsistent(self) -> None:
        with pytest.raises(DomainValidationError, match="no open tasks"):
            context(open_task_count=0, remaining_effort=HOUR)

    def test_no_open_tasks_with_zero_or_unknown_effort_is_fine(self) -> None:
        context(open_task_count=0, remaining_effort=timedelta(0))
        context(open_task_count=0, remaining_effort=None)


class TestSignal:
    def test_holds_its_values(self) -> None:
        s = signal()
        assert s.level is RiskLevel.LOW
        assert s.reason_codes == (RiskReasonCode.SUFFICIENT_SLACK,)
        assert s.engine_version == 1
        assert s.evidence.slack == 2 * HOUR

    def test_is_immutable(self) -> None:
        with pytest.raises(AttributeError):
            signal().level = RiskLevel.HIGH  # type: ignore[misc]

    def test_needs_at_least_one_reason(self) -> None:
        with pytest.raises(DomainValidationError, match="at least one reason"):
            signal(reason_codes=())

    def test_reasons_must_be_unique(self) -> None:
        with pytest.raises(DomainValidationError, match="unique"):
            signal(reason_codes=(RiskReasonCode.LOW_SLACK, RiskReasonCode.LOW_SLACK))

    def test_as_of_must_be_timezone_aware(self) -> None:
        with pytest.raises(DomainValidationError, match="timezone-aware"):
            signal(as_of=datetime(2026, 10, 5, 8, 0))

    def test_engine_version_must_be_positive(self) -> None:
        with pytest.raises(DomainValidationError, match="engine_version"):
            signal(engine_version=0)

    def test_evidence_rejects_negative_durations(self) -> None:
        with pytest.raises(DomainValidationError, match="must not be negative"):
            evidence(remaining_effort=-HOUR)

    def test_evidence_allows_negative_slack_and_unknown_values(self) -> None:
        e = evidence(slack=-2 * HOUR, slack_ratio=-0.5)
        assert e.slack == -2 * HOUR
        unknown = evidence(remaining_effort=None, available_capacity=None, slack=None)
        assert unknown.slack is None

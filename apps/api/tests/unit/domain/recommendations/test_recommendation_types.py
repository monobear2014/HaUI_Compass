from datetime import datetime, timedelta, timezone

import pytest

from haui_compass.domain.recommendations.candidate import ActionCandidate
from haui_compass.domain.recommendations.policy import (
    DEFAULT_RECOMMENDATION_POLICY,
    RecommendationPolicy,
)
from haui_compass.domain.recommendations.recommendation import (
    NoRecommendation,
    NoRecommendationReason,
    RankingDimension,
    Recommendation,
    RecommendationEvidence,
    RecommendationReasonCode,
)
from haui_compass.domain.risk.signal import RiskLevel, RiskReasonCode
from haui_compass.domain.shared.errors import DomainValidationError
from haui_compass.domain.tasks.task import TaskStatus
from support.builders import NOW, assignment_id, make_assignment, make_risk, make_task, task_id

DEADLINE = NOW + timedelta(days=2)


def evidence(**overrides: object) -> RecommendationEvidence:
    values: dict[str, object] = {
        "deadline": DEADLINE,
        "time_until_deadline": DEADLINE - NOW,
        "estimated_duration": timedelta(hours=1),
        "task_status": TaskStatus.NOT_STARTED,
        "risk_level": RiskLevel.HIGH,
        "risk_reason_codes": (RiskReasonCode.EFFORT_EXCEEDS_CAPACITY,),
        "risk_engine_version": 1,
        "eligible_candidate_count": 3,
        "deciding_dimension": RankingDimension.RISK,
    }
    values.update(overrides)
    return RecommendationEvidence(**values)  # type: ignore[arg-type]


def recommendation(**overrides: object) -> Recommendation:
    values: dict[str, object] = {
        "task_id": task_id(5),
        "assignment_id": assignment_id(2),
        "as_of": NOW,
        "reason_codes": (RecommendationReasonCode.HIGH_ASSIGNMENT_RISK,),
        "evidence": evidence(),
        "engine_version": 1,
    }
    values.update(overrides)
    return Recommendation(**values)  # type: ignore[arg-type]


class TestPolicy:
    def test_default_policy_orders_unknown_risk_like_medium(self) -> None:
        assert DEFAULT_RECOMMENDATION_POLICY.engine_version == 1
        assert DEFAULT_RECOMMENDATION_POLICY.unknown_risk_treated_as is RiskLevel.MEDIUM

    def test_version_must_be_positive(self) -> None:
        with pytest.raises(DomainValidationError, match="engine_version"):
            RecommendationPolicy(engine_version=0, unknown_risk_treated_as=RiskLevel.MEDIUM)

    def test_unknown_cannot_be_mapped_to_unknown(self) -> None:
        with pytest.raises(DomainValidationError, match="unknown_risk_treated_as"):
            RecommendationPolicy(engine_version=1, unknown_risk_treated_as=RiskLevel.UNKNOWN)


class TestCandidate:
    def test_holds_its_parts(self) -> None:
        task, assignment = make_task(5, 2), make_assignment(2, deadline=DEADLINE)
        risk = make_risk(2, RiskLevel.LOW, deadline=DEADLINE)
        candidate = ActionCandidate(task=task, assignment=assignment, risk=risk)
        assert (candidate.task, candidate.assignment, candidate.risk) == (task, assignment, risk)

    def test_task_must_belong_to_the_assignment(self) -> None:
        with pytest.raises(DomainValidationError, match="does not belong"):
            ActionCandidate(
                task=make_task(5, 3),
                assignment=make_assignment(2, deadline=DEADLINE),
                risk=make_risk(2, RiskLevel.LOW, deadline=DEADLINE),
            )

    def test_risk_must_be_for_the_same_assignment(self) -> None:
        with pytest.raises(DomainValidationError, match="different assignment"):
            ActionCandidate(
                task=make_task(5, 2),
                assignment=make_assignment(2, deadline=DEADLINE),
                risk=make_risk(9, RiskLevel.LOW, deadline=DEADLINE),
            )


class TestRecommendation:
    def test_holds_its_values(self) -> None:
        r = recommendation()
        assert r.task_id == task_id(5)
        assert r.evidence.deciding_dimension is RankingDimension.RISK
        assert r.engine_version == 1

    def test_is_immutable(self) -> None:
        with pytest.raises(AttributeError):
            recommendation().engine_version = 2  # type: ignore[misc]

    def test_needs_a_reason(self) -> None:
        with pytest.raises(DomainValidationError, match="at least one reason"):
            recommendation(reason_codes=())

    def test_reasons_must_be_unique(self) -> None:
        dup = (RecommendationReasonCode.EARLIEST_DEADLINE,) * 2
        with pytest.raises(DomainValidationError, match="unique"):
            recommendation(reason_codes=dup)

    def test_as_of_must_be_timezone_aware(self) -> None:
        with pytest.raises(DomainValidationError, match="timezone-aware"):
            recommendation(as_of=datetime(2026, 10, 5, 8, 0))

    def test_engine_version_must_be_positive(self) -> None:
        with pytest.raises(DomainValidationError, match="engine_version"):
            recommendation(engine_version=0)

    def test_evidence_needs_at_least_one_eligible_candidate(self) -> None:
        with pytest.raises(DomainValidationError, match="eligible_candidate_count"):
            evidence(eligible_candidate_count=0)

    def test_evidence_rejects_negative_duration(self) -> None:
        with pytest.raises(DomainValidationError, match="must not be negative"):
            evidence(estimated_duration=timedelta(minutes=-1))

    def test_evidence_deadline_is_normalised_to_utc(self) -> None:
        hanoi = timezone(timedelta(hours=7))
        e = evidence(deadline=DEADLINE.astimezone(hanoi))
        assert e.deadline == DEADLINE
        assert e.deadline.utcoffset() == timedelta(0)


class TestNoRecommendation:
    def test_holds_its_values(self) -> None:
        r = NoRecommendation(
            as_of=NOW, reason=NoRecommendationReason.NO_ACTIONABLE_TASKS, engine_version=1
        )
        assert r.reason is NoRecommendationReason.NO_ACTIONABLE_TASKS

    def test_as_of_must_be_timezone_aware(self) -> None:
        with pytest.raises(DomainValidationError, match="timezone-aware"):
            NoRecommendation(
                as_of=datetime(2026, 10, 5, 8, 0),
                reason=NoRecommendationReason.NO_ACTIONABLE_TASKS,
                engine_version=1,
            )

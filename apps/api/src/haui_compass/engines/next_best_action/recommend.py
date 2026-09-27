"""Next Best Action v0: choose the one task a student should do next.

Deterministic and rule-ordered. There is no weighted score, no learned ranking, no LLM, and no
calibrated behavioural model. Pure: the only notion of time is the explicit ``now``.
"""

from collections.abc import Iterable
from datetime import datetime
from uuid import UUID

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
    RecommendationEvidence,
    RecommendationReasonCode,
)
from haui_compass.domain.risk.signal import RiskLevel
from haui_compass.domain.shared.errors import DomainValidationError
from haui_compass.domain.shared.validation import require_aware_utc
from haui_compass.domain.tasks.task import TaskStatus

_RISK_TIER = {RiskLevel.LOW: 0, RiskLevel.MEDIUM: 1, RiskLevel.HIGH: 2}
_RISK_REASON = {
    RiskLevel.HIGH: RecommendationReasonCode.HIGH_ASSIGNMENT_RISK,
    RiskLevel.MEDIUM: RecommendationReasonCode.MEDIUM_ASSIGNMENT_RISK,
    RiskLevel.UNKNOWN: RecommendationReasonCode.UNKNOWN_ASSIGNMENT_RISK,
}
# Index in the sort key -> the comparison step it represents.
_DIMENSION_BY_KEY_INDEX = (
    RankingDimension.RISK,
    RankingDimension.DEADLINE,
    RankingDimension.STATUS,
    RankingDimension.STABLE_ORDER,  # assignment id
    RankingDimension.STABLE_ORDER,  # task id
)

_SortKey = tuple[int, datetime, int, UUID, UUID]


def recommend_next_action(
    candidates: Iterable[ActionCandidate],
    *,
    now: datetime,
    policy: RecommendationPolicy = DEFAULT_RECOMMENDATION_POLICY,
) -> NextBestActionResult:
    """Return the best actionable task, or ``NoRecommendation`` if there is none.

    Completed tasks are never eligible. Among the rest, the best is the first under this order,
    where each step only matters when every earlier step ties:

    1. assignment risk tier, highest first: HIGH, then MEDIUM, then LOW. ``UNKNOWN`` risk is
       ordered as ``policy.unknown_risk_treated_as`` (MEDIUM by default), never as safe.
    2. earlier assignment deadline first (an overdue deadline is simply the earliest)
    3. in-progress before not-started
    4. lower assignment id, then lower task id, so the result never depends on input order

    ``risk_if_deferred`` is intentionally not produced: it needs the capacity that would remain
    after a deferral, which requires a scheduling model that does not exist yet.
    """
    as_of = require_aware_utc(now, "now")
    all_candidates = list(candidates)
    task_ids = [c.task.id for c in all_candidates]
    if len(set(task_ids)) != len(task_ids):
        raise DomainValidationError("duplicate task ids among candidates")

    eligible = [c for c in all_candidates if c.task.status is not TaskStatus.COMPLETED]
    if not eligible:
        return NoRecommendation(
            as_of=as_of,
            reason=NoRecommendationReason.NO_ACTIONABLE_TASKS,
            engine_version=policy.engine_version,
        )

    ranked = sorted(eligible, key=lambda c: _sort_key(c, policy))
    winner = ranked[0]
    runner_up = ranked[1] if len(ranked) > 1 else None

    return Recommendation(
        task_id=winner.task.id,
        assignment_id=winner.assignment.id,
        as_of=as_of,
        reason_codes=_reason_codes(winner, eligible),
        evidence=RecommendationEvidence(
            deadline=winner.assignment.deadline,
            time_until_deadline=winner.assignment.deadline - as_of,
            estimated_duration=winner.task.estimated_duration,
            task_status=winner.task.status,
            risk_level=winner.risk.level,
            risk_reason_codes=winner.risk.reason_codes,
            risk_engine_version=winner.risk.engine_version,
            eligible_candidate_count=len(eligible),
            deciding_dimension=_deciding_dimension(winner, runner_up, policy),
        ),
        engine_version=policy.engine_version,
    )


def _sort_key(candidate: ActionCandidate, policy: RecommendationPolicy) -> _SortKey:
    level = candidate.risk.level
    if level is RiskLevel.UNKNOWN:
        level = policy.unknown_risk_treated_as
    in_progress = candidate.task.status is TaskStatus.IN_PROGRESS
    return (
        -_RISK_TIER[level],
        candidate.assignment.deadline,
        0 if in_progress else 1,
        candidate.assignment.id,
        candidate.task.id,
    )


def _deciding_dimension(
    winner: ActionCandidate, runner_up: ActionCandidate | None, policy: RecommendationPolicy
) -> RankingDimension:
    if runner_up is None:
        return RankingDimension.ONLY_CANDIDATE
    first, second = _sort_key(winner, policy), _sort_key(runner_up, policy)
    for index, dimension in enumerate(_DIMENSION_BY_KEY_INDEX):
        if first[index] != second[index]:
            return dimension
    raise AssertionError(
        "distinct tasks always differ in the final key element"
    )  # pragma: no cover


def _reason_codes(
    winner: ActionCandidate, eligible: list[ActionCandidate]
) -> tuple[RecommendationReasonCode, ...]:
    reasons: list[RecommendationReasonCode] = []
    if winner.risk.level in _RISK_REASON:
        reasons.append(_RISK_REASON[winner.risk.level])

    if len(eligible) == 1:
        reasons.append(RecommendationReasonCode.ONLY_ACTIONABLE_TASK)
    else:
        deadlines = [c.assignment.deadline for c in eligible]
        own = winner.assignment.deadline
        if own == min(deadlines) and max(deadlines) > own:
            reasons.append(RecommendationReasonCode.EARLIEST_DEADLINE)

    if winner.task.status is TaskStatus.IN_PROGRESS:
        reasons.append(RecommendationReasonCode.CONTINUE_IN_PROGRESS_TASK)
    if not reasons:
        # Several candidates tied on risk, deadline and status; only the id order separated them.
        reasons.append(RecommendationReasonCode.STABLE_TIE_BREAK)
    return tuple(reasons)

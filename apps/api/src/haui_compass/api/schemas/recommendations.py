from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field

from haui_compass.api.schemas.common import ApiModel, AssignmentCapacityDTO, ExternalRefDTO
from haui_compass.application.use_cases.daily_recommendation import DailyRecommendationResult


class DailyRecommendationRequest(ApiModel):
    student: ExternalRefDTO
    available_minutes: int = Field(ge=0)
    assignment_capacities: tuple[AssignmentCapacityDTO, ...] = ()


class RiskEvidenceDTO(ApiModel):
    deadline: datetime
    time_until_deadline_seconds: float
    open_task_count: int
    remaining_effort_seconds: float | None
    available_capacity_seconds: float | None
    slack_seconds: float | None
    slack_ratio: float | None


class AssignmentRiskDTO(ApiModel):
    assignment_id: UUID
    level: str
    reason_codes: tuple[str, ...]
    engine_version: int
    evidence: RiskEvidenceDTO


class RecommendationEvidenceDTO(ApiModel):
    deadline: datetime
    time_until_deadline_seconds: float
    estimated_duration_seconds: float
    task_status: str
    risk_level: str
    risk_reason_codes: tuple[str, ...]
    risk_engine_version: int
    eligible_candidate_count: int
    deciding_dimension: str


class RecommendationDTO(ApiModel):
    kind: Literal["recommendation"] = "recommendation"
    task_id: UUID
    assignment_id: UUID
    as_of: datetime
    reason_codes: tuple[str, ...]
    evidence: RecommendationEvidenceDTO
    engine_version: int


class NoRecommendationDTO(ApiModel):
    kind: Literal["no_recommendation"] = "no_recommendation"
    as_of: datetime
    reason: str
    engine_version: int


class ExplanationDTO(ApiModel):
    text: str
    source: Literal["template", "ai"]
    fallback_reason: str | None


class DailyRecommendationResponse(ApiModel):
    explanation: ExplanationDTO | None = None
    as_of: datetime
    recommendation: RecommendationDTO | NoRecommendationDTO
    assignment_risks: tuple[AssignmentRiskDTO, ...]
    skipped_assignments: tuple[str, ...]


class HealthResponse(ApiModel):
    status: Literal["ok"] = "ok"


def recommendation_response(result: DailyRecommendationResult) -> DailyRecommendationResponse:
    from haui_compass.domain.recommendations.recommendation import NoRecommendation

    recommendation = result.recommendation
    if isinstance(recommendation, NoRecommendation):
        rec: RecommendationDTO | NoRecommendationDTO = NoRecommendationDTO(
            as_of=recommendation.as_of,
            reason=recommendation.reason.value,
            engine_version=recommendation.engine_version,
        )
    else:
        evidence = recommendation.evidence
        rec = RecommendationDTO(
            task_id=UUID(str(recommendation.task_id)),
            assignment_id=UUID(str(recommendation.assignment_id)),
            as_of=recommendation.as_of,
            reason_codes=tuple(code.value for code in recommendation.reason_codes),
            engine_version=recommendation.engine_version,
            evidence=RecommendationEvidenceDTO(
                deadline=evidence.deadline,
                time_until_deadline_seconds=evidence.time_until_deadline.total_seconds(),
                estimated_duration_seconds=evidence.estimated_duration.total_seconds(),
                task_status=evidence.task_status.value,
                risk_level=evidence.risk_level.value,
                risk_reason_codes=tuple(code.value for code in evidence.risk_reason_codes),
                risk_engine_version=evidence.risk_engine_version,
                eligible_candidate_count=evidence.eligible_candidate_count,
                deciding_dimension=evidence.deciding_dimension.value,
            ),
        )
    risks = tuple(
        AssignmentRiskDTO(
            assignment_id=UUID(str(item.assignment.id)),
            level=item.risk.level.value,
            reason_codes=tuple(code.value for code in item.risk.reason_codes),
            engine_version=item.risk.engine_version,
            evidence=RiskEvidenceDTO(
                deadline=item.risk.evidence.deadline,
                time_until_deadline_seconds=item.risk.evidence.time_until_deadline.total_seconds(),
                open_task_count=item.risk.evidence.open_task_count,
                remaining_effort_seconds=(
                    item.risk.evidence.remaining_effort.total_seconds()
                    if item.risk.evidence.remaining_effort is not None
                    else None
                ),
                available_capacity_seconds=(
                    item.risk.evidence.available_capacity.total_seconds()
                    if item.risk.evidence.available_capacity is not None
                    else None
                ),
                slack_seconds=(
                    item.risk.evidence.slack.total_seconds()
                    if item.risk.evidence.slack is not None
                    else None
                ),
                slack_ratio=item.risk.evidence.slack_ratio,
            ),
        )
        for item in result.assignment_risks
    )
    return DailyRecommendationResponse(
        as_of=result.as_of,
        recommendation=rec,
        assignment_risks=risks,
        skipped_assignments=tuple(str(item.source) for item in result.skipped_assignments),
    )

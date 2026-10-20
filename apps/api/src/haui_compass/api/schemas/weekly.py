from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field

from haui_compass.api.schemas.common import ApiModel, ExternalRefDTO
from haui_compass.api.schemas.learning_loop import (
    PlanChangeDTO,
    PlanPeriodDTO,
    RemainingEffortDTO,
    StudyBlockDTO,
    StudyWindowDTO,
    UnplannedTaskDTO,
)
from haui_compass.api.schemas.recommendations import AssignmentRiskDTO
from haui_compass.application.ports.weekly_goals import (
    MAX_GOAL_TEXT_LENGTH,
    MAX_STUDY_WINDOWS,
    WeeklyGoal,
)
from haui_compass.domain.plans.plan import StudyPlan


class WeeklyPlanInputDTO(ApiModel):
    student: ExternalRefDTO
    period: PlanPeriodDTO
    study_windows: tuple[StudyWindowDTO, ...] = Field(max_length=MAX_STUDY_WINDOWS)


class ApproveWeeklyPlanRequest(WeeklyPlanInputDTO):
    record_id: UUID
    goal_text: str = Field(default="", max_length=MAX_GOAL_TEXT_LENGTH)
    target_minutes: int = Field(default=0, ge=0, le=7 * 24 * 60)


class AdaptationRequest(WeeklyPlanInputDTO):
    remaining_efforts: tuple[RemainingEffortDTO, ...]


class ApplyAdaptationRequest(AdaptationRequest):
    record_id: UUID


class ProposedPlanDTO(ApiModel):
    period: PlanPeriodDTO
    generated_at: datetime
    planner_version: int
    blocks: tuple[StudyBlockDTO, ...]
    unplanned_tasks: tuple[UnplannedTaskDTO, ...]


def proposed_plan(plan: StudyPlan) -> ProposedPlanDTO:
    return ProposedPlanDTO(
        period=PlanPeriodDTO(start=plan.period.start, end=plan.period.end),
        generated_at=plan.generated_at,
        planner_version=plan.planner_version,
        blocks=tuple(
            StudyBlockDTO(task_id=UUID(str(b.task_id)), starts_at=b.starts_at, ends_at=b.ends_at)
            for b in plan.blocks
        ),
        unplanned_tasks=tuple(
            UnplannedTaskDTO(
                task_id=UUID(str(u.task_id)),
                remaining_duration_seconds=int(u.remaining_effort.total_seconds()),
                reason=u.reason.value,
            )
            for u in plan.unplanned_tasks
        ),
    )


class PlanProposalResponse(ApiModel):
    kind: Literal["plan_proposal"] = "plan_proposal"
    plan: ProposedPlanDTO
    assignment_risks: tuple[AssignmentRiskDTO, ...]


class WeeklyGoalDTO(ApiModel):
    period: PlanPeriodDTO
    goal_text: str
    target_minutes: int
    study_windows: tuple[StudyWindowDTO, ...]
    updated_at: datetime


def goal_response(goal: WeeklyGoal) -> WeeklyGoalDTO:
    return WeeklyGoalDTO(
        period=PlanPeriodDTO(start=goal.period.start, end=goal.period.end),
        goal_text=goal.goal_text,
        target_minutes=goal.target_minutes,
        study_windows=tuple(
            StudyWindowDTO(starts_at=w.starts_at, ends_at=w.ends_at) for w in goal.study_windows
        ),
        updated_at=goal.updated_at,
    )


class AdjustmentDTO(ApiModel):
    code: str
    detail: str
    task_ids: tuple[UUID, ...]


class GoalDraftResponse(ApiModel):
    period: PlanPeriodDTO
    saved: bool
    goal_text: str
    target_minutes: int
    study_windows: tuple[StudyWindowDTO, ...]
    adjustments: tuple[AdjustmentDTO, ...]
    previous_period: PlanPeriodDTO | None


class AdaptationProposalResponse(ApiModel):
    kind: Literal["adaptation_proposal"] = "adaptation_proposal"
    baseline_record_id: UUID
    baseline_revision: int
    plan: ProposedPlanDTO
    changes: tuple[PlanChangeDTO, ...]
    moved_duration_seconds: int
    newly_unplanned_duration_seconds: int
    risks_before: tuple[AssignmentRiskDTO, ...]
    risks_after: tuple[AssignmentRiskDTO, ...]


class TaskReviewDTO(ApiModel):
    task_id: UUID
    title: str
    assignment_title: str
    status: str
    estimated_duration_seconds: int
    actual_duration_seconds: int
    sessions: int
    completed_this_period: bool
    scheduled: bool
    missed: bool


class DeadlineReviewDTO(ApiModel):
    assignment_id: UUID
    title: str
    deadline: datetime
    state: str
    open_tasks: int


class CoachingDTO(ApiModel):
    summary: str
    questions: tuple[str, ...]
    source: Literal["template", "ai"]
    fallback_reason: str | None


class WeeklyReviewResponse(ApiModel):
    kind: Literal["weekly_review"] = "weekly_review"
    period: PlanPeriodDTO
    as_of: datetime
    goal: WeeklyGoalDTO | None
    planned_seconds: int
    actual_seconds: int
    plan_revisions: int
    active_days: int
    tasks: tuple[TaskReviewDTO, ...]
    deadlines: tuple[DeadlineReviewDTO, ...]
    strengths: tuple[str, ...]
    weaknesses: tuple[str, ...]
    coaching: CoachingDTO


class ReflectionSignalSummaryDTO(ApiModel):
    kind: str
    task_id: UUID | None = None
    topic: str | None = None
    workload: str | None = None
    estimated_duration_seconds: int | None = None
    actual_duration_seconds: int | None = None


class ReflectionHistoryDTO(ApiModel):
    record_id: UUID
    period: PlanPeriodDTO
    confirmed_at: datetime
    signals: tuple[ReflectionSignalSummaryDTO, ...]


class WeekHistoryDTO(ApiModel):
    period: PlanPeriodDTO
    goal: WeeklyGoalDTO | None
    reflections: tuple[ReflectionHistoryDTO, ...]


class WeeklyHistoryResponse(ApiModel):
    weeks: tuple[WeekHistoryDTO, ...]

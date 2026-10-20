"""HTTP adapter for the student-confirmed weekly cycle (plan, adapt, review, next week)."""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter

from haui_compass.api.dependencies import AppContainer
from haui_compass.api.schemas.learning_loop import (
    PlanChangeDTO,
    PlanPeriodDTO,
    PlanRecordDTO,
    ReplanResponse,
    StudyWindowDTO,
    plan_record_response,
    replan_response,
)
from haui_compass.api.schemas.recommendations import recommendation_response
from haui_compass.api.schemas.weekly import (
    AdaptationProposalResponse,
    AdaptationRequest,
    AdjustmentDTO,
    ApplyAdaptationRequest,
    ApproveWeeklyPlanRequest,
    CoachingDTO,
    DeadlineReviewDTO,
    GoalDraftResponse,
    PlanProposalResponse,
    ReflectionHistoryDTO,
    ReflectionSignalSummaryDTO,
    TaskReviewDTO,
    WeekHistoryDTO,
    WeeklyHistoryResponse,
    WeeklyPlanInputDTO,
    WeeklyReviewResponse,
    goal_response,
    proposed_plan,
)
from haui_compass.api.v1.routes import container_dependency
from haui_compass.application.lms_mapping import student_id_for
from haui_compass.application.ports.lms import ExternalRef
from haui_compass.application.ports.study_plans import PlanRecordId
from haui_compass.domain.reflections.signals import (
    DeferredTaskSignal,
    DifficultTopicSignal,
    EstimationFeedbackSignal,
    WorkloadFeedbackSignal,
)

router = APIRouter()


def _period(start: datetime, end: datetime) -> PlanPeriodDTO:
    return PlanPeriodDTO(start=start, end=end)


@router.get("/weekly-goals/draft", response_model=GoalDraftResponse)
def weekly_goal_draft(
    student_provider: str,
    student_id: str,
    period_start: datetime,
    period_end: datetime,
    container: AppContainer = container_dependency,
) -> GoalDraftResponse:
    period = _period(period_start, period_end).to_domain()
    draft = container.weekly_cycle.draft_goal(ExternalRef(student_provider, student_id), period)
    return GoalDraftResponse(
        period=PlanPeriodDTO(start=draft.period.start, end=draft.period.end),
        saved=draft.saved,
        goal_text=draft.goal_text,
        target_minutes=draft.target_minutes,
        study_windows=tuple(
            StudyWindowDTO(starts_at=w.starts_at, ends_at=w.ends_at) for w in draft.study_windows
        ),
        adjustments=tuple(
            AdjustmentDTO(
                code=item.code.value,
                detail=item.detail,
                task_ids=tuple(UUID(str(t)) for t in item.task_ids),
            )
            for item in draft.adjustments
        ),
        previous_period=(
            PlanPeriodDTO(start=draft.previous_period.start, end=draft.previous_period.end)
            if draft.previous_period
            else None
        ),
    )


@router.post("/weekly-plans/preview", response_model=PlanProposalResponse)
def preview_weekly_plan(
    request: WeeklyPlanInputDTO, container: AppContainer = container_dependency
) -> PlanProposalResponse:
    proposal = container.weekly_cycle.preview_plan(
        request.student.to_domain(),
        request.period.to_domain(),
        tuple(w.to_domain() for w in request.study_windows),
    )
    return PlanProposalResponse(
        plan=proposed_plan(proposal.plan),
        assignment_risks=recommendation_response(proposal.risk).assignment_risks,
    )


@router.post("/weekly-plans/approve", response_model=PlanRecordDTO)
def approve_weekly_plan(
    request: ApproveWeeklyPlanRequest, container: AppContainer = container_dependency
) -> PlanRecordDTO:
    record, _ = container.weekly_cycle.approve_plan(
        student=request.student.to_domain(),
        period=request.period.to_domain(),
        goal_text=request.goal_text,
        target_minutes=request.target_minutes,
        windows=tuple(w.to_domain() for w in request.study_windows),
        record_id=PlanRecordId(request.record_id),
    )
    return plan_record_response(record)


@router.post("/weekly-plans/adapt/preview", response_model=AdaptationProposalResponse)
def preview_adaptation(
    request: AdaptationRequest, container: AppContainer = container_dependency
) -> AdaptationProposalResponse:
    proposal = container.weekly_cycle.preview_adaptation(
        student=request.student.to_domain(),
        period=request.period.to_domain(),
        windows=tuple(w.to_domain() for w in request.study_windows),
        remaining=tuple(item.to_domain() for item in request.remaining_efforts),
    )
    result = proposal.result
    return AdaptationProposalResponse(
        baseline_record_id=UUID(str(proposal.baseline.record_id)),
        baseline_revision=proposal.baseline.revision,
        plan=proposed_plan(result.revised_plan),
        changes=tuple(
            PlanChangeDTO(
                task_id=UUID(str(item.task_id)),
                reasons=tuple(reason.value for reason in item.reasons),
                had_execution_activity=item.had_execution_activity,
            )
            for item in result.changes
        ),
        moved_duration_seconds=int(result.summary.moved_duration.total_seconds()),
        newly_unplanned_duration_seconds=int(
            result.summary.newly_unplanned_duration.total_seconds()
        ),
        risks_before=recommendation_response(proposal.risk_before).assignment_risks,
        risks_after=recommendation_response(proposal.risk_after).assignment_risks,
    )


@router.post("/weekly-plans/adapt", response_model=ReplanResponse)
def apply_adaptation(
    request: ApplyAdaptationRequest, container: AppContainer = container_dependency
) -> ReplanResponse:
    record = container.weekly_cycle.apply_adaptation(
        student=request.student.to_domain(),
        period=request.period.to_domain(),
        windows=tuple(w.to_domain() for w in request.study_windows),
        remaining=tuple(item.to_domain() for item in request.remaining_efforts),
        record_id=PlanRecordId(request.record_id),
    )
    return replan_response(record)


@router.get("/weekly-reviews", response_model=WeeklyReviewResponse)
async def weekly_review(
    student_provider: str,
    student_id: str,
    period_start: datetime,
    period_end: datetime,
    container: AppContainer = container_dependency,
) -> WeeklyReviewResponse:
    from starlette.concurrency import run_in_threadpool

    review = await run_in_threadpool(
        container.weekly_cycle.review,
        ExternalRef(student_provider, student_id),
        _period(period_start, period_end).to_domain(),
    )
    coaching = await container.coach_weekly_reflection.execute(review)
    return WeeklyReviewResponse(
        period=_period(review.period.start, review.period.end),
        as_of=review.as_of,
        goal=goal_response(review.goal) if review.goal else None,
        planned_seconds=int(review.planned.total_seconds()),
        actual_seconds=int(review.actual.total_seconds()),
        plan_revisions=review.plan_revisions,
        active_days=review.active_days,
        tasks=tuple(
            TaskReviewDTO(
                task_id=UUID(str(r.task.id)),
                title=r.task.title,
                assignment_title=r.assignment.title,
                status=r.task.status.value,
                estimated_duration_seconds=int(r.task.estimated_duration.total_seconds()),
                actual_duration_seconds=int(r.actual.total_seconds()),
                sessions=r.sessions,
                completed_this_period=r.completed_this_period,
                scheduled=r.scheduled,
                missed=r.missed,
            )
            for r in review.tasks
        ),
        deadlines=tuple(
            DeadlineReviewDTO(
                assignment_id=UUID(str(d.assignment.id)),
                title=d.assignment.title,
                deadline=d.assignment.deadline,
                state=d.state.value,
                open_tasks=d.open_tasks,
            )
            for d in review.deadlines
        ),
        strengths=tuple(code.value for code in review.strengths),
        weaknesses=tuple(code.value for code in review.weaknesses),
        coaching=CoachingDTO(
            summary=coaching.summary,
            questions=coaching.questions,
            source=coaching.source,
            fallback_reason=coaching.fallback_reason,
        ),
    )


def _signal(signal: object) -> ReflectionSignalSummaryDTO:
    if isinstance(signal, EstimationFeedbackSignal):
        return ReflectionSignalSummaryDTO(
            kind="estimation_feedback",
            task_id=UUID(str(signal.task_id)),
            estimated_duration_seconds=int(signal.estimated_duration.total_seconds()),
            actual_duration_seconds=int(signal.actual_duration.total_seconds()),
        )
    if isinstance(signal, WorkloadFeedbackSignal):
        return ReflectionSignalSummaryDTO(kind="workload_feedback", workload=signal.reported.value)
    if isinstance(signal, DifficultTopicSignal):
        return ReflectionSignalSummaryDTO(kind="difficult_topic", topic=signal.topic)
    if isinstance(signal, DeferredTaskSignal):
        return ReflectionSignalSummaryDTO(kind="deferred_task", task_id=UUID(str(signal.task_id)))
    raise TypeError(f"unsupported reflection signal: {type(signal)!r}")


@router.get("/weekly-history", response_model=WeeklyHistoryResponse)
def weekly_history(
    student_provider: str,
    student_id: str,
    container: AppContainer = container_dependency,
) -> WeeklyHistoryResponse:
    student = ExternalRef(student_provider, student_id)
    goals = container.weekly_cycle.goals(student)
    reflections = container.transaction_manager.run(
        lambda: container.reflection_repository.list_for_student(student_id_for(student))
    )
    periods = {(g.period.start, g.period.end): g for g in goals}
    for record in reflections:
        key = (record.confirmed.period.start, record.confirmed.period.end)
        periods.setdefault(key, None)  # type: ignore[arg-type]
    weeks = []
    for start, end in sorted(periods, reverse=True):
        goal = periods[(start, end)]
        weeks.append(
            WeekHistoryDTO(
                period=_period(start, end),
                goal=goal_response(goal) if goal else None,
                reflections=tuple(
                    ReflectionHistoryDTO(
                        record_id=UUID(str(record.record_id)),
                        period=_period(record.confirmed.period.start, record.confirmed.period.end),
                        confirmed_at=record.confirmed.confirmed_at,
                        signals=tuple(_signal(s) for s in record.confirmed.signals),
                    )
                    for record in reflections
                    if (record.confirmed.period.start, record.confirmed.period.end) == (start, end)
                ),
            )
        )
    return WeeklyHistoryResponse(weeks=tuple(weeks))

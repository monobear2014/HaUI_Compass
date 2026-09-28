from datetime import datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends

from haui_compass.api.dependencies import AppContainer
from haui_compass.api.schemas.executions import TaskExecutionRequest, TaskExecutionResponse
from haui_compass.api.schemas.learning_loop import (
    ConfirmedReflectionResponse,
    ConfirmReflectionRequest,
    PlanPeriodDTO,
    PlanRecordDTO,
    ReflectionCandidatesResponse,
    ReflectionContextRequest,
    ReplanRequest,
    ReplanResponse,
    WeeklyPlanRequest,
    candidate_response,
    plan_record_response,
    replan_response,
)
from haui_compass.api.schemas.recommendations import (
    DailyRecommendationRequest,
    DailyRecommendationResponse,
    recommendation_response,
)
from haui_compass.application.ports.executions import ExecutionRecordId
from haui_compass.application.ports.reflections import ConfirmedReflectionRecordId
from haui_compass.application.ports.study_plans import PlanRecordId
from haui_compass.application.use_cases.get_daily_recommendation import (
    GetDailyRecommendationRequest,
)
from haui_compass.application.use_cases.persisted_learning_loop import (
    ConfirmPersistedReflectionRequest,
    GeneratePersistedWeeklyPlanRequest,
    GenerateReflectionCandidatesRequest,
    ReplanPersistedStudyPlanRequest,
)
from haui_compass.application.use_cases.record_persisted_task_execution import (
    RecordPersistedTaskExecutionRequest,
)
from haui_compass.domain.tasks.execution import ExecutionOutcome
from haui_compass.domain.tasks.task import TaskId

router = APIRouter()


def container_from_app() -> AppContainer:
    raise RuntimeError("container dependency was not installed")


container_dependency = Depends(container_from_app)


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/daily-recommendation", response_model=DailyRecommendationResponse)
def daily_recommendation(
    request: DailyRecommendationRequest,
    container: AppContainer = container_dependency,
) -> DailyRecommendationResponse:
    result = container.get_daily_recommendation.execute(
        GetDailyRecommendationRequest(
            student=request.student.to_domain(),
            available_capacity=timedelta(minutes=request.available_minutes),
            assignment_capacities=tuple(item.to_domain() for item in request.assignment_capacities),
        )
    )
    return recommendation_response(result)


@router.post("/task-executions", response_model=TaskExecutionResponse)
def task_execution(
    request: TaskExecutionRequest,
    container: AppContainer = container_dependency,
) -> TaskExecutionResponse:
    result = container.record_persisted_task_execution.execute(
        RecordPersistedTaskExecutionRequest(
            student=request.student.to_domain(),
            task_id=TaskId(request.task_id),
            record_id=ExecutionRecordId(request.record_id),
            started_at=request.started_at,
            ended_at=request.ended_at,
            outcome=ExecutionOutcome(request.outcome),
        )
    )
    execution = result.record.execution
    return TaskExecutionResponse(
        record_id=UUID(str(result.record.record_id)),
        task_id=UUID(str(execution.task_id)),
        student_id=UUID(str(result.record.student_id)),
        started_at=execution.started_at,
        ended_at=execution.ended_at,
        actual_duration_seconds=execution.actual_duration.total_seconds(),
        outcome=execution.outcome.value,
        task_status=result.updated_task.task.status.value,
        idempotent_retry=result.idempotent_retry,
    )


@router.post("/weekly-plans", response_model=PlanRecordDTO)
def weekly_plan(
    request: WeeklyPlanRequest, container: AppContainer = container_dependency
) -> PlanRecordDTO:
    record = container.generate_persisted_weekly_plan.execute(
        GeneratePersistedWeeklyPlanRequest(
            student=request.student.to_domain(),
            period=request.period.to_domain(),
            study_windows=tuple(item.to_domain() for item in request.study_windows),
            record_id=PlanRecordId(request.record_id),
        )
    )
    return plan_record_response(record)


@router.get("/weekly-plans/latest", response_model=PlanRecordDTO)
def latest_weekly_plan(
    student_provider: str,
    student_id: str,
    period_start: datetime,
    period_end: datetime,
    container: AppContainer = container_dependency,
) -> PlanRecordDTO:
    from haui_compass.application.lms_mapping import student_id_for
    from haui_compass.application.ports.lms import ExternalRef
    from haui_compass.application.ports.persistence import PersistenceError, PersistenceErrorCode

    period = PlanPeriodDTO(start=period_start, end=period_end).to_domain()
    record = container.plan_repository.latest(
        student_id_for(ExternalRef(student_provider, student_id)), period
    )
    if record is None:
        raise PersistenceError(PersistenceErrorCode.RECORD_NOT_FOUND, "plan was not found")
    return plan_record_response(record)


@router.get("/weekly-plans/history", response_model=tuple[PlanRecordDTO, ...])
def weekly_plan_history(
    student_provider: str,
    student_id: str,
    period_start: datetime,
    period_end: datetime,
    container: AppContainer = container_dependency,
) -> tuple[PlanRecordDTO, ...]:
    from haui_compass.application.lms_mapping import student_id_for
    from haui_compass.application.ports.lms import ExternalRef

    period = PlanPeriodDTO(start=period_start, end=period_end).to_domain()
    return tuple(
        plan_record_response(record)
        for record in container.plan_repository.history(
            student_id_for(ExternalRef(student_provider, student_id)), period
        )
    )


@router.post("/reflections/candidates", response_model=ReflectionCandidatesResponse)
def reflection_candidates(
    request: ReflectionContextRequest, container: AppContainer = container_dependency
) -> ReflectionCandidatesResponse:
    result = container.generate_reflection_candidates.execute(
        GenerateReflectionCandidatesRequest(
            student=request.student.to_domain(),
            period=request.reflection_period(),
            responses=request.responses.to_domain(),
        )
    )
    return candidate_response(result.candidate_signals.signals)


@router.post("/reflections/confirm", response_model=ConfirmedReflectionResponse)
def confirm_reflection(
    request: ConfirmReflectionRequest, container: AppContainer = container_dependency
) -> ConfirmedReflectionResponse:
    record = container.confirm_persisted_reflection.execute(
        ConfirmPersistedReflectionRequest(
            student=request.student.to_domain(),
            period=request.reflection_period(),
            responses=request.responses.to_domain(),
            selected_signal_ids=request.selected_signal_ids,
            record_id=ConfirmedReflectionRecordId(request.record_id),
        )
    )
    return ConfirmedReflectionResponse(
        record_id=UUID(str(record.record_id)),
        confirmed_at=record.confirmed.confirmed_at,
        saved_at=record.saved_at,
        confirmed_signal_ids=tuple(
            candidate_response(record.confirmed.signals).candidates[i].id
            for i in range(len(record.confirmed.signals))
        ),
    )


@router.post("/weekly-plans/replan", response_model=ReplanResponse)
def replan_weekly_plan(
    request: ReplanRequest, container: AppContainer = container_dependency
) -> ReplanResponse:
    record = container.replan_persisted_study_plan.execute(
        ReplanPersistedStudyPlanRequest(
            student=request.student.to_domain(),
            period=request.period.to_domain(),
            study_windows=tuple(item.to_domain() for item in request.study_windows),
            remaining_efforts=tuple(item.to_domain() for item in request.remaining_efforts),
            effective_at=request.effective_at,
            record_id=PlanRecordId(request.record_id),
        )
    )
    return replan_response(record)

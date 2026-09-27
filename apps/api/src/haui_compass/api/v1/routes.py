from datetime import timedelta
from uuid import UUID

from fastapi import APIRouter, Depends

from haui_compass.api.dependencies import AppContainer
from haui_compass.api.schemas.executions import TaskExecutionRequest, TaskExecutionResponse
from haui_compass.api.schemas.recommendations import (
    DailyRecommendationRequest,
    DailyRecommendationResponse,
    recommendation_response,
)
from haui_compass.application.ports.executions import ExecutionRecordId
from haui_compass.application.use_cases.get_daily_recommendation import (
    GetDailyRecommendationRequest,
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

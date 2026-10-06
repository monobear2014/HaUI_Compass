from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends

from haui_compass.api.dependencies import AppContainer
from haui_compass.api.schemas.academic_data import (
    AcademicDataResponse,
    AcademicImportRequest,
    AcademicImportResponse,
    AssignmentImportDTO,
    CourseImportDTO,
    CsvImportRequest,
    SubmissionImportDTO,
    parse_canonical_csv,
)
from haui_compass.api.schemas.executions import TaskExecutionRequest, TaskExecutionResponse
from haui_compass.api.schemas.knowledge import (
    KnowledgeQueryRequestDTO,
    KnowledgeQueryResponseDTO,
    knowledge_response,
)
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
    ExplanationDTO,
    recommendation_response,
)
from haui_compass.api.schemas.task_decomposition import (
    ConfirmTaskDecompositionRequestDTO,
    ConfirmTaskDecompositionResponse,
    GenerateTaskDecompositionRequestDTO,
    TaskDecompositionResponse,
    confirmation_response,
    decomposition_response,
)
from haui_compass.api.schemas.tasks import CreateStudyTaskRequestDTO, StudyTaskResponse
from haui_compass.application.academic_import import AcademicSource, dataset_from_values
from haui_compass.application.lms_mapping import assignment_id_for, student_id_for
from haui_compass.application.ports.executions import ExecutionRecordId
from haui_compass.application.ports.lms import SubmissionStatus
from haui_compass.application.ports.reflections import ConfirmedReflectionRecordId
from haui_compass.application.ports.study_plans import PlanRecordId
from haui_compass.application.ports.task_decomposition import TaskDecompositionSessionId
from haui_compass.application.use_cases.create_study_task import CreateStudyTaskRequest
from haui_compass.application.use_cases.get_daily_recommendation import (
    GetDailyRecommendationRequest,
)
from haui_compass.application.use_cases.persisted_learning_loop import (
    ConfirmPersistedReflectionRequest,
    GeneratePersistedWeeklyPlanRequest,
    GenerateReflectionCandidatesRequest,
    ReplanPersistedStudyPlanRequest,
)
from haui_compass.application.use_cases.query_knowledge import KnowledgeQueryRequest
from haui_compass.application.use_cases.record_persisted_task_execution import (
    RecordPersistedTaskExecutionRequest,
)
from haui_compass.application.use_cases.task_decomposition import (
    ConfirmTaskDecompositionRequest,
    GenerateTaskDecompositionRequest,
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


@router.post("/knowledge/query", response_model=KnowledgeQueryResponseDTO)
async def query_knowledge(
    request: KnowledgeQueryRequestDTO,
    container: AppContainer = container_dependency,
) -> KnowledgeQueryResponseDTO:
    result = await container.query_knowledge.execute(
        KnowledgeQueryRequest(
            question=request.question,
            scope=request.scope,
            course_id=request.course_id,
        )
    )
    return knowledge_response(result)


def _academic_response(
    request: AcademicImportRequest, *, idempotent_retry: bool
) -> AcademicImportResponse:
    return AcademicImportResponse(
        student_provider=request.source,
        student_id=request.student_external_id,
        source=request.source,
        courses=len(request.courses),
        assignments=len(request.assignments),
        submissions=len(request.submissions),
        idempotent_retry=idempotent_retry,
    )


@router.post("/academic-data/import", response_model=AcademicImportResponse)
def import_academic_data(
    request: AcademicImportRequest, container: AppContainer = container_dependency
) -> AcademicImportResponse:
    dataset = dataset_from_values(
        student_id=request.student_external_id,
        source=AcademicSource(request.source),
        courses=tuple((item.external_id, item.name, item.code) for item in request.courses),
        assignments=tuple(
            (
                item.external_id,
                item.course_external_id,
                item.title,
                item.deadline,
                item.estimated_effort_minutes,
            )
            for item in request.assignments
        ),
        submissions=tuple(
            (item.assignment_external_id, SubmissionStatus(item.status), item.submitted_at)
            for item in request.submissions
        ),
    )
    retry = container.transaction_manager.run(
        lambda: container.imported_academic_data.replace(dataset)
    )
    return _academic_response(request, idempotent_retry=retry)


@router.post("/academic-data/import/csv", response_model=AcademicImportResponse)
def import_academic_csv(
    request: CsvImportRequest, container: AppContainer = container_dependency
) -> AcademicImportResponse:
    parsed = parse_canonical_csv(request.content, student_external_id=request.student_external_id)
    return import_academic_data(parsed, container)


@router.get("/academic-data", response_model=AcademicDataResponse)
def current_academic_data(
    source: AcademicSource,
    student_external_id: str,
    container: AppContainer = container_dependency,
) -> AcademicDataResponse:
    from haui_compass.application.ports.lms import ExternalRef

    dataset = container.transaction_manager.run(
        lambda: container.imported_academic_data.dataset(
            ExternalRef(source.value, student_external_id)
        )
    )
    if dataset is None:
        from haui_compass.application.ports.persistence import (
            PersistenceError,
            PersistenceErrorCode,
        )

        raise PersistenceError(PersistenceErrorCode.RECORD_NOT_FOUND, "academic data was not found")
    request = AcademicImportRequest(
        schema_version="haui-compass-academic-import-v1",
        student_external_id=student_external_id,
        source=source.value,
        courses=tuple(
            CourseImportDTO(external_id=x.ref.id, name=x.name, code=x.code) for x in dataset.courses
        ),
        assignments=tuple(
            AssignmentImportDTO(
                external_id=x.ref.id,
                course_external_id=x.course_ref.id,
                title=x.title,
                deadline=x.deadline,
                estimated_effort_minutes=(
                    int(x.estimated_effort.total_seconds() / 60) if x.estimated_effort else None
                ),
            )
            for x in dataset.assignments
        ),
        submissions=tuple(
            SubmissionImportDTO(
                assignment_external_id=x.assignment_ref.id,
                status=x.status.value,
                submitted_at=x.submitted_at,
            )
            for x in dataset.submissions
        ),
    )
    response = _academic_response(request, idempotent_retry=False)
    return AcademicDataResponse(
        **response.model_dump(),
        courses_data=request.courses,
        assignments_data=request.assignments,
        submissions_data=request.submissions,
    )


@router.delete("/academic-data", status_code=204)
def clear_academic_data(
    source: AcademicSource,
    student_external_id: str,
    container: AppContainer = container_dependency,
) -> None:
    from haui_compass.application.ports.lms import ExternalRef

    container.transaction_manager.run(
        lambda: container.imported_academic_data.clear(
            ExternalRef(source.value, student_external_id)
        )
    )


@router.get("/academic-data/context")
def academic_data_context(
    source: AcademicSource,
    student_external_id: str,
    container: AppContainer = container_dependency,
) -> dict[str, object]:
    """Development/pilot context only; routes the existing workspace away from mock data."""
    from haui_compass.application.ports.lms import ExternalRef

    student = ExternalRef(source.value, student_external_id)

    def read() -> dict[str, object]:
        assignments = {item.ref: item for item in container.lms.get_assignments(student)}
        courses = {item.ref: item.name for item in container.lms.get_courses(student)}
        tasks = []
        for record in container.task_repository.list_for_student(student_id_for(student)):
            assignment = next(
                (
                    item
                    for item in assignments.values()
                    if assignment_id_for(item.ref) == record.task.assignment_id
                ),
                None,
            )
            if assignment is None or assignment.deadline is None:
                continue
            tasks.append(
                {
                    "id": str(record.task.id),
                    "title": record.task.title,
                    "assignment_id": str(record.task.assignment_id),
                    "assignment_title": assignment.title,
                    "course": courses[assignment.course_ref],
                    "deadline": assignment.deadline,
                    "estimated_duration_seconds": int(
                        record.task.estimated_duration.total_seconds()
                    ),
                    "status": record.task.status.value,
                }
            )
        now = container.clock.now().astimezone(UTC)
        period_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        return {
            "mode": "imported_pilot_data",
            "student": {"provider": student.provider, "id": student.id},
            "period": {"start": period_start, "end": period_start + timedelta(days=7)},
            "study_windows": [],
            "now": now,
            "assignments": [
                {
                    "assignment_id": str(assignment_id_for(assignment.ref)),
                    "provider": assignment.ref.provider,
                    "external_id": assignment.ref.id,
                    "title": assignment.title,
                    "course": courses[assignment.course_ref],
                    "deadline": assignment.deadline,
                    "existing_task_count": sum(
                        1
                        for task in tasks
                        if task["assignment_id"] == str(assignment_id_for(assignment.ref))
                    ),
                }
                for assignment in assignments.values()
                if assignment.deadline is not None
            ],
            "tasks": tasks,
        }

    return container.transaction_manager.run(read)


@router.post("/tasks", response_model=StudyTaskResponse)
def create_study_task(
    request: CreateStudyTaskRequestDTO, container: AppContainer = container_dependency
) -> StudyTaskResponse:
    record = container.create_study_task.execute(
        CreateStudyTaskRequest(
            student=request.student.to_domain(),
            assignment=request.assignment.to_domain(),
            task_id=TaskId(request.task_id),
            title=request.title,
            estimated_duration=request.duration(),
        )
    )
    task = record.task
    return StudyTaskResponse(
        id=task.id,
        assignment_id=task.assignment_id,
        title=task.title,
        estimated_duration_seconds=int(task.estimated_duration.total_seconds()),
        status=task.status.value,
    )


@router.post("/task-decompositions", response_model=TaskDecompositionResponse)
async def generate_task_decomposition(
    request: GenerateTaskDecompositionRequestDTO,
    container: AppContainer = container_dependency,
) -> TaskDecompositionResponse:
    result = await container.generate_task_decomposition.execute(
        GenerateTaskDecompositionRequest(
            session_id=TaskDecompositionSessionId(request.session_id),
            student=request.student.to_domain(),
            assignment=request.assignment.to_domain(),
        )
    )
    return decomposition_response(result)


@router.post(
    "/task-decompositions/{session_id}/confirm",
    response_model=ConfirmTaskDecompositionResponse,
)
def confirm_task_decomposition(
    session_id: UUID,
    request: ConfirmTaskDecompositionRequestDTO,
    container: AppContainer = container_dependency,
) -> ConfirmTaskDecompositionResponse:
    result = container.confirm_task_decomposition.execute(
        ConfirmTaskDecompositionRequest(
            session_id=TaskDecompositionSessionId(session_id),
            student=request.student.to_domain(),
            selection=tuple(item.to_application() for item in request.selection),
        )
    )
    return confirmation_response(result)


@router.post("/daily-recommendation", response_model=DailyRecommendationResponse)
async def daily_recommendation(
    request: DailyRecommendationRequest,
    container: AppContainer = container_dependency,
) -> DailyRecommendationResponse:
    from starlette.concurrency import run_in_threadpool

    result = await run_in_threadpool(
        container.get_daily_recommendation.execute,
        GetDailyRecommendationRequest(
            student=request.student.to_domain(),
            available_capacity=timedelta(minutes=request.available_minutes),
            assignment_capacities=tuple(item.to_domain() for item in request.assignment_capacities),
        ),
    )
    response = recommendation_response(result)
    explanation = await container.explain_recommendation.execute(result)
    if explanation is not None:
        response = response.model_copy(
            update={
                "explanation": ExplanationDTO(
                    text=explanation.text,
                    source=explanation.source,
                    fallback_reason=explanation.fallback_reason,
                )
            }
        )
    return response


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
    record = container.transaction_manager.run(
        lambda: container.plan_repository.latest(
            student_id_for(ExternalRef(student_provider, student_id)), period
        )
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
    return container.transaction_manager.run(
        lambda: tuple(
            plan_record_response(record)
            for record in container.plan_repository.history(
                student_id_for(ExternalRef(student_provider, student_id)), period
            )
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

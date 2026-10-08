from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from haui_compass.application.academic_import import AcademicImportError
from haui_compass.application.ports.lms import LMSNotFoundError
from haui_compass.application.ports.persistence import PersistenceError, PersistenceErrorCode
from haui_compass.application.use_cases.daily_recommendation import DailyRecommendationInputError
from haui_compass.application.use_cases.generate_weekly_plan import WeeklyPlanInputError
from haui_compass.application.use_cases.persisted_learning_loop import ReflectionSelectionError
from haui_compass.application.use_cases.query_knowledge import KnowledgeQueryError
from haui_compass.application.use_cases.task_decomposition import TaskDecompositionError
from haui_compass.domain.shared.errors import DomainValidationError


def _response(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}})


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AcademicImportError)
    async def academic_import_error(_: Request, exc: AcademicImportError) -> JSONResponse:
        status = 409 if exc.code.value == "academic_import_conflict" else 400
        return _response(status, exc.code.value, str(exc))

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, __: RequestValidationError) -> JSONResponse:
        return _response(422, "validation_error", "request validation failed")

    @app.exception_handler(LMSNotFoundError)
    async def lms_not_found(_: Request, __: LMSNotFoundError) -> JSONResponse:
        return _response(404, "not_found", "requested LMS resource was not found")

    @app.exception_handler(PersistenceError)
    async def persistence_error(_: Request, exc: PersistenceError) -> JSONResponse:
        status = {
            PersistenceErrorCode.RECORD_NOT_FOUND: 404,
            PersistenceErrorCode.OWNERSHIP_CONFLICT: 404,
            PersistenceErrorCode.RECORD_CONFLICT: 409,
            PersistenceErrorCode.STALE_PLAN_REVISION: 409,
            PersistenceErrorCode.PLAN_SCOPE_MISMATCH: 400,
        }[exc.code]
        return _response(status, exc.code.value, str(exc))

    @app.exception_handler(DailyRecommendationInputError)
    async def recommendation_input(_: Request, exc: DailyRecommendationInputError) -> JSONResponse:
        return _response(400, exc.code.value, str(exc))

    @app.exception_handler(WeeklyPlanInputError)
    async def weekly_plan_input(_: Request, exc: WeeklyPlanInputError) -> JSONResponse:
        return _response(400, exc.code.value, str(exc))

    @app.exception_handler(ReflectionSelectionError)
    async def reflection_selection(_: Request, __: ReflectionSelectionError) -> JSONResponse:
        return _response(400, "invalid_reflection_selection", "selected signal was not generated")

    @app.exception_handler(TaskDecompositionError)
    async def task_decomposition_error(_: Request, exc: TaskDecompositionError) -> JSONResponse:
        status = (
            404
            if exc.code.value.endswith("not_found")
            else 409
            if exc.code.value.endswith("conflict")
            else 400
        )
        return _response(status, exc.code.value, str(exc))

    @app.exception_handler(KnowledgeQueryError)
    async def knowledge_query_error(_: Request, exc: KnowledgeQueryError) -> JSONResponse:
        return _response(400, exc.code.value, str(exc))

    @app.exception_handler(DomainValidationError)
    async def domain_validation(_: Request, __: DomainValidationError) -> JSONResponse:
        return _response(400, "invalid_request", "request violates domain rules")

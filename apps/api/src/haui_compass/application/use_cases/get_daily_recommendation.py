"""Persistence-aware orchestration for the daily recommendation pipeline."""

from dataclasses import dataclass
from datetime import timedelta

from haui_compass.application.lms_mapping import student_id_for
from haui_compass.application.ports.lms import ExternalRef
from haui_compass.application.ports.tasks import TaskRepository
from haui_compass.application.ports.transactions import PersistenceTransactionManager
from haui_compass.application.use_cases.daily_recommendation import (
    AssignmentCapacity,
    DailyRecommendationResult,
    GenerateDailyRecommendationRequest,
)
from haui_compass.application.use_cases.generate_daily_recommendation import (
    GenerateDailyRecommendation,
)


@dataclass(frozen=True, slots=True, kw_only=True)
class GetDailyRecommendationRequest:
    student: ExternalRef
    available_capacity: timedelta
    assignment_capacities: tuple[AssignmentCapacity, ...] = ()


class GetDailyRecommendation:
    """Load the student's persisted tasks, then reuse the pure recommendation orchestration."""

    def __init__(
        self,
        *,
        task_repository: TaskRepository,
        generator: GenerateDailyRecommendation,
        transaction_manager: PersistenceTransactionManager | None = None,
    ) -> None:
        self._task_repository = task_repository
        self._generator = generator
        self._transaction_manager = transaction_manager

    def execute(self, request: GetDailyRecommendationRequest) -> DailyRecommendationResult:
        if self._transaction_manager is not None:
            return self._transaction_manager.run(lambda: self._execute(request))
        return self._execute(request)

    def _execute(self, request: GetDailyRecommendationRequest) -> DailyRecommendationResult:
        student_id = student_id_for(request.student)
        tasks = tuple(record.task for record in self._task_repository.list_for_student(student_id))
        return self._generator.execute(
            GenerateDailyRecommendationRequest(
                student=request.student,
                tasks=tasks,
                available_capacity=request.available_capacity,
                assignment_capacities=request.assignment_capacities,
            )
        )

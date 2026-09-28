"""Composition root: construct the object graph once and inject it into routes."""

from dataclasses import dataclass

from haui_compass.application.ports.clock import Clock
from haui_compass.application.ports.executions import TaskExecutionRepository
from haui_compass.application.ports.lms import LMSProvider
from haui_compass.application.ports.reflections import ConfirmedReflectionRepository
from haui_compass.application.ports.study_plans import StudyPlanRepository
from haui_compass.application.ports.tasks import TaskRepository
from haui_compass.application.ports.transactions import PersistenceTransactionManager
from haui_compass.application.use_cases.confirm_reflection_signals import ConfirmReflectionSignals
from haui_compass.application.use_cases.generate_daily_recommendation import (
    GenerateDailyRecommendation,
)
from haui_compass.application.use_cases.get_daily_recommendation import GetDailyRecommendation
from haui_compass.application.use_cases.persisted_learning_loop import (
    ConfirmPersistedReflection,
    GeneratePersistedWeeklyPlan,
    GenerateReflectionCandidates,
    ReplanPersistedStudyPlan,
)
from haui_compass.application.use_cases.record_persisted_task_execution import (
    RecordPersistedTaskExecution,
)
from haui_compass.application.use_cases.submit_reflection import SubmitReflection
from haui_compass.infrastructure.clock import SystemClock
from haui_compass.infrastructure.lms.mock import MockLMSProvider
from haui_compass.infrastructure.persistence.memory.executions import (
    InMemoryTaskExecutionRepository,
)
from haui_compass.infrastructure.persistence.memory.reflections import (
    InMemoryConfirmedReflectionRepository,
)
from haui_compass.infrastructure.persistence.memory.study_plans import InMemoryStudyPlanRepository
from haui_compass.infrastructure.persistence.memory.tasks import InMemoryTaskRepository
from haui_compass.infrastructure.persistence.memory.transactions import (
    InMemoryPersistenceTransactionManager,
)


@dataclass(frozen=True, slots=True)
class AppContainer:
    lms: LMSProvider
    clock: Clock
    task_repository: TaskRepository
    execution_repository: TaskExecutionRepository
    plan_repository: StudyPlanRepository
    reflection_repository: ConfirmedReflectionRepository
    get_daily_recommendation: GetDailyRecommendation
    record_persisted_task_execution: RecordPersistedTaskExecution
    generate_persisted_weekly_plan: GeneratePersistedWeeklyPlan
    generate_reflection_candidates: GenerateReflectionCandidates
    confirm_persisted_reflection: ConfirmPersistedReflection
    replan_persisted_study_plan: ReplanPersistedStudyPlan
    transaction_manager: PersistenceTransactionManager


def build_container(
    *,
    lms: LMSProvider | None = None,
    clock: Clock | None = None,
    task_repository: TaskRepository | None = None,
    execution_repository: TaskExecutionRepository | None = None,
    plan_repository: StudyPlanRepository | None = None,
    reflection_repository: ConfirmedReflectionRepository | None = None,
) -> AppContainer:
    resolved_clock = clock or SystemClock()
    resolved_lms = lms or MockLMSProvider.canonical(anchor=resolved_clock.now())
    resolved_tasks = task_repository or InMemoryTaskRepository()
    resolved_executions = execution_repository or InMemoryTaskExecutionRepository()
    resolved_plans = plan_repository or InMemoryStudyPlanRepository()
    resolved_reflections = reflection_repository or InMemoryConfirmedReflectionRepository()
    transaction_manager = InMemoryPersistenceTransactionManager(resolved_tasks, resolved_executions)
    generator = GenerateDailyRecommendation(lms=resolved_lms, clock=resolved_clock)
    reflection_candidates = GenerateReflectionCandidates(
        task_repository=resolved_tasks,
        execution_repository=resolved_executions,
        submit_reflection=SubmitReflection(clock=resolved_clock),
    )
    return AppContainer(
        lms=resolved_lms,
        clock=resolved_clock,
        task_repository=resolved_tasks,
        execution_repository=resolved_executions,
        plan_repository=resolved_plans,
        reflection_repository=resolved_reflections,
        get_daily_recommendation=GetDailyRecommendation(
            task_repository=resolved_tasks, generator=generator
        ),
        record_persisted_task_execution=RecordPersistedTaskExecution(
            clock=resolved_clock,
            task_repository=resolved_tasks,
            execution_repository=resolved_executions,
            transaction_manager=transaction_manager,
        ),
        generate_persisted_weekly_plan=GeneratePersistedWeeklyPlan(
            task_repository=resolved_tasks,
            plan_repository=resolved_plans,
            lms=resolved_lms,
            clock=resolved_clock,
        ),
        generate_reflection_candidates=reflection_candidates,
        confirm_persisted_reflection=ConfirmPersistedReflection(
            candidates=reflection_candidates,
            confirmer=ConfirmReflectionSignals(clock=resolved_clock),
            repository=resolved_reflections,
        ),
        replan_persisted_study_plan=ReplanPersistedStudyPlan(
            task_repository=resolved_tasks,
            execution_repository=resolved_executions,
            reflection_repository=resolved_reflections,
            plan_repository=resolved_plans,
            lms=resolved_lms,
            clock=resolved_clock,
        ),
        transaction_manager=transaction_manager,
    )

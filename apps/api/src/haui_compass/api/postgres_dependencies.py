"""Explicit PostgreSQL composition; never selected implicitly by API startup."""

from haui_compass.api.dependencies import AppContainer
from haui_compass.application.academic_import import (
    AcademicDataRoutingProvider,
)
from haui_compass.application.ports.clock import Clock
from haui_compass.application.ports.lms import LMSProvider
from haui_compass.application.use_cases.confirm_reflection_signals import ConfirmReflectionSignals
from haui_compass.application.use_cases.create_study_task import CreateStudyTask
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
from haui_compass.infrastructure.config.database import DatabaseSettings
from haui_compass.infrastructure.lms.mock import MockLMSProvider
from haui_compass.infrastructure.persistence.postgres.academic_data import (
    PostgresImportedAcademicDataProvider,
)
from haui_compass.infrastructure.persistence.postgres.executions import (
    PostgresTaskExecutionRepository,
)
from haui_compass.infrastructure.persistence.postgres.plans import PostgresStudyPlanRepository
from haui_compass.infrastructure.persistence.postgres.reflections import (
    PostgresConfirmedReflectionRepository,
)
from haui_compass.infrastructure.persistence.postgres.session import (
    PostgresPersistenceTransactionManager,
    PostgresSessionFactory,
)
from haui_compass.infrastructure.persistence.postgres.tasks import PostgresTaskRepository


def build_postgres_container(
    *,
    settings: DatabaseSettings | None = None,
    lms: LMSProvider | None = None,
    clock: Clock | None = None,
) -> AppContainer:
    resolved_clock = clock or SystemClock()
    session_factory = PostgresSessionFactory((settings or DatabaseSettings.from_env()).url)
    transaction_manager = PostgresPersistenceTransactionManager(session_factory.session_factory)
    provider = transaction_manager.current_session
    imported_academic_data = PostgresImportedAcademicDataProvider(provider)
    resolved_lms = AcademicDataRoutingProvider(
        imported=imported_academic_data,
        fallback=lms or MockLMSProvider.canonical(anchor=resolved_clock.now()),
    )
    tasks = PostgresTaskRepository(provider)
    executions = PostgresTaskExecutionRepository(provider)
    plans = PostgresStudyPlanRepository(provider)
    reflections = PostgresConfirmedReflectionRepository(provider)
    generator = GenerateDailyRecommendation(lms=resolved_lms, clock=resolved_clock)
    reflection_candidates = GenerateReflectionCandidates(
        task_repository=tasks,
        execution_repository=executions,
        submit_reflection=SubmitReflection(clock=resolved_clock),
        transaction_manager=transaction_manager,
    )
    return AppContainer(
        lms=resolved_lms,
        imported_academic_data=imported_academic_data,
        clock=resolved_clock,
        task_repository=tasks,
        execution_repository=executions,
        plan_repository=plans,
        reflection_repository=reflections,
        get_daily_recommendation=GetDailyRecommendation(
            task_repository=tasks, generator=generator, transaction_manager=transaction_manager
        ),
        record_persisted_task_execution=RecordPersistedTaskExecution(
            clock=resolved_clock,
            task_repository=tasks,
            execution_repository=executions,
            transaction_manager=transaction_manager,
        ),
        generate_persisted_weekly_plan=GeneratePersistedWeeklyPlan(
            task_repository=tasks,
            plan_repository=plans,
            lms=resolved_lms,
            clock=resolved_clock,
            transaction_manager=transaction_manager,
        ),
        generate_reflection_candidates=reflection_candidates,
        confirm_persisted_reflection=ConfirmPersistedReflection(
            candidates=reflection_candidates,
            confirmer=ConfirmReflectionSignals(clock=resolved_clock),
            repository=reflections,
            transaction_manager=transaction_manager,
        ),
        replan_persisted_study_plan=ReplanPersistedStudyPlan(
            task_repository=tasks,
            execution_repository=executions,
            reflection_repository=reflections,
            plan_repository=plans,
            lms=resolved_lms,
            clock=resolved_clock,
            transaction_manager=transaction_manager,
        ),
        create_study_task=CreateStudyTask(
            lms=resolved_lms,
            tasks=tasks,
            clock=resolved_clock,
            transaction_manager=transaction_manager,
        ),
        transaction_manager=transaction_manager,
    )

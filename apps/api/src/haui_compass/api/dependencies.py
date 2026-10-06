"""Composition root: construct the object graph once and inject it into routes."""

from dataclasses import dataclass
from pathlib import Path

from haui_compass.application.academic_import import (
    AcademicDataRoutingProvider,
    AcademicDataStore,
    ImportedAcademicDataProvider,
)
from haui_compass.application.ports.clock import Clock
from haui_compass.application.ports.executions import TaskExecutionRepository
from haui_compass.application.ports.explanation import RecommendationExplanationProvider
from haui_compass.application.ports.knowledge import GroundedAnswerProvider
from haui_compass.application.ports.lms import LMSProvider
from haui_compass.application.ports.reflections import ConfirmedReflectionRepository
from haui_compass.application.ports.study_plans import StudyPlanRepository
from haui_compass.application.ports.task_decomposition import (
    TaskDecompositionProvider,
    TaskDecompositionSessionStore,
)
from haui_compass.application.ports.tasks import TaskRepository
from haui_compass.application.ports.transactions import PersistenceTransactionManager
from haui_compass.application.use_cases.confirm_reflection_signals import ConfirmReflectionSignals
from haui_compass.application.use_cases.create_study_task import CreateStudyTask
from haui_compass.application.use_cases.explain_recommendation import ExplainRecommendation
from haui_compass.application.use_cases.generate_daily_recommendation import (
    GenerateDailyRecommendation,
)
from haui_compass.application.use_cases.get_daily_recommendation import GetDailyRecommendation
from haui_compass.application.use_cases.grounded_answer import GroundedAnswerService
from haui_compass.application.use_cases.persisted_learning_loop import (
    ConfirmPersistedReflection,
    GeneratePersistedWeeklyPlan,
    GenerateReflectionCandidates,
    ReplanPersistedStudyPlan,
)
from haui_compass.application.use_cases.query_knowledge import QueryKnowledge
from haui_compass.application.use_cases.record_persisted_task_execution import (
    RecordPersistedTaskExecution,
)
from haui_compass.application.use_cases.submit_reflection import SubmitReflection
from haui_compass.application.use_cases.task_decomposition import (
    ConfirmTaskDecomposition,
    GenerateTaskDecomposition,
)
from haui_compass.infrastructure.clock import SystemClock
from haui_compass.infrastructure.config.llm import LLMSettings
from haui_compass.infrastructure.decomposition.template import (
    DeterministicTaskDecompositionProvider,
)
from haui_compass.infrastructure.explanation.template import TemplateExplanationProvider
from haui_compass.infrastructure.llm.openai_responses import (
    OpenAIResponsesAdapter,
    ResponsesTransport,
)
from haui_compass.infrastructure.lms.mock import MockLMSProvider
from haui_compass.infrastructure.persistence.memory.executions import (
    InMemoryTaskExecutionRepository,
)
from haui_compass.infrastructure.persistence.memory.reflections import (
    InMemoryConfirmedReflectionRepository,
)
from haui_compass.infrastructure.persistence.memory.study_plans import InMemoryStudyPlanRepository
from haui_compass.infrastructure.persistence.memory.task_decompositions import (
    InMemoryTaskDecompositionSessionStore,
)
from haui_compass.infrastructure.persistence.memory.tasks import InMemoryTaskRepository
from haui_compass.infrastructure.persistence.memory.transactions import (
    InMemoryPersistenceTransactionManager,
)
from haui_compass.infrastructure.retrieval.ingestion import ingest_manifest
from haui_compass.infrastructure.retrieval.lexical import LocalLexicalKnowledgeRetriever
from haui_compass.infrastructure.retrieval.template_answer import TemplateGroundedAnswerProvider


@dataclass(frozen=True, slots=True)
class AppContainer:
    compass_answer: GroundedAnswerService
    query_knowledge: QueryKnowledge
    explain_recommendation: ExplainRecommendation
    generate_task_decomposition: GenerateTaskDecomposition
    confirm_task_decomposition: ConfirmTaskDecomposition
    task_decomposition_sessions: TaskDecompositionSessionStore
    lms: LMSProvider
    imported_academic_data: AcademicDataStore
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
    create_study_task: CreateStudyTask
    transaction_manager: PersistenceTransactionManager


def build_container(
    *,
    explanation_provider: RecommendationExplanationProvider | None = None,
    task_decomposition_provider: TaskDecompositionProvider | None = None,
    task_decomposition_timeout_seconds: float = 2.0,
    lms: LMSProvider | None = None,
    clock: Clock | None = None,
    task_repository: TaskRepository | None = None,
    execution_repository: TaskExecutionRepository | None = None,
    plan_repository: StudyPlanRepository | None = None,
    reflection_repository: ConfirmedReflectionRepository | None = None,
    task_decomposition_sessions: TaskDecompositionSessionStore | None = None,
    llm_settings: LLMSettings | None = None,
    llm_transport: ResponsesTransport | None = None,
    grounded_answer_provider: GroundedAnswerProvider | None = None,
    knowledge_root: Path | None = None,
) -> AppContainer:
    resolved_clock = clock or SystemClock()
    imported_academic_data = ImportedAcademicDataProvider()
    resolved_lms = AcademicDataRoutingProvider(
        imported=imported_academic_data,
        fallback=lms or MockLMSProvider.canonical(anchor=resolved_clock.now()),
    )
    resolved_tasks = task_repository or InMemoryTaskRepository()
    resolved_executions = execution_repository or InMemoryTaskExecutionRepository()
    resolved_plans = plan_repository or InMemoryStudyPlanRepository()
    resolved_reflections = reflection_repository or InMemoryConfirmedReflectionRepository()
    resolved_decompositions = task_decomposition_sessions or InMemoryTaskDecompositionSessionStore()
    llm_adapter = (
        OpenAIResponsesAdapter(llm_settings, transport=llm_transport)
        if llm_settings is not None and llm_settings.unavailable_reason is None
        else None
    )
    resolved_explanation_provider = explanation_provider or llm_adapter
    resolved_decomposition_provider = task_decomposition_provider or llm_adapter
    resolved_grounded_provider = grounded_answer_provider or llm_adapter
    unavailable_reason = (
        llm_settings.unavailable_reason
        if llm_settings is not None and llm_settings.unavailable_reason is not None
        else "not_configured"
    )
    llm_timeout = llm_settings.timeout_seconds if llm_settings is not None else 2.0
    transaction_manager = InMemoryPersistenceTransactionManager(
        resolved_tasks, resolved_executions, imported_academic_data, resolved_decompositions
    )
    generator = GenerateDailyRecommendation(lms=resolved_lms, clock=resolved_clock)
    reflection_candidates = GenerateReflectionCandidates(
        task_repository=resolved_tasks,
        execution_repository=resolved_executions,
        submit_reflection=SubmitReflection(clock=resolved_clock),
    )
    create_task = CreateStudyTask(
        lms=resolved_lms,
        tasks=resolved_tasks,
        clock=resolved_clock,
        transaction_manager=transaction_manager,
    )
    corpus_root = knowledge_root or Path(__file__).resolve().parents[5] / "data"
    knowledge_retriever = LocalLexicalKnowledgeRetriever(ingest_manifest(corpus_root))
    return AppContainer(
        compass_answer=GroundedAnswerService(
            template=TemplateGroundedAnswerProvider(),
            provider=resolved_grounded_provider,
            timeout_seconds=llm_timeout,
            unavailable_reason=unavailable_reason,
        ),
        query_knowledge=QueryKnowledge(
            retriever=knowledge_retriever,
            template=TemplateGroundedAnswerProvider(),
            provider=resolved_grounded_provider,
            timeout_seconds=llm_timeout,
            unavailable_reason=unavailable_reason,
        ),
        explain_recommendation=ExplainRecommendation(
            template=TemplateExplanationProvider(),
            provider=resolved_explanation_provider,
            timeout_seconds=llm_timeout,
            unavailable_reason=unavailable_reason,
        ),
        generate_task_decomposition=GenerateTaskDecomposition(
            lms=resolved_lms,
            sessions=resolved_decompositions,
            fallback=DeterministicTaskDecompositionProvider(),
            provider=resolved_decomposition_provider,
            timeout_seconds=(
                task_decomposition_timeout_seconds
                if task_decomposition_provider is not None
                else llm_timeout
            ),
            unavailable_reason=unavailable_reason,
        ),
        confirm_task_decomposition=ConfirmTaskDecomposition(
            sessions=resolved_decompositions,
            create_task=create_task,
        ),
        task_decomposition_sessions=resolved_decompositions,
        lms=resolved_lms,
        imported_academic_data=imported_academic_data,
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
        create_study_task=create_task,
        transaction_manager=transaction_manager,
    )


def build_runtime_container() -> AppContainer:
    """Read process configuration at the composition boundary used by normal startup."""
    return build_container(llm_settings=LLMSettings.from_env())

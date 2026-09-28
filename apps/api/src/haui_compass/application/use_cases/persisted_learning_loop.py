"""Persistence-aware orchestration for the PLAN → REFLECT → ADAPT HTTP flow."""

from dataclasses import dataclass
from datetime import datetime

from haui_compass.application.lms_mapping import map_assignments, student_id_for
from haui_compass.application.ports.clock import Clock
from haui_compass.application.ports.executions import TaskExecutionRepository
from haui_compass.application.ports.lms import ExternalRef, LMSProvider
from haui_compass.application.ports.persistence import PersistenceError, PersistenceErrorCode
from haui_compass.application.ports.reflections import (
    ConfirmedReflectionRecordId,
    ConfirmedReflectionRepository,
    StoredConfirmedReflection,
)
from haui_compass.application.ports.study_plans import (
    PlanRecordId,
    StoredStudyPlan,
    StudyPlanRepository,
)
from haui_compass.application.ports.tasks import TaskRepository
from haui_compass.application.use_cases.confirm_reflection_signals import (
    ConfirmReflectionSignals,
    ConfirmReflectionSignalsRequest,
)
from haui_compass.application.use_cases.generate_weekly_plan import (
    GenerateWeeklyPlan,
    GenerateWeeklyPlanRequest,
)
from haui_compass.application.use_cases.replan_study_plan import (
    ReplanStudyPlan,
    ReplanStudyPlanRequest,
)
from haui_compass.application.use_cases.submit_reflection import (
    SubmitReflection,
    SubmitReflectionRequest,
    SubmitReflectionResult,
)
from haui_compass.domain.plans.plan import PlanPeriod, StudyWindow
from haui_compass.domain.plans.replanning import ReplanningResult, TaskRemainingEffort
from haui_compass.domain.reflections.reflection import ReflectionPeriod, ReflectionResponses
from haui_compass.domain.reflections.signals import CandidateReflectionSignals, ReflectionSignal
from haui_compass.domain.tasks.execution import TaskExecution


@dataclass(frozen=True, slots=True, kw_only=True)
class GeneratePersistedWeeklyPlanRequest:
    student: ExternalRef
    period: PlanPeriod
    study_windows: tuple[StudyWindow, ...]
    record_id: PlanRecordId


class GeneratePersistedWeeklyPlan:
    def __init__(
        self,
        *,
        task_repository: TaskRepository,
        plan_repository: StudyPlanRepository,
        lms: LMSProvider,
        clock: Clock,
        generator: GenerateWeeklyPlan | None = None,
    ) -> None:
        self._tasks = task_repository
        self._plans = plan_repository
        self._lms = lms
        self._clock = clock
        self._generator = generator or GenerateWeeklyPlan()

    def execute(self, request: GeneratePersistedWeeklyPlanRequest) -> StoredStudyPlan:
        student_id = student_id_for(request.student)
        tasks = tuple(record.task for record in self._tasks.list_for_student(student_id))
        assignments = tuple(
            item.assignment
            for item in map_assignments(self._lms.get_assignments(request.student)).mapped
        )
        now = self._clock.now()
        plan = self._generator.execute(
            GenerateWeeklyPlanRequest(
                student_id=student_id,
                tasks=tasks,
                assignments=assignments,
                period=request.period,
                study_windows=request.study_windows,
                generated_at=now,
            )
        )
        return self._plans.save_initial(record_id=request.record_id, plan=plan, saved_at=now)


@dataclass(frozen=True, slots=True, kw_only=True)
class GenerateReflectionCandidatesRequest:
    student: ExternalRef
    period: ReflectionPeriod
    responses: ReflectionResponses


class GenerateReflectionCandidates:
    def __init__(
        self,
        *,
        task_repository: TaskRepository,
        execution_repository: TaskExecutionRepository,
        submit_reflection: SubmitReflection,
    ) -> None:
        self._tasks = task_repository
        self._executions = execution_repository
        self._submit = submit_reflection

    def execute(self, request: GenerateReflectionCandidatesRequest) -> SubmitReflectionResult:
        student_id = student_id_for(request.student)
        tasks = tuple(record.task for record in self._tasks.list_for_student(student_id))
        executions: list[TaskExecution] = []
        for task in tasks:
            executions.extend(
                record.execution for record in self._executions.list_for_task(student_id, task.id)
            )
        return self._submit.execute(
            SubmitReflectionRequest(
                student_id=student_id,
                period=request.period,
                responses=request.responses,
                tasks=tasks,
                task_executions=tuple(executions),
            )
        )


class ReflectionSelectionError(ValueError):
    """A requested candidate identity was not in the server-regenerated candidate set."""


def candidate_signal_id(signal: ReflectionSignal) -> str:
    """Stable v0 API identity, derived from the complete typed signal (not a trust token)."""
    from haui_compass.domain.reflections.signals import (
        DeferredTaskSignal,
        DifficultTopicSignal,
        EstimationFeedbackSignal,
        WorkloadFeedbackSignal,
    )

    if isinstance(signal, EstimationFeedbackSignal):
        estimated = int(signal.estimated_duration.total_seconds())
        actual = int(signal.actual_duration.total_seconds())
        return f"estimation_feedback:{signal.task_id}:{estimated}:{actual}"
    if isinstance(signal, WorkloadFeedbackSignal):
        return f"workload_feedback:{signal.reported.value}"
    if isinstance(signal, DifficultTopicSignal):
        return f"difficult_topic:{signal.topic}"
    if isinstance(signal, DeferredTaskSignal):
        return f"deferred_task:{signal.task_id}"
    raise TypeError(f"unsupported reflection signal: {type(signal)!r}")


@dataclass(frozen=True, slots=True, kw_only=True)
class ConfirmPersistedReflectionRequest:
    student: ExternalRef
    period: ReflectionPeriod
    responses: ReflectionResponses
    selected_signal_ids: tuple[str, ...]
    record_id: ConfirmedReflectionRecordId


class ConfirmPersistedReflection:
    def __init__(
        self,
        *,
        candidates: GenerateReflectionCandidates,
        confirmer: ConfirmReflectionSignals,
        repository: ConfirmedReflectionRepository,
    ) -> None:
        self._candidates = candidates
        self._confirmer = confirmer
        self._repository = repository

    def execute(self, request: ConfirmPersistedReflectionRequest) -> StoredConfirmedReflection:
        candidate = self._candidates.execute(
            GenerateReflectionCandidatesRequest(
                student=request.student, period=request.period, responses=request.responses
            )
        ).candidate_signals
        selected = _selected_candidates(candidate, request.selected_signal_ids)
        confirmed = self._confirmer.execute(
            ConfirmReflectionSignalsRequest(candidate=candidate, selected_signals=selected)
        ).confirmed
        return self._repository.append(
            StoredConfirmedReflection(
                record_id=request.record_id, confirmed=confirmed, saved_at=confirmed.confirmed_at
            )
        )


def _selected_candidates(
    candidate: CandidateReflectionSignals, selected_ids: tuple[str, ...]
) -> tuple[ReflectionSignal, ...]:
    available = {candidate_signal_id(signal): signal for signal in candidate.signals}
    if len(set(selected_ids)) != len(selected_ids):
        raise ReflectionSelectionError("candidate signal ids must be unique")
    missing = [identifier for identifier in selected_ids if identifier not in available]
    if missing:
        raise ReflectionSelectionError("selected signal was not generated from this reflection")
    return tuple(available[identifier] for identifier in selected_ids)


@dataclass(frozen=True, slots=True, kw_only=True)
class ReplanPersistedStudyPlanRequest:
    student: ExternalRef
    period: PlanPeriod
    study_windows: tuple[StudyWindow, ...]
    remaining_efforts: tuple[TaskRemainingEffort, ...]
    effective_at: datetime
    record_id: PlanRecordId


class ReplanPersistedStudyPlan:
    def __init__(
        self,
        *,
        task_repository: TaskRepository,
        execution_repository: TaskExecutionRepository,
        reflection_repository: ConfirmedReflectionRepository,
        plan_repository: StudyPlanRepository,
        lms: LMSProvider,
        clock: Clock,
        replanner: ReplanStudyPlan | None = None,
    ) -> None:
        self._tasks = task_repository
        self._executions = execution_repository
        self._reflections = reflection_repository
        self._plans = plan_repository
        self._lms = lms
        self._clock = clock
        self._replanner = replanner or ReplanStudyPlan()

    def execute(self, request: ReplanPersistedStudyPlanRequest) -> StoredStudyPlan:
        student_id = student_id_for(request.student)
        baseline = self._plans.latest(student_id, request.period)
        if baseline is None:
            raise PersistenceError(PersistenceErrorCode.RECORD_NOT_FOUND, "plan was not found")
        tasks = tuple(record.task for record in self._tasks.list_for_student(student_id))
        executions = tuple(
            record.execution
            for task in tasks
            for record in self._executions.list_for_task(student_id, task.id)
        )
        from haui_compass.engines.execution.summary import summarize_task_executions

        summaries = tuple(
            summarize_task_executions(tuple(item for item in executions if item.task_id == task.id))
            for task in tasks
            if any(item.task_id == task.id for item in executions)
        )
        result: ReplanningResult = self._replanner.execute(
            ReplanStudyPlanRequest(
                baseline_plan=baseline.plan,
                tasks=tasks,
                assignments=tuple(
                    item.assignment
                    for item in map_assignments(self._lms.get_assignments(request.student)).mapped
                ),
                study_windows=request.study_windows,
                remaining_efforts=request.remaining_efforts,
                execution_summaries=summaries,
                confirmed_reflections=tuple(
                    record.confirmed for record in self._reflections.list_for_student(student_id)
                ),
                effective_at=request.effective_at,
            )
        )
        return self._plans.save_revision(
            record_id=request.record_id,
            baseline_record_id=baseline.record_id,
            result=result,
            saved_at=self._clock.now(),
        )

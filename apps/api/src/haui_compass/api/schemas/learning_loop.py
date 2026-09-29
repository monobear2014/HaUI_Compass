from datetime import datetime, timedelta
from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field, field_validator

from haui_compass.api.schemas.common import ApiModel, ExternalRefDTO, require_aware
from haui_compass.application.ports.study_plans import StoredStudyPlan
from haui_compass.application.use_cases.persisted_learning_loop import candidate_signal_id
from haui_compass.domain.plans.plan import PlanPeriod, StudyWindow
from haui_compass.domain.plans.replanning import TaskRemainingEffort
from haui_compass.domain.reflections.reflection import (
    ReflectionPeriod,
    ReflectionResponses,
    WorkloadFeedback,
)
from haui_compass.domain.reflections.signals import (
    DeferredTaskSignal,
    DifficultTopicSignal,
    EstimationFeedbackSignal,
    WorkloadFeedbackSignal,
)
from haui_compass.domain.tasks.task import TaskId


class PlanPeriodDTO(ApiModel):
    start: datetime
    end: datetime

    _start_aware = field_validator("start")(require_aware)
    _end_aware = field_validator("end")(require_aware)

    def to_domain(self) -> PlanPeriod:
        return PlanPeriod(start=self.start, end=self.end)


class StudyWindowDTO(ApiModel):
    starts_at: datetime
    ends_at: datetime

    _start_aware = field_validator("starts_at")(require_aware)
    _end_aware = field_validator("ends_at")(require_aware)

    def to_domain(self) -> StudyWindow:
        return StudyWindow(starts_at=self.starts_at, ends_at=self.ends_at)


class WeeklyPlanRequest(ApiModel):
    student: ExternalRefDTO
    record_id: UUID
    period: PlanPeriodDTO
    study_windows: tuple[StudyWindowDTO, ...]


class StudyBlockDTO(ApiModel):
    task_id: UUID
    starts_at: datetime
    ends_at: datetime


class UnplannedTaskDTO(ApiModel):
    task_id: UUID
    remaining_duration_seconds: int = Field(gt=0)
    reason: str


class PlanRecordDTO(ApiModel):
    kind: Literal["study_plan"] = "study_plan"
    record_id: UUID
    revision: int
    parent_record_id: UUID | None
    period: PlanPeriodDTO
    generated_at: datetime
    saved_at: datetime
    planner_version: int
    blocks: tuple[StudyBlockDTO, ...]
    unplanned_tasks: tuple[UnplannedTaskDTO, ...]


def plan_record_response(record: StoredStudyPlan) -> PlanRecordDTO:
    plan = record.plan
    return PlanRecordDTO(
        record_id=UUID(str(record.record_id)),
        revision=record.revision,
        parent_record_id=(UUID(str(record.parent_record_id)) if record.parent_record_id else None),
        period=PlanPeriodDTO(start=plan.period.start, end=plan.period.end),
        generated_at=plan.generated_at,
        saved_at=record.saved_at,
        planner_version=plan.planner_version,
        blocks=tuple(
            StudyBlockDTO(
                task_id=UUID(str(item.task_id)), starts_at=item.starts_at, ends_at=item.ends_at
            )
            for item in plan.blocks
        ),
        unplanned_tasks=tuple(
            UnplannedTaskDTO(
                task_id=UUID(str(item.task_id)),
                remaining_duration_seconds=int(item.remaining_effort.total_seconds()),
                reason=item.reason.value,
            )
            for item in plan.unplanned_tasks
        ),
    )


class ReflectionResponsesDTO(ApiModel):
    reflected_task_ids: tuple[UUID, ...] = ()
    workload_feedback: Literal["too_light", "appropriate", "too_heavy"] | None = None
    difficult_topics: tuple[str, ...] = ()
    deferred_task_ids: tuple[UUID, ...] = ()

    def to_domain(self) -> ReflectionResponses:
        return ReflectionResponses(
            reflected_task_ids=tuple(TaskId(item) for item in self.reflected_task_ids),
            workload_feedback=(
                WorkloadFeedback(self.workload_feedback) if self.workload_feedback else None
            ),
            difficult_topics=self.difficult_topics,
            deferred_task_ids=tuple(TaskId(item) for item in self.deferred_task_ids),
        )


class ReflectionContextRequest(ApiModel):
    student: ExternalRefDTO
    period: PlanPeriodDTO
    responses: ReflectionResponsesDTO

    def reflection_period(self) -> ReflectionPeriod:
        return ReflectionPeriod(start=self.period.start, end=self.period.end)


class EstimationCandidateDTO(ApiModel):
    kind: Literal["estimation_feedback"] = "estimation_feedback"
    id: str
    task_id: UUID
    estimated_duration_seconds: int
    actual_duration_seconds: int
    source: Literal["factual"] = "factual"


class WorkloadCandidateDTO(ApiModel):
    kind: Literal["workload_feedback"] = "workload_feedback"
    id: str
    reported: str
    source: Literal["self_reported"] = "self_reported"


class DifficultTopicCandidateDTO(ApiModel):
    kind: Literal["difficult_topic"] = "difficult_topic"
    id: str
    topic: str
    source: Literal["self_reported"] = "self_reported"


class DeferredTaskCandidateDTO(ApiModel):
    kind: Literal["deferred_task"] = "deferred_task"
    id: str
    task_id: UUID
    source: Literal["self_reported"] = "self_reported"


CandidateSignalDTO = Annotated[
    EstimationCandidateDTO
    | WorkloadCandidateDTO
    | DifficultTopicCandidateDTO
    | DeferredTaskCandidateDTO,
    Field(discriminator="kind"),
]


class ReflectionCandidatesResponse(ApiModel):
    kind: Literal["reflection_candidates"] = "reflection_candidates"
    candidates: tuple[CandidateSignalDTO, ...]


def candidate_response(signals: tuple[object, ...]) -> ReflectionCandidatesResponse:
    rows: list[CandidateSignalDTO] = []
    for signal in signals:
        identifier = candidate_signal_id(signal)  # type: ignore[arg-type]
        if isinstance(signal, EstimationFeedbackSignal):
            rows.append(
                EstimationCandidateDTO(
                    id=identifier,
                    task_id=UUID(str(signal.task_id)),
                    estimated_duration_seconds=int(signal.estimated_duration.total_seconds()),
                    actual_duration_seconds=int(signal.actual_duration.total_seconds()),
                )
            )
        elif isinstance(signal, WorkloadFeedbackSignal):
            rows.append(WorkloadCandidateDTO(id=identifier, reported=signal.reported.value))
        elif isinstance(signal, DifficultTopicSignal):
            rows.append(DifficultTopicCandidateDTO(id=identifier, topic=signal.topic))
        elif isinstance(signal, DeferredTaskSignal):
            rows.append(DeferredTaskCandidateDTO(id=identifier, task_id=UUID(str(signal.task_id))))
    return ReflectionCandidatesResponse(candidates=tuple(rows))


class ConfirmReflectionRequest(ReflectionContextRequest):
    record_id: UUID
    selected_signal_ids: tuple[str, ...]


class ConfirmedReflectionResponse(ApiModel):
    kind: Literal["confirmed_reflection"] = "confirmed_reflection"
    record_id: UUID
    confirmed_at: datetime
    saved_at: datetime
    confirmed_signal_ids: tuple[str, ...]


class ReplanRequest(ApiModel):
    student: ExternalRefDTO
    record_id: UUID
    period: PlanPeriodDTO
    study_windows: tuple[StudyWindowDTO, ...]
    remaining_efforts: tuple["RemainingEffortDTO", ...]
    effective_at: datetime

    _effective_aware = field_validator("effective_at")(require_aware)


class RemainingEffortDTO(ApiModel):
    task_id: UUID
    remaining_duration_seconds: int = Field(ge=0)

    def to_domain(self) -> TaskRemainingEffort:
        return TaskRemainingEffort(
            task_id=TaskId(self.task_id),
            remaining_duration=timedelta(seconds=self.remaining_duration_seconds),
        )


class PlanChangeDTO(ApiModel):
    task_id: UUID
    reasons: tuple[str, ...]
    had_execution_activity: bool


class ReplanningSummaryDTO(ApiModel):
    historical_block_count: int
    crossing_block_count: int
    preserved_future_block_count: int
    removed_future_block_count: int
    added_future_block_count: int
    moved_duration_seconds: int
    newly_unplanned_duration_seconds: int
    execution_context_task_count: int


class ReplanResponse(ApiModel):
    plan: PlanRecordDTO
    replanner_version: int
    informational_reflection_signals: tuple[str, ...]
    changes: tuple[PlanChangeDTO, ...]
    summary: ReplanningSummaryDTO


def replan_response(record: StoredStudyPlan) -> ReplanResponse:
    assert record.replanning_result is not None
    result = record.replanning_result
    summary = result.summary
    return ReplanResponse(
        plan=plan_record_response(record),
        replanner_version=result.replanner_version,
        informational_reflection_signals=tuple(
            item.value for item in result.informational_reflection_signals
        ),
        changes=tuple(
            PlanChangeDTO(
                task_id=UUID(str(item.task_id)),
                reasons=tuple(reason.value for reason in item.reasons),
                had_execution_activity=item.had_execution_activity,
            )
            for item in result.changes
        ),
        summary=ReplanningSummaryDTO(
            historical_block_count=summary.historical_block_count,
            crossing_block_count=summary.crossing_block_count,
            preserved_future_block_count=summary.preserved_future_block_count,
            removed_future_block_count=summary.removed_future_block_count,
            added_future_block_count=summary.added_future_block_count,
            moved_duration_seconds=int(summary.moved_duration.total_seconds()),
            newly_unplanned_duration_seconds=int(summary.newly_unplanned_duration.total_seconds()),
            execution_context_task_count=summary.execution_context_task_count,
        ),
    )

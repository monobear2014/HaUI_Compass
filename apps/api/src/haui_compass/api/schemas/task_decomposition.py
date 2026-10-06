from typing import Literal
from uuid import UUID

from pydantic import Field

from haui_compass.api.schemas.common import ApiModel, ExternalRefDTO
from haui_compass.application.ports.task_decomposition import (
    ConfirmedCandidateEdit,
    ConfirmedTaskDecomposition,
    TaskCandidateId,
    TaskDecompositionSession,
)


class GenerateTaskDecompositionRequestDTO(ApiModel):
    session_id: UUID
    student: ExternalRefDTO
    assignment: ExternalRefDTO


class TaskCandidateDTO(ApiModel):
    id: UUID
    title: str
    estimated_duration_minutes: int
    rationale: str | None
    source: Literal["ai", "demo_fallback"]


class TaskDecompositionResponse(ApiModel):
    session_id: UUID
    assignment: ExternalRefDTO
    assignment_title: str
    course_name: str
    source: Literal["ai", "demo_fallback"]
    fallback_reason: str | None
    candidates: tuple[TaskCandidateDTO, ...]


class ConfirmedCandidateDTO(ApiModel):
    candidate_id: UUID
    title: str = Field(min_length=3, max_length=120)
    estimated_duration_minutes: int = Field(ge=15, le=480)

    def to_application(self) -> ConfirmedCandidateEdit:
        return ConfirmedCandidateEdit(
            candidate_id=TaskCandidateId(self.candidate_id),
            title=self.title,
            estimated_duration_minutes=self.estimated_duration_minutes,
        )


class ConfirmTaskDecompositionRequestDTO(ApiModel):
    student: ExternalRefDTO
    selection: tuple[ConfirmedCandidateDTO, ...]


class CreatedTaskDTO(ApiModel):
    id: UUID
    title: str
    estimated_duration_minutes: int


class ConfirmTaskDecompositionResponse(ApiModel):
    session_id: UUID
    created_tasks: tuple[CreatedTaskDTO, ...]


def decomposition_response(session: TaskDecompositionSession) -> TaskDecompositionResponse:
    return TaskDecompositionResponse(
        session_id=UUID(str(session.id)),
        assignment=ExternalRefDTO(
            provider=session.assignment.provider,
            id=session.assignment.id,
        ),
        assignment_title=session.assignment_title,
        course_name=session.course_name,
        source=session.source,
        fallback_reason=session.fallback_reason,
        candidates=tuple(
            TaskCandidateDTO(
                id=UUID(str(candidate.id)),
                title=candidate.title,
                estimated_duration_minutes=candidate.estimated_duration_minutes,
                rationale=candidate.rationale,
                source=candidate.source,
            )
            for candidate in session.candidates
        ),
    )


def confirmation_response(
    result: ConfirmedTaskDecomposition,
) -> ConfirmTaskDecompositionResponse:
    return ConfirmTaskDecompositionResponse(
        session_id=UUID(str(result.session_id)),
        created_tasks=tuple(
            CreatedTaskDTO(
                id=UUID(str(record.task.id)),
                title=record.task.title,
                estimated_duration_minutes=int(record.task.estimated_duration.total_seconds() / 60),
            )
            for record in result.tasks
        ),
    )

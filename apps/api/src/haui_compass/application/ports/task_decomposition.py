"""Application-owned contracts for bounded task decomposition candidates."""

from dataclasses import dataclass
from datetime import datetime
from typing import Literal, NewType, Protocol
from uuid import UUID

from haui_compass.application.ports.lms import ExternalRef
from haui_compass.application.ports.tasks import StoredTask

TaskCandidateId = NewType("TaskCandidateId", UUID)
TaskDecompositionSessionId = NewType("TaskDecompositionSessionId", UUID)
CandidateSource = Literal["ai", "demo_fallback"]
FallbackReason = Literal["not_configured", "timeout", "provider_error", "invalid_output"]


@dataclass(frozen=True, slots=True, kw_only=True)
class TaskDecompositionInput:
    assignment: ExternalRef
    assignment_title: str
    deadline: datetime
    course_name: str
    course_code: str | None


@dataclass(frozen=True, slots=True, kw_only=True)
class ProviderTaskCandidate:
    """Typed provider output before trust-boundary validation."""

    title: str
    estimated_duration_minutes: int
    rationale: str | None = None


@dataclass(frozen=True, slots=True, kw_only=True)
class TaskCandidate:
    id: TaskCandidateId
    title: str
    estimated_duration_minutes: int
    rationale: str | None
    source: CandidateSource


@dataclass(frozen=True, slots=True, kw_only=True)
class TaskDecompositionSession:
    id: TaskDecompositionSessionId
    student: ExternalRef
    assignment: ExternalRef
    assignment_title: str
    course_name: str
    candidates: tuple[TaskCandidate, ...]
    source: CandidateSource
    fallback_reason: FallbackReason | None


@dataclass(frozen=True, slots=True, kw_only=True)
class ConfirmedCandidateEdit:
    candidate_id: TaskCandidateId
    title: str
    estimated_duration_minutes: int


@dataclass(frozen=True, slots=True, kw_only=True)
class ConfirmedTaskDecomposition:
    session_id: TaskDecompositionSessionId
    selection: tuple[ConfirmedCandidateEdit, ...]
    tasks: tuple[StoredTask, ...]


class TaskDecompositionProvider(Protocol):
    async def decompose(
        self, context: TaskDecompositionInput
    ) -> tuple[ProviderTaskCandidate, ...]: ...


class TaskDecompositionSessionStore(Protocol):
    def save(self, session: TaskDecompositionSession) -> TaskDecompositionSession: ...

    def get(self, session_id: TaskDecompositionSessionId) -> TaskDecompositionSession | None: ...

    def confirmation(
        self, session_id: TaskDecompositionSessionId
    ) -> ConfirmedTaskDecomposition | None: ...

    def save_confirmation(
        self, confirmation: ConfirmedTaskDecomposition
    ) -> ConfirmedTaskDecomposition: ...

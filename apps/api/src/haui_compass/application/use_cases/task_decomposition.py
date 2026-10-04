"""Generate bounded candidates, then persist only explicitly confirmed edits."""

import asyncio
from dataclasses import dataclass
from datetime import timedelta
from enum import StrEnum
from uuid import uuid5

from haui_compass.application.ports.lms import ExternalRef, LMSProvider
from haui_compass.application.ports.task_decomposition import (
    CandidateSource,
    ConfirmedCandidateEdit,
    ConfirmedTaskDecomposition,
    FallbackReason,
    ProviderTaskCandidate,
    TaskCandidate,
    TaskCandidateId,
    TaskDecompositionInput,
    TaskDecompositionProvider,
    TaskDecompositionSession,
    TaskDecompositionSessionId,
    TaskDecompositionSessionStore,
)
from haui_compass.application.use_cases.create_study_task import (
    CreateStudyTask,
    CreateStudyTaskRequest,
)
from haui_compass.domain.tasks.task import TaskId

MIN_CANDIDATES = 1
MAX_CANDIDATES = 5
MIN_TITLE_LENGTH = 3
MAX_TITLE_LENGTH = 120
MIN_DURATION_MINUTES = 15
MAX_DURATION_MINUTES = 480
MAX_RATIONALE_LENGTH = 240


class TaskDecompositionErrorCode(StrEnum):
    SESSION_NOT_FOUND = "task_decomposition_session_not_found"
    SESSION_CONFLICT = "task_decomposition_session_conflict"
    INVALID_SELECTION = "invalid_task_decomposition_selection"
    INVALID_PROVIDER_OUTPUT = "invalid_task_decomposition_provider_output"


class TaskDecompositionError(ValueError):
    def __init__(self, code: TaskDecompositionErrorCode, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True, slots=True, kw_only=True)
class GenerateTaskDecompositionRequest:
    session_id: TaskDecompositionSessionId
    student: ExternalRef
    assignment: ExternalRef


class GenerateTaskDecomposition:
    def __init__(
        self,
        *,
        lms: LMSProvider,
        sessions: TaskDecompositionSessionStore,
        fallback: TaskDecompositionProvider,
        provider: TaskDecompositionProvider | None = None,
        timeout_seconds: float = 2.0,
    ) -> None:
        if timeout_seconds <= 0:
            raise ValueError("task decomposition timeout must be positive")
        self._lms = lms
        self._sessions = sessions
        self._fallback = fallback
        self._provider = provider
        self._timeout = timeout_seconds

    async def execute(self, request: GenerateTaskDecompositionRequest) -> TaskDecompositionSession:
        existing = self._sessions.get(request.session_id)
        if existing is not None:
            if existing.student == request.student and existing.assignment == request.assignment:
                return existing
            raise TaskDecompositionError(
                TaskDecompositionErrorCode.SESSION_CONFLICT,
                "task decomposition session id is already used for another request",
            )
        context = self._context(request.student, request.assignment)
        source: CandidateSource = "demo_fallback"
        reason: FallbackReason | None = "not_configured"
        rows: tuple[ProviderTaskCandidate, ...] | object
        if self._provider is not None:
            try:
                rows = await asyncio.wait_for(
                    self._provider.decompose(context), timeout=self._timeout
                )
                validated = _validate_provider_output(rows)
                source = "ai"
                reason = None
            except TimeoutError:
                reason = "timeout"
            except TaskDecompositionError:
                reason = "invalid_output"
            except Exception:
                reason = "provider_error"
        if source == "demo_fallback":
            rows = await self._fallback.decompose(context)
            try:
                validated = _validate_provider_output(rows)
            except TaskDecompositionError as exc:
                raise RuntimeError("deterministic decomposition fallback is invalid") from exc
        candidates = tuple(
            TaskCandidate(
                id=TaskCandidateId(uuid5(request.session_id, f"candidate:{index}")),
                title=row.title.strip(),
                estimated_duration_minutes=row.estimated_duration_minutes,
                rationale=row.rationale.strip() if row.rationale else None,
                source=source,
            )
            for index, row in enumerate(validated)
        )
        return self._sessions.save(
            TaskDecompositionSession(
                id=request.session_id,
                student=request.student,
                assignment=request.assignment,
                assignment_title=context.assignment_title,
                course_name=context.course_name,
                candidates=candidates,
                source=source,
                fallback_reason=reason,
            )
        )

    def _context(self, student: ExternalRef, assignment: ExternalRef) -> TaskDecompositionInput:
        assignment_row = next(
            (row for row in self._lms.get_assignments(student) if row.ref == assignment), None
        )
        if assignment_row is None:
            # Preserve the provider's established not-found behavior and ownership check.
            self._lms.get_submission_statuses(student, assignments=[assignment])
            raise AssertionError("LMS accepted an assignment it did not return")
        course = next(
            row for row in self._lms.get_courses(student) if row.ref == assignment_row.course_ref
        )
        if assignment_row.deadline is None:
            raise TaskDecompositionError(
                TaskDecompositionErrorCode.INVALID_PROVIDER_OUTPUT,
                "assignment without a deadline cannot enter the current learning loop",
            )
        return TaskDecompositionInput(
            assignment=assignment_row.ref,
            assignment_title=assignment_row.title,
            deadline=assignment_row.deadline,
            course_name=course.name,
            course_code=course.code,
        )


@dataclass(frozen=True, slots=True, kw_only=True)
class ConfirmTaskDecompositionRequest:
    session_id: TaskDecompositionSessionId
    student: ExternalRef
    selection: tuple[ConfirmedCandidateEdit, ...]


class ConfirmTaskDecomposition:
    def __init__(
        self,
        *,
        sessions: TaskDecompositionSessionStore,
        create_task: CreateStudyTask,
    ) -> None:
        self._sessions = sessions
        self._create_task = create_task

    def execute(self, request: ConfirmTaskDecompositionRequest) -> ConfirmedTaskDecomposition:
        existing = self._sessions.confirmation(request.session_id)
        if existing is not None:
            if existing.selection == request.selection:
                return existing
            raise TaskDecompositionError(
                TaskDecompositionErrorCode.SESSION_CONFLICT,
                "task decomposition session was already confirmed with different edits",
            )
        return self._execute(request)

    def _execute(self, request: ConfirmTaskDecompositionRequest) -> ConfirmedTaskDecomposition:
        session = self._sessions.get(request.session_id)
        if session is None or session.student != request.student:
            raise TaskDecompositionError(
                TaskDecompositionErrorCode.SESSION_NOT_FOUND,
                "task decomposition session was not found",
            )
        if not request.selection:
            raise TaskDecompositionError(
                TaskDecompositionErrorCode.INVALID_SELECTION,
                "select at least one candidate",
            )
        available = {candidate.id: candidate for candidate in session.candidates}
        seen: set[TaskCandidateId] = set()
        titles: set[str] = set()
        for edit in request.selection:
            if edit.candidate_id in seen or edit.candidate_id not in available:
                raise TaskDecompositionError(
                    TaskDecompositionErrorCode.INVALID_SELECTION,
                    "selection must contain unique candidate ids issued by this session",
                )
            seen.add(edit.candidate_id)
            _validate_edit(edit)
            normalized_title = edit.title.strip().casefold()
            if normalized_title in titles:
                raise TaskDecompositionError(
                    TaskDecompositionErrorCode.INVALID_SELECTION,
                    "confirmed task titles must be unique",
                )
            titles.add(normalized_title)
        records = self._create_task.execute_many(
            tuple(
                CreateStudyTaskRequest(
                    student=request.student,
                    assignment=session.assignment,
                    task_id=TaskId(edit.candidate_id),
                    title=edit.title.strip(),
                    estimated_duration=timedelta(minutes=edit.estimated_duration_minutes),
                )
                for edit in request.selection
            )
        )
        return self._sessions.save_confirmation(
            ConfirmedTaskDecomposition(
                session_id=request.session_id,
                selection=request.selection,
                tasks=records,
            )
        )


def _validate_provider_output(rows: object) -> tuple[ProviderTaskCandidate, ...]:
    if not isinstance(rows, tuple) or not MIN_CANDIDATES <= len(rows) <= MAX_CANDIDATES:
        raise TaskDecompositionError(
            TaskDecompositionErrorCode.INVALID_PROVIDER_OUTPUT,
            f"provider must return {MIN_CANDIDATES} to {MAX_CANDIDATES} candidates",
        )
    validated: list[ProviderTaskCandidate] = []
    normalized_titles: set[str] = set()
    for row in rows:
        if not isinstance(row, ProviderTaskCandidate):
            raise TaskDecompositionError(
                TaskDecompositionErrorCode.INVALID_PROVIDER_OUTPUT,
                "provider candidate has an invalid shape",
            )
        title = row.title.strip() if isinstance(row.title, str) else ""
        if not MIN_TITLE_LENGTH <= len(title) <= MAX_TITLE_LENGTH:
            raise TaskDecompositionError(
                TaskDecompositionErrorCode.INVALID_PROVIDER_OUTPUT,
                "provider candidate title is outside allowed bounds",
            )
        normalized = title.casefold()
        if normalized in normalized_titles:
            raise TaskDecompositionError(
                TaskDecompositionErrorCode.INVALID_PROVIDER_OUTPUT,
                "provider candidate titles must be unique",
            )
        normalized_titles.add(normalized)
        if (
            not isinstance(row.estimated_duration_minutes, int)
            or isinstance(row.estimated_duration_minutes, bool)
            or not MIN_DURATION_MINUTES <= row.estimated_duration_minutes <= MAX_DURATION_MINUTES
        ):
            raise TaskDecompositionError(
                TaskDecompositionErrorCode.INVALID_PROVIDER_OUTPUT,
                "provider candidate duration is outside allowed bounds",
            )
        if row.rationale is not None and (
            not isinstance(row.rationale, str)
            or not row.rationale.strip()
            or len(row.rationale.strip()) > MAX_RATIONALE_LENGTH
        ):
            raise TaskDecompositionError(
                TaskDecompositionErrorCode.INVALID_PROVIDER_OUTPUT,
                "provider candidate rationale is invalid",
            )
        validated.append(row)
    return tuple(validated)


def _validate_edit(edit: ConfirmedCandidateEdit) -> None:
    title = edit.title.strip()
    if not MIN_TITLE_LENGTH <= len(title) <= MAX_TITLE_LENGTH:
        raise TaskDecompositionError(
            TaskDecompositionErrorCode.INVALID_SELECTION,
            "confirmed task title is outside allowed bounds",
        )
    if not MIN_DURATION_MINUTES <= edit.estimated_duration_minutes <= MAX_DURATION_MINUTES:
        raise TaskDecompositionError(
            TaskDecompositionErrorCode.INVALID_SELECTION,
            "confirmed task duration is outside allowed bounds",
        )

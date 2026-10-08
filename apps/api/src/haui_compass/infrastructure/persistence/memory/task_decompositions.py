"""Ephemeral candidate sessions; only confirmed tasks enter the task repository."""

from haui_compass.application.ports.task_decomposition import (
    ConfirmedTaskDecomposition,
    TaskDecompositionSession,
    TaskDecompositionSessionId,
)
from haui_compass.application.use_cases.task_decomposition import (
    TaskDecompositionError,
    TaskDecompositionErrorCode,
)


class InMemoryTaskDecompositionSessionStore:
    def __init__(self) -> None:
        self._sessions: dict[TaskDecompositionSessionId, TaskDecompositionSession] = {}
        self._confirmations: dict[TaskDecompositionSessionId, ConfirmedTaskDecomposition] = {}

    def save(self, session: TaskDecompositionSession) -> TaskDecompositionSession:
        existing = self._sessions.get(session.id)
        if existing is not None and existing != session:
            raise TaskDecompositionError(
                TaskDecompositionErrorCode.SESSION_CONFLICT,
                "task decomposition session id already exists",
            )
        self._sessions[session.id] = session
        return session

    def get(self, session_id: TaskDecompositionSessionId) -> TaskDecompositionSession | None:
        return self._sessions.get(session_id)

    def confirmation(
        self, session_id: TaskDecompositionSessionId
    ) -> ConfirmedTaskDecomposition | None:
        return self._confirmations.get(session_id)

    def save_confirmation(
        self, confirmation: ConfirmedTaskDecomposition
    ) -> ConfirmedTaskDecomposition:
        existing = self._confirmations.get(confirmation.session_id)
        if existing is not None and existing != confirmation:
            raise TaskDecompositionError(
                TaskDecompositionErrorCode.SESSION_CONFLICT,
                "task decomposition confirmation conflicts with an existing confirmation",
            )
        self._confirmations[confirmation.session_id] = confirmation
        return confirmation

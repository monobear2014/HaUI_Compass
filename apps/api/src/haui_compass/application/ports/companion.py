"""Account-owned long-term memory, exchanges and specialist-agent language boundary."""

from dataclasses import dataclass
from datetime import datetime
from typing import Literal, Protocol
from uuid import UUID

LEGACY_CONVERSATION_ID = UUID(int=0)

AgentRole = Literal["planner", "study_coach", "reflector", "companion"]


@dataclass(frozen=True, slots=True)
class AgentAdviceInput:
    role: AgentRole
    question: str
    facts: dict[str, object]
    memory: tuple[str, ...]
    recent_conversation: tuple[dict[str, str], ...]
    handoff: str = ""


class AgentAdviceProvider(Protocol):
    async def advise(self, request: AgentAdviceInput) -> str: ...


class CompanionRepository(Protocol):
    def memories(self, owner: str) -> list[dict[str, str]]: ...
    def save_memory(
        self, owner: str, identifier: UUID, kind: str, content: str, now: datetime
    ) -> dict[str, str]: ...
    def delete_memory(self, owner: str, identifier: UUID) -> bool: ...
    def conversations(
        self, owner: str, limit: int = 51, offset: int = 0
    ) -> list[dict[str, str]]: ...
    def conversation(self, owner: str, identifier: UUID) -> dict[str, str] | None: ...
    def create_conversation(
        self, owner: str, identifier: UUID, now: datetime
    ) -> dict[str, str]: ...
    def exchanges(
        self,
        owner: str,
        limit: int = 30,
        conversation_id: UUID | None = None,
        before: UUID | None = None,
    ) -> list[dict[str, object]]: ...
    def exchange(self, owner: str, identifier: UUID) -> dict[str, object] | None: ...
    def save_exchange(
        self, owner: str, identifier: UUID, value: dict[str, object]
    ) -> dict[str, object]: ...
    def clear_history(self, owner: str) -> None: ...

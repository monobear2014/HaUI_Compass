from copy import deepcopy
from datetime import datetime
from uuid import UUID

from haui_compass.application.ports.companion import LEGACY_CONVERSATION_ID


class InMemoryCompanionRepository:
    def __init__(self) -> None:
        self._conversations: dict[tuple[str, UUID], dict[str, str]] = {}
        self._memories: dict[tuple[str, UUID], dict[str, str]] = {}
        self._exchanges: dict[tuple[str, UUID], dict[str, object]] = {}

    def memories(self, owner: str) -> list[dict[str, str]]:
        return deepcopy([v for (actor, _), v in self._memories.items() if actor == owner])

    def save_memory(
        self, owner: str, identifier: UUID, kind: str, content: str, now: datetime
    ) -> dict[str, str]:
        if (owner, identifier) not in self._memories and len(self.memories(owner)) >= 20:
            raise ValueError("Memory limit reached")
        value = {
            "id": str(identifier),
            "kind": kind,
            "content": content,
            "confirmed_at": now.isoformat(),
        }
        self._memories[owner, identifier] = value
        return deepcopy(value)

    def delete_memory(self, owner: str, identifier: UUID) -> bool:
        return self._memories.pop((owner, identifier), None) is not None

    def conversations(self, owner: str, limit: int = 51, offset: int = 0) -> list[dict[str, str]]:
        rows = [v for (actor, _), v in self._conversations.items() if actor == owner]
        rows.sort(key=lambda r: (r["updated_at"], r["id"]), reverse=True)
        return deepcopy(rows[offset : offset + limit])

    def conversation(self, owner: str, identifier: UUID) -> dict[str, str] | None:
        return deepcopy(self._conversations.get((owner, identifier)))

    def create_conversation(self, owner: str, identifier: UUID, now: datetime) -> dict[str, str]:
        self._conversations.setdefault(
            (owner, identifier),
            {
                "id": str(identifier),
                "title": "",
                "created_at": now.isoformat(),
                "updated_at": now.isoformat(),
            },
        )
        return deepcopy(self._conversations[owner, identifier])

    def exchanges(
        self,
        owner: str,
        limit: int = 30,
        conversation_id: UUID | None = None,
        before: UUID | None = None,
    ) -> list[dict[str, object]]:
        rows = [
            v
            for (actor, _), v in self._exchanges.items()
            if actor == owner
            and (
                conversation_id is None
                or v.get("conversation_id", str(LEGACY_CONVERSATION_ID)) == str(conversation_id)
            )
        ]
        rows.sort(key=lambda row: (str(row["created_at"]), str(row["id"])))
        if before is not None:
            anchor = next((i for i, r in enumerate(rows) if r["id"] == str(before)), None)
            if anchor is None:
                raise ValueError("Unknown message cursor")
            rows = rows[:anchor]
        return deepcopy(rows[-limit:])

    def exchange(self, owner: str, identifier: UUID) -> dict[str, object] | None:
        return deepcopy(self._exchanges.get((owner, identifier)))

    def save_exchange(
        self, owner: str, identifier: UUID, value: dict[str, object]
    ) -> dict[str, object]:
        if (owner, identifier) in self._exchanges:
            return deepcopy(self._exchanges[owner, identifier])
        conversation = UUID(str(value.get("conversation_id", LEGACY_CONVERSATION_ID)))
        now = datetime.fromisoformat(str(value["created_at"]))
        if conversation == LEGACY_CONVERSATION_ID:
            self.create_conversation(owner, conversation, now)
        if (owner, conversation) not in self._conversations:
            raise ValueError("Conversation not found")
        row = self._conversations[owner, conversation]
        if not row["title"]:
            row["title"] = str(value["question"])[:80]
        row["updated_at"] = max(row["updated_at"], now.isoformat())
        self._exchanges.setdefault((owner, identifier), deepcopy(value))
        return deepcopy(self._exchanges[owner, identifier])

    def clear_history(self, owner: str) -> None:
        self._conversations = {key: v for key, v in self._conversations.items() if key[0] != owner}
        self._exchanges = {key: v for key, v in self._exchanges.items() if key[0] != owner}

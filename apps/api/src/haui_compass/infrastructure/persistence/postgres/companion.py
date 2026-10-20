from collections.abc import Callable
from datetime import datetime
from uuid import UUID

from sqlalchemy import delete, func, select, text, tuple_, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from haui_compass.application.ports.companion import LEGACY_CONVERSATION_ID
from haui_compass.infrastructure.persistence.postgres.models import (
    CompanionConversationRow,
    CompanionExchangeRow,
    CompanionMemoryRow,
)


class PostgresCompanionRepository:
    def __init__(self, provider: Callable[[], Session]) -> None:
        self._session = provider

    def memories(self, owner: str) -> list[dict[str, str]]:
        rows = self._session().scalars(
            select(CompanionMemoryRow)
            .where(CompanionMemoryRow.owner == owner)
            .order_by(CompanionMemoryRow.confirmed_at, CompanionMemoryRow.identifier)
        )
        return [
            {
                "id": str(r.identifier),
                "kind": r.kind,
                "content": r.content,
                "confirmed_at": r.confirmed_at.isoformat(),
            }
            for r in rows
        ]

    def save_memory(
        self, owner: str, identifier: UUID, kind: str, content: str, now: datetime
    ) -> dict[str, str]:
        session = self._session()
        session.execute(
            text("SELECT pg_advisory_xact_lock(hashtextextended(:owner, 7))"), {"owner": owner}
        )
        row = session.get(CompanionMemoryRow, (owner, identifier))
        if row is None:
            count = (
                session.scalar(
                    select(func.count())
                    .select_from(CompanionMemoryRow)
                    .where(CompanionMemoryRow.owner == owner)
                )
                or 0
            )
            if count >= 20:
                raise ValueError("Memory limit reached")
        session.execute(
            insert(CompanionMemoryRow)
            .values(
                owner=owner, identifier=identifier, kind=kind, content=content, confirmed_at=now
            )
            .on_conflict_do_update(
                index_elements=["owner", "identifier"],
                set_={"kind": kind, "content": content, "confirmed_at": now},
            )
        )
        return {
            "id": str(identifier),
            "kind": kind,
            "content": content,
            "confirmed_at": now.isoformat(),
        }

    def delete_memory(self, owner: str, identifier: UUID) -> bool:
        result = self._session().execute(
            delete(CompanionMemoryRow).where(
                CompanionMemoryRow.owner == owner, CompanionMemoryRow.identifier == identifier
            )
        )
        return bool(result.rowcount)  # type: ignore[attr-defined]

    def _adopt_legacy(self, owner: str) -> None:
        # Old workers may still write NULL conversation IDs during a rolling deploy.
        session = self._session()
        start, end = session.execute(
            select(
                func.min(CompanionExchangeRow.created_at), func.max(CompanionExchangeRow.created_at)
            ).where(
                CompanionExchangeRow.owner == owner, CompanionExchangeRow.conversation_id.is_(None)
            )
        ).one()
        if start is None:
            return
        session.execute(
            insert(CompanionConversationRow)
            .values(
                owner=owner,
                identifier=LEGACY_CONVERSATION_ID,
                title="Cuộc trò chuyện trước đây",
                created_at=start,
                updated_at=end,
            )
            .on_conflict_do_update(
                index_elements=["owner", "identifier"],
                set_={"updated_at": func.greatest(CompanionConversationRow.updated_at, end)},
            )
        )
        session.execute(
            update(CompanionExchangeRow)
            .where(
                CompanionExchangeRow.owner == owner, CompanionExchangeRow.conversation_id.is_(None)
            )
            .values(conversation_id=LEGACY_CONVERSATION_ID)
        )

    @staticmethod
    def _conversation_value(row: CompanionConversationRow) -> dict[str, str]:
        return {
            "id": str(row.identifier),
            "title": row.title,
            "created_at": row.created_at.isoformat(),
            "updated_at": row.updated_at.isoformat(),
        }

    def conversations(self, owner: str, limit: int = 51, offset: int = 0) -> list[dict[str, str]]:
        self._adopt_legacy(owner)
        rows = self._session().scalars(
            select(CompanionConversationRow)
            .where(CompanionConversationRow.owner == owner)
            .order_by(
                CompanionConversationRow.updated_at.desc(),
                CompanionConversationRow.identifier.desc(),
            )
            .offset(offset)
            .limit(limit)
        )
        return [self._conversation_value(row) for row in rows]

    def conversation(self, owner: str, identifier: UUID) -> dict[str, str] | None:
        if identifier == LEGACY_CONVERSATION_ID:
            self._adopt_legacy(owner)
        row = self._session().get(CompanionConversationRow, (owner, identifier))
        return self._conversation_value(row) if row else None

    def create_conversation(self, owner: str, identifier: UUID, now: datetime) -> dict[str, str]:
        self._session().execute(
            insert(CompanionConversationRow)
            .values(owner=owner, identifier=identifier, title="", created_at=now, updated_at=now)
            .on_conflict_do_nothing()
        )
        result = self.conversation(owner, identifier)
        assert result is not None
        return result

    def exchanges(
        self,
        owner: str,
        limit: int = 30,
        conversation_id: UUID | None = None,
        before: UUID | None = None,
    ) -> list[dict[str, object]]:
        if conversation_id == LEGACY_CONVERSATION_ID:
            self._adopt_legacy(owner)
        query = select(CompanionExchangeRow).where(CompanionExchangeRow.owner == owner)
        if conversation_id is not None:
            query = query.where(CompanionExchangeRow.conversation_id == conversation_id)
        if before is not None:
            anchor = self._session().get(CompanionExchangeRow, (owner, before))
            if anchor is None or (
                conversation_id is not None and anchor.conversation_id != conversation_id
            ):
                raise ValueError("Unknown message cursor")
            query = query.where(
                tuple_(CompanionExchangeRow.created_at, CompanionExchangeRow.identifier)
                < tuple_(anchor.created_at, anchor.identifier)
            )
        rows = list(
            self._session().scalars(
                query.order_by(
                    CompanionExchangeRow.created_at.desc(), CompanionExchangeRow.identifier.desc()
                ).limit(limit)
            )
        )
        return [dict(row.payload) for row in reversed(rows)]

    def exchange(self, owner: str, identifier: UUID) -> dict[str, object] | None:
        row = self._session().get(CompanionExchangeRow, (owner, identifier))
        return None if row is None else dict(row.payload)

    def save_exchange(
        self, owner: str, identifier: UUID, value: dict[str, object]
    ) -> dict[str, object]:
        conversation_id = UUID(str(value.get("conversation_id", LEGACY_CONVERSATION_ID)))
        now = datetime.fromisoformat(str(value["created_at"]))
        if conversation_id == LEGACY_CONVERSATION_ID:
            self.create_conversation(owner, conversation_id, now)
        conversation = self._session().scalar(
            select(CompanionConversationRow)
            .where(
                CompanionConversationRow.owner == owner,
                CompanionConversationRow.identifier == conversation_id,
            )
            .with_for_update()
        )
        if conversation is None:
            raise ValueError("Conversation not found")
        inserted = self._session().scalar(
            insert(CompanionExchangeRow)
            .values(
                owner=owner,
                identifier=identifier,
                conversation_id=conversation_id,
                created_at=now,
                payload=value,
            )
            .on_conflict_do_nothing()
            .returning(CompanionExchangeRow.identifier)
        )
        if inserted is not None:
            if not conversation.title:
                conversation.title = str(value["question"])[:80]
            conversation.updated_at = max(conversation.updated_at, now)
            self._session().flush()
        result = self.exchange(owner, identifier)
        assert result is not None
        return result

    def clear_history(self, owner: str) -> None:
        self._session().execute(
            delete(CompanionExchangeRow).where(CompanionExchangeRow.owner == owner)
        )

        self._session().execute(
            delete(CompanionConversationRow).where(CompanionConversationRow.owner == owner)
        )

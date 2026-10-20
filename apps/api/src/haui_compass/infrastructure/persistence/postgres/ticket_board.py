from collections.abc import Callable

from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from haui_compass.infrastructure.persistence.postgres.models import TicketBoardRow


class PostgresTicketBoardRepository:
    def __init__(self, provider: Callable[[], Session]) -> None:
        self.session = provider

    def get(self, owner: str, scope: str) -> dict[str, object] | None:
        row = self.session().get(TicketBoardRow, (owner, scope))
        return None if row is None else dict(row.payload)

    def save(self, owner: str, scope: str, value: dict[str, object], version: int) -> bool:
        session = self.session()
        session.execute(
            text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 8))"),
            {"key": owner + ":" + scope},
        )
        old = self.get(owner, scope)
        if (old or {}).get("version", 0) != version:
            return False
        session.execute(
            insert(TicketBoardRow)
            .values(owner=owner, scope=scope, payload=value)
            .on_conflict_do_update(index_elements=["owner", "scope"], set_={"payload": value})
        )
        return True

import json
import os
from uuid import UUID, uuid4

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from haui_compass.infrastructure.persistence.postgres.companion import PostgresCompanionRepository


@pytest.mark.postgres
def test_existing_companion_history_is_preserved_in_a_legacy_conversation() -> None:
    engine = create_engine(os.environ["HAUI_COMPASS_TEST_DATABASE_URL"])
    config = Config("alembic.ini")
    payload = {
        "id": str(uuid4()),
        "question": "Previous synthetic question",
        "response": {},
        "created_at": "2026-10-19T10:00:00+00:00",
    }
    command.downgrade(config, "0008_ticket_boards")
    try:
        with engine.begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO companion_exchanges(owner,identifier,payload) "
                    "VALUES(:owner,:id,CAST(:payload AS json))"
                ),
                {"owner": "migration-student", "id": payload["id"], "payload": json.dumps(payload)},
            )
        command.upgrade(config, "head")
        with engine.connect() as connection:
            row = connection.execute(
                text(
                    "SELECT c.title,e.payload,e.conversation_id FROM companion_conversations c "
                    "JOIN companion_exchanges e ON c.owner=e.owner "
                    "AND c.identifier=e.conversation_id WHERE c.owner='migration-student'"
                )
            ).one()
            assert row.title == "Cuộc trò chuyện trước đây"
            assert row.payload == payload
            assert str(row.conversation_id) == "00000000-0000-0000-0000-000000000000"
        # An old deployed worker can still write a legacy message during rollout.
        with engine.begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO companion_exchanges(owner,identifier,payload) "
                    "VALUES(:owner,:id,CAST(:payload AS json))"
                ),
                {"owner": "rolling-worker", "id": payload["id"], "payload": json.dumps(payload)},
            )
        with Session(engine) as session, session.begin():
            repository = PostgresCompanionRepository(lambda: session)
            legacy = repository.conversations("rolling-worker")
            assert legacy[0]["id"] == "00000000-0000-0000-0000-000000000000"
            assert repository.exchanges("rolling-worker", 30, UUID(int=0)) == [payload]
    finally:
        command.upgrade(config, "head")
        engine.dispose()

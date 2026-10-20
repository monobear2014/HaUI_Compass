from collections.abc import Callable

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from haui_compass.infrastructure.persistence.postgres.models import LearningPreferenceRow


class PostgresLearningPreferenceRepository:
    def __init__(self, session_provider: Callable[[], Session]) -> None:
        self._session = session_provider

    def get(self, owner: str) -> dict[str, object] | None:
        row = self._session().get(LearningPreferenceRow, owner)
        return None if row is None else dict(row.preferences)

    def save(self, owner: str, value: dict[str, object]) -> None:
        self._session().execute(
            insert(LearningPreferenceRow)
            .values(owner=owner, preferences=value)
            .on_conflict_do_update(index_elements=["owner"], set_={"preferences": value})
        )

    def delete(self, owner: str) -> None:
        row = self._session().get(LearningPreferenceRow, owner)
        if row is not None:
            self._session().delete(row)

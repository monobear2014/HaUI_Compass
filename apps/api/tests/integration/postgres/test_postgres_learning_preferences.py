import os
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from haui_compass.api.app_factory import create_app
from haui_compass.api.postgres_dependencies import build_postgres_container
from haui_compass.infrastructure.config.database import DatabaseSettings
from support.clocks import FixedClock


@pytest.mark.postgres
def test_preferences_survive_recreated_application_and_delete(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("COMPASS_SERVICE_KEY", "test-preferences")
    url = os.getenv("HAUI_COMPASS_TEST_DATABASE_URL") or os.environ["DATABASE_URL"]

    def client(owner: str) -> TestClient:
        container = build_postgres_container(
            settings=DatabaseSettings(url=url),
            clock=FixedClock(datetime(2026, 10, 19, 2, tzinfo=UTC)),
        )
        return TestClient(
            create_app(container),
            headers={"X-Compass-Service-Key": "test-preferences", "X-Compass-User": owner},
        )

    path = "/api/v1/learning-preferences"
    profile = {
        "weekly_target_minutes": 120,
        "sessions": [{"weekday": 2, "start_minute": 1200, "duration_minutes": 60}],
        "difficult_topics": ["Bayes"],
    }
    assert client("a").post(path, json=profile).status_code == 200
    assert client("a").get(path).json()["preferences"]["difficult_topics"] == ["Bayes"]
    assert client("b").get(path).json()["preferences"] is None
    assert client("a").delete(path).status_code == 200
    assert client("a").get(path).json()["preferences"] is None

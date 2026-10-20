import json
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from haui_compass.api.app_factory import create_app
from haui_compass.api.dependencies import build_container
from support.clocks import FixedClock

PROFILE = {
    "timezone": "Asia/Ho_Chi_Minh",
    "weekly_target_minutes": 240,
    "sessions": [
        {"weekday": 1, "start_minute": 1200, "duration_minutes": 60},
        {"weekday": 3, "start_minute": 1140, "duration_minutes": 45},
    ],
    "difficult_topics": ["Tích vô hướng", "Bayes"],
}
PERIOD = {"start": "2026-10-18T17:00:00Z", "end": "2026-10-25T17:00:00Z"}
PATH = "/api/v1/learning-preferences"


def test_preferences_are_explicit_private_validated_and_do_not_write_plans(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("COMPASS_SERVICE_KEY", "preference-test")
    monkeypatch.setenv("COMPASS_LECTURER_GRANTS", json.dumps({"teacher": ["class"]}))
    container = build_container(clock=FixedClock(datetime(2026, 10, 19, 2, tzinfo=UTC)))
    app = create_app(container)

    def client(owner: str) -> TestClient:
        return TestClient(
            app, headers={"X-Compass-Service-Key": "preference-test", "X-Compass-User": owner}
        )

    a, b = client("a"), client("b")
    assert TestClient(app).get(PATH).status_code == 403
    assert client("teacher").get(PATH).status_code == 403
    assert a.get(PATH).json() == {"preferences": None}
    assert a.post(PATH, json=PROFILE).status_code == 200
    assert b.get(PATH).json() == {"preferences": None}
    assert a.get(PATH).json()["preferences"]["difficult_topics"] == PROFILE["difficult_topics"]
    assert a.get(PATH).json()["preferences"]["confirmed_at"]
    preview = a.post(PATH + "/preview", json=PERIOD)
    assert preview.status_code == 200
    windows = preview.json()["study_windows"]
    assert windows == [
        {"starts_at": "2026-10-19T13:00:00+00:00", "ends_at": "2026-10-19T14:00:00+00:00"},
        {"starts_at": "2026-10-21T12:00:00+00:00", "ends_at": "2026-10-21T12:45:00+00:00"},
    ]
    # Changed preferences replace the confirmed profile, never a saved plan.
    assert a.post(PATH, json={**PROFILE, "weekly_target_minutes": 300}).status_code == 200
    assert a.get(PATH).json()["preferences"]["weekly_target_minutes"] == 300
    assert a.delete(PATH).status_code == 200
    assert a.get(PATH).json() == {"preferences": None}
    assert a.post(PATH + "/preview", json=PERIOD).json()["study_windows"] == []
    for invalid in [
        {**PROFILE, "sessions": PROFILE["sessions"] * 2},
        {**PROFILE, "sessions": [{"weekday": 1, "start_minute": 1430, "duration_minutes": 60}]},
        {**PROFILE, "difficult_topics": ["x"] * 6},
        {**PROFILE, "owner": "b"},
        {**PROFILE, "confirmed_at": "forged"},
        {**PROFILE, "weekly_target_minutes": -1},
    ]:
        assert a.post(PATH, json=invalid).status_code == 422
    assert (
        a.post(
            PATH + "/preview", json={"start": PERIOD["start"], "end": "2026-12-01T00:00:00Z"}
        ).status_code
        == 422
    )

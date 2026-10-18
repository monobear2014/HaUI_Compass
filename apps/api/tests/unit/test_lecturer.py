from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from haui_compass.api.app_factory import create_app
from haui_compass.domain.lecturer import submission_progress


def test_submission_semantics() -> None:
    now = datetime(2026, 10, 18, tzinfo=UTC)
    result = submission_progress(
        [
            (now, now),
            (now, now - timedelta(seconds=1)),
            (now - timedelta(days=1), now),
            (now, None),
            (now + timedelta(days=1), None),
            (None, now),
            (now + timedelta(days=1), now),
            (now, now + timedelta(seconds=1)),
        ],
        as_of=now,
    )
    assert result == dict(
        on_time=3,
        late=1,
        not_submitted=2,
        not_yet_due=1,
        no_deadline=1,
        due_obligations=5,
        on_time_due=2,
        on_time_rate=40.0,
    )
    assert submission_progress([], as_of=now)["on_time_rate"] is None


def test_role_and_class_isolation(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("COMPASS_SERVICE_KEY", "test-only-service")
    monkeypatch.setenv(
        "COMPASS_LECTURER_GRANTS",
        '{"teacher-a":["canvas-demo-ai","canvas-demo-small"],"teacher-b":["canvas-demo-other"]}',
    )
    client = TestClient(create_app())
    url = "/api/v1/lecturer/classes"
    assert client.get(url).status_code == 403
    headers = {"X-Compass-Service-Key": "test-only-service"}
    assert client.get(url, headers=headers).status_code == 401
    headers["X-Compass-User"] = "student"
    assert client.get(url, headers=headers).status_code == 403
    headers["X-Compass-Role"] = "lecturer"
    assert client.get(url, headers=headers).status_code == 403
    headers["X-Compass-User"] = "teacher-a"
    response = client.get(url, headers=headers)
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    data = response.json()
    assert data["simulated"] is True
    assert len(data["classes"]) == 2
    main, small = data["classes"]
    assert main["progress"]["on_time_rate"] == 50
    assert small["suppressed"] and small["progress"] is None
    assert small["enrollment_count"] is None
    assert "student_id" not in response.text and "submitted_at" not in response.text
    for identifier in ("canvas-demo-other", "unknown"):
        assert client.get(f"{url}/{identifier}/progress", headers=headers).status_code == 404
    headers["X-Compass-Service-Key"] = "wrong"
    assert client.get(url, headers=headers).status_code == 403


def test_invalid_grants_fail_closed(monkeypatch: pytest.MonkeyPatch) -> None:
    from haui_compass.api.lecturer import lecturer_classes

    for value in ("[]", "{", '{"teacher": "lecturer"}', '{"teacher": [1]}'):
        monkeypatch.setenv("COMPASS_LECTURER_GRANTS", value)
        assert lecturer_classes("teacher") is None

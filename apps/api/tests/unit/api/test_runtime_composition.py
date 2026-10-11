import pytest

from haui_compass.api.dependencies import build_runtime_container


def test_vercel_runtime_fails_when_postgres_url_is_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.delenv("HAUI_COMPASS_DATABASE_URL", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)

    with pytest.raises(RuntimeError, match="HAUI_COMPASS_DATABASE_URL is required on Vercel"):
        build_runtime_container()


def test_local_runtime_keeps_in_memory_composition_without_database_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.delenv("HAUI_COMPASS_DATABASE_URL", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)

    container = build_runtime_container()

    assert container.task_repository.__class__.__name__ == "InMemoryTaskRepository"

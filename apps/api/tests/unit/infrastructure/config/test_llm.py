import pytest

from haui_compass.infrastructure.config.llm import LLMSettings


def test_disabled_by_default_even_when_api_key_exists(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "present-but-opt-in")
    monkeypatch.delenv("HAUI_COMPASS_LLM_ENABLED", raising=False)
    configured = LLMSettings.from_env()
    assert configured.enabled is False
    assert configured.unavailable_reason == "disabled"


def test_enabled_without_credential_is_safe_offline(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HAUI_COMPASS_LLM_ENABLED", "true")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    configured = LLMSettings.from_env()
    assert configured.enabled is True
    assert configured.unavailable_reason == "missing_credential"


def test_enabled_configuration_reads_model_base_url_and_timeout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("HAUI_COMPASS_LLM_ENABLED", "yes")
    monkeypatch.setenv("OPENAI_API_KEY", "test-secret")
    monkeypatch.setenv("HAUI_COMPASS_LLM_MODEL", "configured-model")
    monkeypatch.setenv("HAUI_COMPASS_LLM_BASE_URL", "https://gateway.invalid/v1/")
    monkeypatch.setenv("HAUI_COMPASS_LLM_TIMEOUT_SECONDS", "3.5")
    configured = LLMSettings.from_env()
    assert configured.unavailable_reason is None
    assert configured.model == "configured-model"
    assert configured.base_url == "https://gateway.invalid/v1"
    assert configured.timeout_seconds == 3.5

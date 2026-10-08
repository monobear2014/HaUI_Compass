"""Offline preflight must distinguish readiness, warnings and failures."""

from haui_compass.api.demo_preflight import (
    CheckStatus,
    run_preflight,
    run_preflight_from_env,
)
from haui_compass.infrastructure.config.llm import LLMSettings


def test_offline_preflight_is_ready_without_network_or_credential() -> None:
    report = run_preflight(LLMSettings())

    assert report.ready
    assert not report.has_warnings
    by_label = {check.label: check for check in report.checks}
    assert by_label["Backend"].status is CheckStatus.PASS
    assert by_label["Demo scenarios"].status is CheckStatus.PASS
    assert by_label["Web API"].status is CheckStatus.PASS
    assert by_label["Fallback"].status is CheckStatus.PASS
    assert by_label["Scenario reset"].status is CheckStatus.PASS


def test_enabled_llm_without_credential_warns_but_offline_demo_is_ready() -> None:
    report = run_preflight(LLMSettings(enabled=True))

    assert report.ready
    assert report.has_warnings
    credential = next(check for check in report.checks if check.label == "Credential")
    assert credential.status is CheckStatus.WARNING
    assert "MISSING" in credential.detail


def test_invalid_llm_timeout_is_a_preflight_failure(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setenv("HAUI_COMPASS_LLM_TIMEOUT_SECONDS", "not-a-number")

    report = run_preflight_from_env()

    assert not report.ready
    assert report.checks[0].label == "LLM configuration"
    assert report.checks[0].status is CheckStatus.FAILURE

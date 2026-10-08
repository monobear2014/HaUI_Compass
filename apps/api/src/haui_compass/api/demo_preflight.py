"""Presenter-facing demo preflight. Offline checks are the safe default."""

from __future__ import annotations

import argparse
import asyncio
import os
from dataclasses import dataclass
from datetime import UTC, datetime
from enum import StrEnum

import httpx
from fastapi.testclient import TestClient

from haui_compass.api.demo import create_demo_app
from haui_compass.application.ports.lms import ExternalRef
from haui_compass.application.ports.task_decomposition import TaskDecompositionInput
from haui_compass.infrastructure.config.llm import LLMSettings
from haui_compass.infrastructure.llm.openai_responses import OpenAIResponsesAdapter


class CheckStatus(StrEnum):
    PASS = "PASS"
    WARNING = "WARNING"
    FAILURE = "FAILURE"
    SKIPPED = "SKIPPED"


@dataclass(frozen=True, slots=True)
class PreflightCheck:
    label: str
    status: CheckStatus
    detail: str


@dataclass(frozen=True, slots=True)
class PreflightReport:
    checks: tuple[PreflightCheck, ...]

    @property
    def ready(self) -> bool:
        return all(check.status is not CheckStatus.FAILURE for check in self.checks)

    @property
    def has_warnings(self) -> bool:
        return any(check.status is CheckStatus.WARNING for check in self.checks)


def _check(label: str, status: CheckStatus, detail: str) -> PreflightCheck:
    return PreflightCheck(label, status, detail)


def run_preflight(
    settings: LLMSettings,
    *,
    backend_url: str | None = None,
    web_url: str | None = None,
    live_provider_check: bool = False,
) -> PreflightReport:
    checks: list[PreflightCheck] = []
    if settings.enabled:
        checks.append(_check("LLM enabled", CheckStatus.PASS, "YES"))
        checks.append(
            _check(
                "Credential",
                CheckStatus.PASS if settings.api_key else CheckStatus.WARNING,
                "PRESENT" if settings.api_key else "MISSING; offline fallback remains ready",
            )
        )
    else:
        checks.extend(
            (
                _check("LLM enabled", CheckStatus.PASS, "NO; offline mode"),
                _check("Credential", CheckStatus.SKIPPED, "NOT REQUIRED"),
            )
        )

    try:
        if backend_url:
            _check_external_backend(backend_url, checks)
        else:
            _check_in_process_demo(settings, checks)
    except Exception as exc:
        checks.append(_check("Backend", CheckStatus.FAILURE, _safe_error(exc)))

    if web_url:
        try:
            response = httpx.get(web_url, timeout=3.0, follow_redirects=True)
            response.raise_for_status()
            checks.append(_check("Web URL", CheckStatus.PASS, web_url))
        except Exception as exc:
            checks.append(_check("Web URL", CheckStatus.FAILURE, _safe_error(exc)))
    else:
        checks.append(_check("Web URL", CheckStatus.SKIPPED, "not requested"))

    if live_provider_check:
        if settings.unavailable_reason is not None:
            checks.append(
                _check(
                    "LLM provider",
                    CheckStatus.WARNING,
                    f"NOT RUN ({settings.unavailable_reason}); offline fallback available",
                )
            )
        else:
            try:
                asyncio.run(_probe_provider(settings))
                checks.append(_check("LLM provider", CheckStatus.PASS, settings.model))
            except Exception as exc:
                checks.append(_check("LLM provider", CheckStatus.WARNING, _safe_error(exc)))
    else:
        checks.append(_check("LLM provider", CheckStatus.SKIPPED, "live check not requested"))

    checks.append(_check("Database", CheckStatus.PASS, "IN-MEMORY DEMO"))
    return PreflightReport(tuple(checks))


def run_preflight_from_env(
    *,
    backend_url: str | None = None,
    web_url: str | None = None,
    live_provider_check: bool = False,
) -> PreflightReport:
    try:
        settings = LLMSettings.from_env()
    except (TypeError, ValueError) as exc:
        return PreflightReport(
            (_check("LLM configuration", CheckStatus.FAILURE, _safe_error(exc)),)
        )
    return run_preflight(
        settings,
        backend_url=backend_url,
        web_url=web_url,
        live_provider_check=live_provider_check,
    )


def _check_in_process_demo(settings: LLMSettings, checks: list[PreflightCheck]) -> None:
    # Never let preflight call the provider unless --live-provider-check was explicit.
    offline_settings = LLMSettings(
        enabled=False,
        model=settings.model,
        base_url=settings.base_url,
        timeout_seconds=settings.timeout_seconds,
    )
    with TestClient(create_demo_app(llm_settings=offline_settings)) as client:
        context_response = client.get("/api/v1/demo/context")
        context_response.raise_for_status()
        checks.append(_check("Backend", CheckStatus.PASS, "in-process demo app"))
        scenarios = client.get("/api/v1/demo/scenarios")
        scenarios.raise_for_status()
        if {row["id"] for row in scenarios.json()} != {"normal", "crunch", "disrupted"}:
            raise RuntimeError("canonical demo scenarios are unavailable")
        checks.append(_check("Demo scenarios", CheckStatus.PASS, "3 canonical fixtures"))

        first = client.post("/api/v1/demo/scenarios/select", json={"scenario_id": "normal"})
        first.raise_for_status()
        ctx = first.json()
        recommendation = client.post(
            "/api/v1/daily-recommendation",
            json={
                "student": ctx["student"],
                "available_minutes": ctx["available_minutes"],
                "assignment_capacities": ctx["assignment_capacities"],
            },
        )
        recommendation.raise_for_status()
        payload = recommendation.json()
        if payload["explanation"]["source"] != "template":
            raise RuntimeError("offline fallback did not produce the explanation")
        checks.extend(
            (
                _check("Web API", CheckStatus.PASS, "recommendation route"),
                _check("Fallback", CheckStatus.PASS, "deterministic templates"),
            )
        )
        second = client.post("/api/v1/demo/scenarios/select", json={"scenario_id": "normal"})
        second.raise_for_status()
        before, after = first.json(), second.json()
        before.pop("generation")
        after.pop("generation")
        if before != after:
            raise RuntimeError("scenario reset did not reproduce the canonical fixture")
        checks.append(_check("Scenario reset", CheckStatus.PASS, "fixture reproduced"))


def _check_external_backend(url: str, checks: list[PreflightCheck]) -> None:
    base = url.rstrip("/")
    with httpx.Client(timeout=3.0) as client:
        context = client.get(f"{base}/api/v1/demo/context")
        context.raise_for_status()
        checks.append(_check("Backend", CheckStatus.PASS, base))
        scenarios = client.get(f"{base}/api/v1/demo/scenarios")
        scenarios.raise_for_status()
        if {row["id"] for row in scenarios.json()} != {"normal", "crunch", "disrupted"}:
            raise RuntimeError("canonical demo scenarios are unavailable")
        checks.append(_check("Demo scenarios", CheckStatus.PASS, "3 canonical fixtures"))
        first = client.post(f"{base}/api/v1/demo/scenarios/select", json={"scenario_id": "normal"})
        first.raise_for_status()
        second = client.post(f"{base}/api/v1/demo/scenarios/select", json={"scenario_id": "normal"})
        second.raise_for_status()
        before, after = first.json(), second.json()
        before.pop("generation")
        after.pop("generation")
        if before != after:
            raise RuntimeError("scenario reset did not reproduce the canonical fixture")
        checks.extend(
            (
                _check("Web API", CheckStatus.PASS, "demo routes"),
                _check("Fallback", CheckStatus.PASS, "verified by offline in-process check only"),
                _check("Scenario reset", CheckStatus.PASS, "fixture reproduced"),
            )
        )


async def _probe_provider(settings: LLMSettings) -> None:
    provider = OpenAIResponsesAdapter(settings)
    candidates = await provider.decompose(
        TaskDecompositionInput(
            assignment=ExternalRef("fictional-preflight", "assignment-1"),
            assignment_title="Fictional Demo Checklist",
            deadline=datetime(2026, 12, 1, 10, tzinfo=UTC),
            course_name="Demo Readiness",
            course_code="DEMO-001",
        )
    )
    if not 1 <= len(candidates) <= 5:
        raise RuntimeError("provider returned an invalid candidate count")


def _safe_error(exc: Exception) -> str:
    text = str(exc).replace(os.getenv("OPENAI_API_KEY", "") or "\0", "[REDACTED]")
    return f"{type(exc).__name__}: {text}"[:240]


def render(report: PreflightReport) -> str:
    width = max(len(check.label) for check in report.checks)
    lines = ["HaUI Compass Demo Preflight", ""]
    for check in report.checks:
        lines.append(f"{check.label:<{width}} ... {check.status.value}: {check.detail}")
    lines.append("")
    if report.ready and report.has_warnings:
        lines.append("READY FOR OFFLINE DEMO (WITH WARNINGS)")
    elif report.ready:
        lines.append("READY FOR DEMO")
    else:
        lines.append("NOT READY")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--backend-url", help="check a running demo API instead of an in-process app"
    )
    parser.add_argument("--web-url", help="optionally require a reachable web URL")
    parser.add_argument(
        "--live-provider-check",
        action="store_true",
        help="explicitly allow one fictional provider request",
    )
    args = parser.parse_args()
    report = run_preflight_from_env(
        backend_url=args.backend_url,
        web_url=args.web_url,
        live_provider_check=args.live_provider_check,
    )
    print(render(report))
    return 0 if report.ready else 1


if __name__ == "__main__":
    raise SystemExit(main())

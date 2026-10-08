"""Opt-in LLM configuration loaded only by API composition roots."""

import os
from dataclasses import dataclass
from typing import Literal

ProviderUnavailableReason = Literal["disabled", "missing_credential"]


def _enabled(value: str | None) -> bool:
    return value is not None and value.strip().casefold() in {"1", "true", "yes", "on"}


@dataclass(frozen=True, slots=True, kw_only=True)
class LLMSettings:
    enabled: bool = False
    api_key: str | None = None
    model: str = "gpt-5-mini-2025-08-07"
    base_url: str = "https://api.openai.com/v1"
    timeout_seconds: float = 8.0

    def __post_init__(self) -> None:
        if not self.model.strip():
            raise ValueError("LLM model must not be blank")
        if not self.base_url.startswith(("https://", "http://")):
            raise ValueError("LLM base URL must use HTTP(S)")
        if self.timeout_seconds <= 0:
            raise ValueError("LLM timeout must be positive")

    @classmethod
    def from_env(cls) -> "LLMSettings":
        timeout = os.getenv("HAUI_COMPASS_LLM_TIMEOUT_SECONDS", "8")
        return cls(
            enabled=_enabled(os.getenv("HAUI_COMPASS_LLM_ENABLED")),
            api_key=os.getenv("OPENAI_API_KEY") or None,
            model=os.getenv("HAUI_COMPASS_LLM_MODEL", "gpt-5-mini-2025-08-07"),
            base_url=os.getenv("HAUI_COMPASS_LLM_BASE_URL", "https://api.openai.com/v1").rstrip(
                "/"
            ),
            timeout_seconds=float(timeout),
        )

    @property
    def unavailable_reason(self) -> ProviderUnavailableReason | None:
        if not self.enabled:
            return "disabled"
        if not self.api_key:
            return "missing_credential"
        return None

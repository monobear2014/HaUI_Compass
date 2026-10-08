"""Shared generation boundary for public knowledge and private document chat."""

import asyncio
import logging
from dataclasses import dataclass

from haui_compass.application.ports.knowledge import (
    AnswerSource,
    CitationEvidence,
    GroundedAnswerInput,
    GroundedAnswerProvider,
    ProviderGroundedAnswer,
)
from haui_compass.application.ports.llm import InvalidLLMOutputError

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class GeneratedAnswer:
    output: ProviderGroundedAnswer | None
    source: AnswerSource
    fallback_reason: str | None


class GroundedAnswerService:
    def __init__(
        self,
        *,
        template: GroundedAnswerProvider,
        provider: GroundedAnswerProvider | None,
        timeout_seconds: float,
        unavailable_reason: str,
    ) -> None:
        self.template = template
        self.provider = provider
        self.timeout_seconds = timeout_seconds
        self.unavailable_reason = unavailable_reason

    async def generate(self, request: GroundedAnswerInput) -> GeneratedAnswer:
        if self.provider is None:
            return GeneratedAnswer(
                await self.template.answer(request), "template", self.unavailable_reason
            )
        try:
            output = await asyncio.wait_for(
                self.provider.answer(request), timeout=self.timeout_seconds
            )
            return GeneratedAnswer(output, "ai", None)
        except TimeoutError:
            logger.warning("Grounded answer generation timed out")
            return GeneratedAnswer(None, "ai", "timeout")
        except InvalidLLMOutputError:
            logger.warning("Grounded answer provider returned invalid output")
            return GeneratedAnswer(None, "ai", "invalid_output")
        except Exception:
            # Never log provider exceptions: their payload may contain private context.
            logger.warning("Grounded answer provider failed")
            return GeneratedAnswer(None, "ai", "provider_error")


def validate_grounded_answer(
    output: object, evidence: tuple[CitationEvidence, ...]
) -> tuple[CitationEvidence, ...] | None:
    """Only backend-issued handles from this request may become persisted citations."""
    if not isinstance(output, ProviderGroundedAnswer) or output.abstained:
        return None
    if not isinstance(output.answer, str) or not output.answer.strip():
        return None
    handles = output.citation_handles
    if not handles or len(set(handles)) != len(handles):
        return None
    available = {item.citation_id: item for item in evidence}
    if any(handle not in available for handle in handles):
        return None
    return tuple(available[handle] for handle in handles)

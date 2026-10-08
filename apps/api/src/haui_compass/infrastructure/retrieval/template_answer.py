"""Deterministic offline grounded-answer fallback for the council demo."""

import re

from haui_compass.application.ports.knowledge import (
    GroundedAnswerInput,
    ProviderGroundedAnswer,
)


class TemplateGroundedAnswerProvider:
    async def answer(self, request: GroundedAnswerInput) -> ProviderGroundedAnswer:
        if not request.evidence:
            return ProviderGroundedAnswer(answer="", citation_handles=(), abstained=True)
        rows: list[str] = []
        handles: list[str] = []
        # The offline fallback deliberately summarizes only the strongest chunk. It avoids
        # stitching loosely related passages into a fluent but unsupported synthesis.
        for item in request.evidence[:1]:
            excerpt = _excerpt(item.content)
            if excerpt:
                rows.append(f"{excerpt} [{item.citation_id}]")
                handles.append(item.citation_id)
        if not rows:
            return ProviderGroundedAnswer(answer="", citation_handles=(), abstained=True)
        return ProviderGroundedAnswer(
            answer="Theo tài liệu hiện có:\n\n" + "\n\n".join(rows),
            citation_handles=tuple(handles),
        )


def _excerpt(content: str) -> str:
    clean = re.sub(r"\s+", " ", content).strip()
    if len(clean) <= 420:
        return clean
    boundary = clean.rfind(". ", 0, 420)
    return clean[: boundary + 1 if boundary >= 160 else 420].rstrip() + "…"

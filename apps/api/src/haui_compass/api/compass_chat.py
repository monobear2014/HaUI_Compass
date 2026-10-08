"""Server-to-server generation only. The web backend owns auth, retrieval and persistence.

Never mount this as a public knowledge query: the shared secret attests that supplied
chunks were already scoped to the authenticated owner/session by the web backend.
"""

import json
import logging
import os
import secrets
from pathlib import Path
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field

from haui_compass.api.dependencies import AppContainer
from haui_compass.api.v1.routes import container_from_app
from haui_compass.application.ports.documents import PdfExtractionError
from haui_compass.application.ports.evaluation import (
    evaluation_events,
    record_provider_metadata,
)
from haui_compass.application.ports.knowledge import (
    CitationEvidence,
    ConversationTurn,
    GroundedAnswerInput,
)
from haui_compass.application.use_cases.grounded_answer import validate_grounded_answer
from haui_compass.application.use_cases.query_knowledge import ABSTENTION_MESSAGE

router = APIRouter()
logger = logging.getLogger(__name__)


class EvidenceDTO(BaseModel):
    chunk_id: str = Field(max_length=100)
    document_id: str = Field(max_length=100)
    filename: str = Field(max_length=180)
    heading: str | None = Field(default=None, max_length=3000)
    page_number: int | None = Field(default=None, ge=1, le=200)
    content: str = Field(max_length=3200)


class TurnDTO(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=4000)


class GenerateDTO(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    evidence: list[EvidenceDTO] = Field(max_length=6)
    history: list[TurnDTO] = Field(default_factory=list, max_length=8)


def require_service_key(
    key: Annotated[str | None, Header(alias="X-Compass-Service-Key")] = None,
) -> None:
    configured = os.environ.get("COMPASS_SERVICE_KEY", "")
    if (
        not configured
        or not key
        or not secrets.compare_digest(configured.encode("utf-8"), key.encode("utf-8"))
    ):
        raise HTTPException(403, "forbidden")


@router.post("/internal/compass/answer", dependencies=[Depends(require_service_key)])
async def generate_answer(
    request: GenerateDTO,
    container: Annotated[AppContainer, Depends(container_from_app)],
    request_id: Annotated[str | None, Header(alias="X-Compass-Request-Id")] = None,
) -> dict[str, object]:
    if not request.evidence:
        return {"answer": ABSTENTION_MESSAGE, "citations": [], "status": "abstained"}
    # A disabled provider is an operational error, not a fabricated AI answer.
    if container.compass_answer.provider is None:
        raise HTTPException(503, "llm_unavailable")
    evidence = tuple(
        CitationEvidence(
            citation_id=f"c{index}",
            document_id=row.document_id,
            chunk_id=row.chunk_id,
            title=row.filename,
            source_url=None,
            local_path="",
            source_type="uploaded_private",
            page=row.page_number,
            section=row.heading,
            content=row.content,
        )
        for index, row in enumerate(request.evidence, start=1)
    )
    events: list[dict[str, object]] = []
    trace_path = os.environ.get("COMPASS_PROVIDER_TRACE_PATH")
    token = evaluation_events.set(events if trace_path else None)
    try:
        generated = await container.compass_answer.generate(
            GroundedAnswerInput(
                question=request.message,
                evidence=evidence,
                history=tuple(
                    ConversationTurn(role=row.role, content=row.content) for row in request.history
                ),
            )
        )
        record_provider_metadata({"failure_reason": generated.fallback_reason})
    finally:
        evaluation_events.reset(token)
        if trace_path and request_id:
            try:
                with Path(trace_path).open("a", encoding="utf-8") as stream:
                    for event in events:
                        stream.write(json.dumps({"request_id": request_id, **event}) + "\n")
            except OSError:
                logger.warning("Compass evaluation trace unavailable")
    if generated.output is None:
        raise HTTPException(503, generated.fallback_reason)
    validated = validate_grounded_answer(generated.output, evidence)
    if validated is None:
        if not generated.output.abstained:
            logger.warning("Compass citation validation failed")
        return {"answer": ABSTENTION_MESSAGE, "citations": [], "status": "abstained"}
    return {
        "answer": generated.output.answer.strip(),
        "status": "answered",
        "citations": [row.chunk_id for row in validated],
    }


@router.post("/internal/compass/extract-pdf", dependencies=[Depends(require_service_key)])
async def extract_pdf(
    request: Request,
    container: Annotated[AppContainer, Depends(container_from_app)],
) -> dict[str, object]:
    if request.headers.get("content-type", "").split(";")[0] != "application/pdf":
        raise HTTPException(415, "unsupported_format")
    content = bytearray()
    async for part in request.stream():
        content.extend(part)
        if len(content) > 5 * 1024 * 1024:
            raise HTTPException(413, "file_size")
    try:
        pages = await container.pdf_text_extractor.extract(bytes(content))
    except PdfExtractionError as exc:
        reason = str(exc)
        if reason in {"pdf_no_text", "pdf_empty", "pdf_encrypted"}:
            return {"status": "unsupported", "reason": reason, "pages": []}
        raise HTTPException(503 if reason == "pdf_extraction_timeout" else 400, reason) from None
    return {
        "status": "ready",
        "pages": [{"page_number": page.page_number, "text": page.text} for page in pages],
    }

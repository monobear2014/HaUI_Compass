"""Retrieve bounded evidence, generate an answer, and validate citations structurally."""

import re
from dataclasses import dataclass
from enum import StrEnum
from typing import Literal

from haui_compass.application.abbreviations import (
    ABBREVIATIONS,
    abbreviation_notes,
    english_expansion,
    expand_abbreviations,
)
from haui_compass.application.academic_integrity import GUIDANCE, requires_guidance
from haui_compass.application.ports.knowledge import (
    KNOWLEDGE_COURSES,
    AnswerSource,
    CitationEvidence,
    ConversationTurn,
    GroundedAnswerInput,
    GroundedAnswerProvider,
    KnowledgeRetriever,
    KnowledgeScope,
    KnowledgeSourceType,
    ProviderGroundedAnswer,
    RetrievalQuery,
    RetrievedChunk,
)
from haui_compass.application.use_cases.grounded_answer import (
    GroundedAnswerService,
)
from haui_compass.application.use_cases.grounded_answer import (
    validate_grounded_answer as validate_evidence,
)

ABSTENTION_MESSAGE = "Chưa tìm thấy đủ thông tin trong tài liệu hiện có để trả lời chắc chắn."


class KnowledgeQueryErrorCode(StrEnum):
    INVALID_QUESTION = "invalid_knowledge_question"
    INVALID_SCOPE = "invalid_knowledge_scope"
    INVALID_COURSE = "invalid_knowledge_course"


class KnowledgeQueryError(ValueError):
    def __init__(self, code: KnowledgeQueryErrorCode, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True, slots=True, kw_only=True)
class KnowledgeQueryRequest:
    question: str
    scope: KnowledgeScope
    course_id: str | None = None
    top_k: int = 5
    public_only: bool = False
    history: tuple[ConversationTurn, ...] = ()
    preferences: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True, kw_only=True)
class Citation:
    citation_id: str
    document_id: str
    chunk_id: str
    title: str
    source_url: str | None
    local_path: str
    source_type: KnowledgeSourceType
    page: int | None
    section: str | None


@dataclass(frozen=True, slots=True, kw_only=True)
class KnowledgeQueryResult:
    answer: str
    status: Literal["answered", "abstained"]
    citations: tuple[Citation, ...]
    retrieved: tuple[RetrievedChunk, ...]
    source: AnswerSource
    fallback_reason: str | None

    @property
    def source_count(self) -> int:
        return len({row.chunk.metadata.document_id for row in self.retrieved})


class QueryKnowledge:
    def __init__(
        self,
        *,
        retriever: KnowledgeRetriever,
        template: GroundedAnswerProvider,
        provider: GroundedAnswerProvider | None = None,
        timeout_seconds: float = 8.0,
        minimum_relevance: float = 0.30,
        unavailable_reason: str = "not_configured",
    ) -> None:
        if timeout_seconds <= 0 or not 0 <= minimum_relevance <= 1:
            raise ValueError("knowledge query configuration is invalid")
        self._retriever = retriever
        self._template = template
        self._provider = provider
        self._timeout = timeout_seconds
        self._minimum_relevance = minimum_relevance
        self._unavailable_reason = unavailable_reason

    async def execute(self, request: KnowledgeQueryRequest) -> KnowledgeQueryResult:
        question = request.question.strip()
        _validate_request(request, question)
        if requires_guidance(
            question, tuple(t.content for t in request.history if t.role == "user")
        ):
            return KnowledgeQueryResult(
                answer=GUIDANCE,
                status="abstained",
                citations=(),
                retrieved=(),
                source="template",
                fallback_reason="academic_integrity",
            )
        retrieval_question = question
        if request.history and re.search(
            r"\b(nó|tiếp|vừa rồi|khái niệm này|ví dụ|giải thích thêm|nói rõ hơn)\b", question, re.I
        ):
            prior = next((t.content for t in reversed(request.history) if t.role == "user"), "")
            retrieval_question = (prior[:350] + " " + question)[:500]
        retrieval_question = expand_abbreviations(retrieval_question)
        retrieved = self._retriever.retrieve(
            RetrievalQuery(
                query=retrieval_question,
                scope=request.scope,
                course_id=request.course_id,
                top_k=request.top_k,
                source_type="open_educational" if request.public_only else None,
            )
        )
        relevant = tuple(row for row in retrieved if row.relevance >= self._minimum_relevance)
        if not relevant or not _required_anchors_are_present(question, relevant):
            return _abstained(retrieved=retrieved, reason="insufficient_evidence")
        evidence = tuple(_evidence(index, row) for index, row in enumerate(relevant, start=1))
        notes = abbreviation_notes(question)
        answer_request = GroundedAnswerInput(
            question=question + (f" (viết tắt: {'; '.join(notes)})" if notes else ""),
            evidence=evidence,
            history=request.history[-6:],
            preferences=request.preferences[:20],
        )

        generated = await GroundedAnswerService(
            template=self._template,
            provider=self._provider,
            timeout_seconds=self._timeout,
            unavailable_reason=self._unavailable_reason,
        ).generate(answer_request)
        if generated.output is None:
            return _abstained(
                retrieved=retrieved, reason=generated.fallback_reason or "provider_error"
            )
        output = generated.output
        citations = validate_grounded_answer(output, evidence)
        if citations is None:
            reason = (
                "provider_abstained"
                if isinstance(output, ProviderGroundedAnswer) and output.abstained
                else "invalid_citations"
            )
            return _abstained(retrieved=retrieved, reason=reason)
        return KnowledgeQueryResult(
            answer=output.answer.strip(),
            status="answered",
            citations=citations,
            retrieved=retrieved,
            source=generated.source,
            fallback_reason=generated.fallback_reason,
        )


def validate_grounded_answer(
    output: object, evidence: tuple[CitationEvidence, ...]
) -> tuple[Citation, ...] | None:
    """Fail closed: only handles issued for this exact retrieval may become citations."""
    validated = validate_evidence(output, evidence)
    if validated is None or not isinstance(output, ProviderGroundedAnswer):
        return None
    if output.answer.strip() == ABSTENTION_MESSAGE:
        return None
    return tuple(
        Citation(
            citation_id=item.citation_id,
            document_id=item.document_id,
            chunk_id=item.chunk_id,
            title=item.title,
            source_url=item.source_url,
            local_path=item.local_path,
            source_type=item.source_type,
            page=item.page,
            section=item.section,
        )
        for item in validated
    )


def _validate_request(request: KnowledgeQueryRequest, question: str) -> None:
    if not 3 <= len(question) <= 500:
        raise KnowledgeQueryError(
            KnowledgeQueryErrorCode.INVALID_QUESTION,
            "question must contain between 3 and 500 characters",
        )
    if request.scope not in {"institutional", "course"}:
        raise KnowledgeQueryError(KnowledgeQueryErrorCode.INVALID_SCOPE, "unsupported scope")
    if request.scope == "institutional" and request.course_id is not None:
        raise KnowledgeQueryError(
            KnowledgeQueryErrorCode.INVALID_COURSE,
            "institutional scope must not include course_id",
        )
    if request.scope == "course" and request.course_id not in KNOWLEDGE_COURSES:
        raise KnowledgeQueryError(
            KnowledgeQueryErrorCode.INVALID_COURSE,
            f"course scope requires one of: {', '.join(KNOWLEDGE_COURSES)}",
        )
    if not 1 <= request.top_k <= 10:
        raise KnowledgeQueryError(
            KnowledgeQueryErrorCode.INVALID_QUESTION, "top_k is out of bounds"
        )


def _evidence(index: int, row: RetrievedChunk) -> CitationEvidence:
    metadata = row.chunk.metadata
    return CitationEvidence(
        citation_id=f"c{index}",
        document_id=metadata.document_id,
        chunk_id=metadata.chunk_id,
        title=metadata.title,
        source_url=metadata.source_url,
        local_path=metadata.local_path,
        source_type=metadata.source_type,
        page=metadata.page,
        section=metadata.section,
        content=row.chunk.content,
    )


def _abstained(*, retrieved: tuple[RetrievedChunk, ...], reason: str) -> KnowledgeQueryResult:
    return KnowledgeQueryResult(
        answer=(
            "Đã tìm thấy tài liệu liên quan nhưng chưa tạo được câu trả lời đã kiểm chứng. "
            "Bạn có thể thử lại hoặc mở tài liệu gốc để tra cứu."
            if reason in {"invalid_output", "invalid_citations", "provider_error", "timeout"}
            else ABSTENTION_MESSAGE
        ),
        status="abstained",
        citations=(),
        retrieved=retrieved,
        source="template",
        fallback_reason=reason,
    )


def _required_anchors_are_present(question: str, retrieved: tuple[RetrievedChunk, ...]) -> bool:
    """Do not answer when explicit acronym/version anchors are absent from evidence.

    Lexical overlap on generic words such as “khác” or “định nghĩa” must not make a chunk
    evidence for an unseen named concept such as MAE, RMSE or 3NF.
    """
    anchors = {
        token.casefold()
        for token in re.findall(r"\b[\w_]+\b", question)
        if token.casefold()
        not in {
            "trong",
            "khong",
            "nhung",
            "which",
            "explain",
            "please",
            "about",
            "using",
            "should",
            "would",
            "could",
            "their",
            "these",
            "those",
            "there",
            "where",
        }
        and len(token) >= 3
        and any(character.isalpha() for character in token)
        and (
            token.isupper()
            or any(character.isdigit() for character in token)
            or (len(token) >= 5 and token.isascii())
        )
    }
    if not anchors:
        return True
    evidence = " ".join(
        " ".join(
            (
                row.chunk.metadata.title,
                row.chunk.metadata.section or "",
                row.chunk.content,
            )
        )
        for row in retrieved
    ).casefold()
    words = set(re.findall(r"\b[\w_]+\b", evidence))
    return all(
        anchor in words
        or (
            anchor in ABBREVIATIONS
            and bool(english_expansion(anchor))
            and english_expansion(anchor).casefold() in evidence
        )
        for anchor in anchors
    )

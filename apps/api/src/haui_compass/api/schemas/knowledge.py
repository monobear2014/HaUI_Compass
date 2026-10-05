"""HTTP DTOs for the bounded, independent knowledge-query endpoint."""

from typing import Literal

from pydantic import Field, model_validator

from haui_compass.api.schemas.common import ApiModel
from haui_compass.application.use_cases.query_knowledge import KnowledgeQueryResult


class KnowledgeQueryRequestDTO(ApiModel):
    question: str = Field(min_length=3, max_length=500)
    scope: Literal["institutional", "course"]
    course_id: Literal["db", "ml", "se"] | None = None

    @model_validator(mode="after")
    def valid_scope(self) -> "KnowledgeQueryRequestDTO":
        if self.scope == "institutional" and self.course_id is not None:
            raise ValueError("institutional scope must not include course_id")
        if self.scope == "course" and self.course_id is None:
            raise ValueError("course scope requires course_id")
        return self


class CitationDTO(ApiModel):
    citation_id: str
    document_id: str
    chunk_id: str
    title: str
    source_url: str | None
    local_path: str
    source_type: Literal["official_public", "fictional_demo"]
    source_label: Literal["Nguồn công khai HaUI", "Tài liệu môn học demo"]
    page: int | None
    section: str | None


class RetrievalSummaryDTO(ApiModel):
    source_count: int
    chunk_count: int
    strategy: Literal["lexical", "embedding"]


class KnowledgeQueryResponseDTO(ApiModel):
    answer: str
    status: Literal["answered", "abstained"]
    citations: tuple[CitationDTO, ...]
    retrieval: RetrievalSummaryDTO
    source: Literal["ai", "template"]
    fallback_reason: str | None


def knowledge_response(result: KnowledgeQueryResult) -> KnowledgeQueryResponseDTO:
    strategy = result.retrieved[0].strategy if result.retrieved else "lexical"
    return KnowledgeQueryResponseDTO(
        answer=result.answer,
        status=result.status,
        citations=tuple(
            CitationDTO(
                citation_id=item.citation_id,
                document_id=item.document_id,
                chunk_id=item.chunk_id,
                title=item.title,
                source_url=item.source_url,
                local_path=item.local_path,
                source_type=item.source_type,
                source_label=(
                    "Nguồn công khai HaUI"
                    if item.source_type == "official_public"
                    else "Tài liệu môn học demo"
                ),
                page=item.page,
                section=item.section,
            )
            for item in result.citations
        ),
        retrieval=RetrievalSummaryDTO(
            source_count=result.source_count,
            chunk_count=len(result.retrieved),
            strategy=strategy,
        ),
        source=result.source,
        fallback_reason=result.fallback_reason,
    )

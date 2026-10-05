"""Provider-neutral contracts for bounded knowledge retrieval and grounded answers."""

from dataclasses import dataclass
from typing import Literal, Protocol

KnowledgeScope = Literal["institutional", "course"]
KnowledgeSourceType = Literal["official_public", "fictional_demo"]
AnswerSource = Literal["ai", "template"]


@dataclass(frozen=True, slots=True, kw_only=True)
class ChunkMetadata:
    chunk_id: str
    document_id: str
    title: str
    scope: KnowledgeScope
    document_type: str
    source_type: KnowledgeSourceType
    course_id: str | None
    source_url: str | None
    local_path: str
    version: str | None
    date: str | None
    chunk_index: int
    page: int | None
    section: str | None
    content_hash: str
    source_hash: str


@dataclass(frozen=True, slots=True, kw_only=True)
class KnowledgeChunk:
    content: str
    metadata: ChunkMetadata


@dataclass(frozen=True, slots=True, kw_only=True)
class RetrievalQuery:
    query: str
    scope: KnowledgeScope
    course_id: str | None
    top_k: int


@dataclass(frozen=True, slots=True, kw_only=True)
class RetrievedChunk:
    chunk: KnowledgeChunk
    rank: int
    relevance: float
    strategy: Literal["lexical", "embedding"]


class KnowledgeRetriever(Protocol):
    def retrieve(self, request: RetrievalQuery) -> tuple[RetrievedChunk, ...]: ...


@dataclass(frozen=True, slots=True, kw_only=True)
class CitationEvidence:
    citation_id: str
    document_id: str
    chunk_id: str
    title: str
    source_url: str | None
    local_path: str
    source_type: KnowledgeSourceType
    page: int | None
    section: str | None
    content: str


@dataclass(frozen=True, slots=True, kw_only=True)
class GroundedAnswerInput:
    question: str
    evidence: tuple[CitationEvidence, ...]


@dataclass(frozen=True, slots=True, kw_only=True)
class ProviderGroundedAnswer:
    answer: str
    citation_handles: tuple[str, ...]
    abstained: bool = False


class GroundedAnswerProvider(Protocol):
    async def answer(self, request: GroundedAnswerInput) -> ProviderGroundedAnswer: ...

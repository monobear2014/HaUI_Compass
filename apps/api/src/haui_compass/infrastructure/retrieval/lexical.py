"""Small reproducible lexical retriever; this is deliberately not semantic search."""

import math
import re
import unicodedata
from collections import Counter

from haui_compass.application.ports.knowledge import (
    KnowledgeChunk,
    RetrievalQuery,
    RetrievedChunk,
)

_STOP_WORDS = {
    "a",
    "an",
    "and",
    "các",
    "cần",
    "cho",
    "có",
    "của",
    "được",
    "gì",
    "how",
    "in",
    "is",
    "là",
    "những",
    "of",
    "phải",
    "the",
    "thế",
    "to",
    "trong",
    "và",
    "what",
}


class LocalLexicalKnowledgeRetriever:
    """BM25-like token ranking with mandatory scope/course filters."""

    def __init__(self, chunks: tuple[KnowledgeChunk, ...]) -> None:
        self._chunks = chunks

    def retrieve(self, request: RetrievalQuery) -> tuple[RetrievedChunk, ...]:
        candidates = tuple(
            chunk
            for chunk in self._chunks
            if chunk.metadata.scope == request.scope
            and (request.scope != "course" or chunk.metadata.course_id == request.course_id)
        )
        if not candidates:
            return ()
        # Explicit lexical expansion maps the demo's submission wording to the
        # authored deliverables phrase, while retaining the original query terms.
        query_text = request.query
        if "nộp những" in query_text.casefold() or "deliverables" in query_text.casefold():
            query_text += " đầu ra dự kiến"
        query_tokens = _tokens(query_text)
        if not query_tokens:
            return ()
        documents = [Counter(_tokens(_search_text(chunk))) for chunk in candidates]
        average_length = sum(sum(row.values()) for row in documents) / len(documents)
        document_frequency = Counter(
            token for token in query_tokens for row in documents if row[token] > 0
        )
        scored: list[tuple[float, str, KnowledgeChunk]] = []
        for chunk, frequencies in zip(candidates, documents, strict=True):
            length = max(1, sum(frequencies.values()))
            score = 0.0
            matched = 0
            for token in query_tokens:
                frequency = frequencies[token]
                if not frequency:
                    continue
                matched += 1
                inverse_frequency = math.log(
                    1
                    + (len(candidates) - document_frequency[token] + 0.5)
                    / (document_frequency[token] + 0.5)
                )
                score += (
                    inverse_frequency
                    * (frequency * 2.2)
                    / (frequency + 1.2 * (0.25 + 0.75 * length / max(average_length, 1)))
                )
            coverage = matched / len(query_tokens)
            normalized = min(1.0, coverage * 0.7 + (score / (score + 3)) * 0.3)
            if matched:
                scored.append((normalized, chunk.metadata.chunk_id, chunk))
        scored.sort(key=lambda row: (-row[0], row[1]))
        return tuple(
            RetrievedChunk(chunk=chunk, rank=rank, relevance=score, strategy="lexical")
            for rank, (score, _, chunk) in enumerate(scored[: request.top_k], start=1)
        )


def _search_text(chunk: KnowledgeChunk) -> str:
    metadata = chunk.metadata
    return " ".join((metadata.title, metadata.section or "", chunk.content))


def _tokens(text: str) -> tuple[str, ...]:
    normalized = unicodedata.normalize("NFC", text.casefold())
    return tuple(
        token
        for token in re.findall(r"[\wÀ-ỹ]+", normalized, flags=re.UNICODE)
        if len(token) > 1 and token not in _STOP_WORDS
    )

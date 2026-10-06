from pathlib import Path

from haui_compass.application.ports.knowledge import RetrievalQuery
from haui_compass.infrastructure.retrieval.ingestion import ingest_manifest
from haui_compass.infrastructure.retrieval.lexical import LocalLexicalKnowledgeRetriever

DATA_ROOT = Path(__file__).resolve().parents[6] / "data"


def retriever() -> LocalLexicalKnowledgeRetriever:
    return LocalLexicalKnowledgeRetriever(ingest_manifest(DATA_ROOT))


def test_course_scope_and_course_id_are_hard_filters() -> None:
    rows = retriever().retrieve(
        RetrievalQuery(
            query="MAE RMSE metric hồi quy",
            scope="course",
            course_id="db",
            top_k=5,
        )
    )
    assert all(row.chunk.metadata.course_id == "db" for row in rows)
    assert all("knowledge/courses/ml/" not in row.chunk.metadata.local_path for row in rows)


def test_institutional_scope_never_returns_fictional_course_documents() -> None:
    rows = retriever().retrieve(
        RetrievalQuery(
            query="các trình độ và loại hình đào tạo",
            scope="institutional",
            course_id=None,
            top_k=5,
        )
    )
    assert rows
    assert all(row.chunk.metadata.source_type == "official_public" for row in rows)

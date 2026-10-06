import json
from pathlib import Path

from haui_compass.infrastructure.retrieval.ingestion import ingest_manifest

DATA_ROOT = Path(__file__).resolve().parents[6] / "data"


def test_ingestion_is_deterministic_and_has_complete_provenance() -> None:
    first = ingest_manifest(DATA_ROOT)
    second = ingest_manifest(DATA_ROOT)
    assert first == second
    assert first
    assert len({item.metadata.chunk_id for item in first}) == len(first)
    assert all(item.metadata.content_hash and item.metadata.source_hash for item in first)
    assert all(item.metadata.local_path.startswith("knowledge/") for item in first)
    assert {item.metadata.scope for item in first} == {"institutional", "course"}


def test_markdown_chunks_preserve_real_sections_without_inventing_pages() -> None:
    chunks = ingest_manifest(DATA_ROOT)
    deliverables = next(
        item
        for item in chunks
        if item.metadata.local_path == "knowledge/courses/db/assignments.md"
        and item.metadata.section == "Database Mini Project"
    )
    assert "Đầu ra dự kiến" in deliverables.content
    assert deliverables.metadata.page is None


def test_pdf_extraction_preserves_page_boundaries(tmp_path: Path) -> None:
    data = tmp_path / "data"
    source = data / "knowledge/haui/sample.pdf"
    source.parent.mkdir(parents=True)
    source.write_bytes(b"fake text-extractable pdf fixture")
    import hashlib

    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    manifest = {
        "schema_version": "haui-compass-corpus-v1",
        "documents": [
            {
                "id": "pdf",
                "title": "PDF",
                "path": "knowledge/haui/sample.pdf",
                "group": "haui",
                "source_kind": "official_public",
                "course_id": None,
                "source_url": "https://haui.edu.vn/sample.pdf",
                "version": "1",
                "published_at": None,
                "collected_at": "2026-10-05T00:00:00+07:00",
                "sha256": digest,
            }
        ],
    }
    (data / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")

    class Reader:
        def pages(self, _: Path) -> tuple[str, ...]:
            return ("Trang một có nội dung.", "Trang hai có nội dung.")

    chunks = ingest_manifest(data, pdf_reader=Reader())
    assert [item.metadata.page for item in chunks] == [1, 2]

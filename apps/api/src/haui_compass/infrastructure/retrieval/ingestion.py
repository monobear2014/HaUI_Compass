"""Manifest-driven, deterministic structural chunking for the bounded v1 corpus."""

import hashlib
import json
import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from haui_compass.application.ports.knowledge import ChunkMetadata, KnowledgeChunk

DEFAULT_MAX_CHARS = 1_400


class CorpusIngestionError(ValueError):
    pass


class PdfPageReader(Protocol):
    """Small extraction seam: adapters return one text value per physical PDF page."""

    def pages(self, path: Path) -> Sequence[str]: ...


@dataclass(frozen=True, slots=True)
class _Unit:
    text: str
    section: str | None
    page: int | None


def ingest_manifest(
    data_root: Path,
    *,
    max_chars: int = DEFAULT_MAX_CHARS,
    pdf_reader: PdfPageReader | None = None,
) -> tuple[KnowledgeChunk, ...]:
    """Read registered knowledge documents only; demo/student snapshots are excluded."""
    if max_chars < 200:
        raise CorpusIngestionError("max_chars must be at least 200")
    manifest_path = data_root / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("schema_version") != "haui-compass-corpus-v1":
        raise CorpusIngestionError("unsupported corpus manifest")
    chunks: list[KnowledgeChunk] = []
    for document in sorted(manifest["documents"], key=lambda row: row["id"]):
        if document["group"] not in {"haui", "courses"}:
            continue
        path = data_root / document["path"]
        _verify_source(path, document["sha256"])
        units = _extract_units(path, pdf_reader)
        normalized = _pack_units(units, max_chars=max_chars)
        for chunk_index, unit in enumerate(normalized):
            content_hash = hashlib.sha256(unit.text.encode("utf-8")).hexdigest()
            identity = "\n".join(
                (
                    document["id"],
                    str(chunk_index),
                    unit.section or "",
                    str(unit.page or ""),
                    content_hash,
                )
            )
            chunk_id = f"chk_{hashlib.sha256(identity.encode()).hexdigest()[:24]}"
            chunks.append(
                KnowledgeChunk(
                    content=unit.text,
                    metadata=ChunkMetadata(
                        chunk_id=chunk_id,
                        document_id=document["id"],
                        title=document["title"],
                        scope=("institutional" if document["group"] == "haui" else "course"),
                        document_type=_document_type(path),
                        source_type=(
                            "official_public"
                            if document["source_kind"] == "official_public"
                            else "fictional_demo"
                        ),
                        course_id=document["course_id"],
                        source_url=document["source_url"],
                        local_path=document["path"],
                        version=document["version"],
                        date=document["published_at"] or document["collected_at"],
                        chunk_index=chunk_index,
                        page=unit.page,
                        section=unit.section,
                        content_hash=content_hash,
                        source_hash=document["sha256"],
                    ),
                )
            )
    return tuple(chunks)


def _verify_source(path: Path, expected_hash: str) -> None:
    if not path.is_file():
        raise CorpusIngestionError(f"source document does not exist: {path}")
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    if actual != expected_hash:
        raise CorpusIngestionError(f"source hash mismatch: {path}")


def _document_type(path: Path) -> str:
    return {".md": "markdown", ".txt": "text", ".pdf": "pdf"}.get(path.suffix.casefold(), "unknown")


def _extract_units(path: Path, pdf_reader: PdfPageReader | None) -> tuple[_Unit, ...]:
    suffix = path.suffix.casefold()
    if suffix == ".md":
        return _markdown_units(path.read_text(encoding="utf-8"))
    if suffix == ".txt":
        return _plain_text_units(path.read_text(encoding="utf-8"))
    if suffix == ".pdf":
        if pdf_reader is None:
            raise CorpusIngestionError(
                "PDF source requires a configured text-extraction adapter; OCR is not used"
            )
        return tuple(
            _Unit(text=normalized, section=None, page=page_number)
            for page_number, raw in enumerate(pdf_reader.pages(path), start=1)
            if (normalized := _normalize(raw))
        )
    raise CorpusIngestionError(f"unsupported source format: {path.suffix}")


def _markdown_units(text: str) -> tuple[_Unit, ...]:
    units: list[_Unit] = []
    section: str | None = None
    paragraph: list[str] = []

    def flush() -> None:
        if paragraph:
            normalized = _normalize(" ".join(paragraph))
            if normalized:
                units.append(_Unit(normalized, section, None))
            paragraph.clear()

    for raw_line in text.splitlines():
        line = raw_line.strip()
        heading = re.match(r"^#{1,6}\s+(.+?)\s*$", line)
        if heading:
            flush()
            section = _normalize(heading.group(1))
        elif not line:
            flush()
        else:
            paragraph.append(line)
    flush()
    return tuple(units)


def _plain_text_units(text: str) -> tuple[_Unit, ...]:
    paragraphs = re.split(r"\n\s*\n", text)
    return tuple(
        _Unit(normalized, None, None) for raw in paragraphs if (normalized := _normalize(raw))
    )


def _pack_units(units: Iterable[_Unit], *, max_chars: int) -> tuple[_Unit, ...]:
    """Pack adjacent paragraphs only when provenance matches; split long paragraphs by sentences."""
    packed: list[_Unit] = []
    current: list[str] = []
    section: str | None = None
    page: int | None = None

    def flush() -> None:
        if current:
            packed.append(_Unit("\n\n".join(current), section, page))
            current.clear()

    for unit in units:
        pieces = _bounded_pieces(unit.text, max_chars)
        for piece in pieces:
            same_provenance = unit.section == section and unit.page == page
            candidate_length = (
                sum(len(item) for item in current) + max(0, len(current) * 2) + len(piece)
            )
            if current and (not same_provenance or candidate_length > max_chars):
                flush()
            if not current:
                section, page = unit.section, unit.page
            current.append(piece)
    flush()
    return tuple(packed)


def _bounded_pieces(text: str, max_chars: int) -> tuple[str, ...]:
    if len(text) <= max_chars:
        return (text,)
    sentences = [part.strip() for part in re.split(r"(?<=[.!?。])\s+", text) if part.strip()]
    if len(sentences) == 1:
        words = text.split()
        pieces: list[str] = []
        current: list[str] = []
        for word in words:
            if current and len(" ".join((*current, word))) > max_chars:
                pieces.append(" ".join(current))
                current = []
            current.append(word)
        if current:
            pieces.append(" ".join(current))
        return tuple(pieces)
    return _pack_text(sentences, max_chars)


def _pack_text(parts: Sequence[str], max_chars: int) -> tuple[str, ...]:
    result: list[str] = []
    current: list[str] = []
    for part in parts:
        if len(part) > max_chars:
            if current:
                result.append(" ".join(current))
                current = []
            result.extend(_bounded_pieces(part, max_chars))
        elif current and len(" ".join((*current, part))) > max_chars:
            result.append(" ".join(current))
            current = [part]
        else:
            current.append(part)
    if current:
        result.append(" ".join(current))
    return tuple(result)


def _normalize(text: str) -> str:
    lines = [
        re.sub(r"[ \t]+", " ", line).strip() for line in text.replace("\r\n", "\n").splitlines()
    ]
    return "\n".join(line for line in lines if line).strip()

"""Browsable, hash-checked public courseware; no arbitrary filesystem or network reads."""

import hashlib
import json
from pathlib import Path

from haui_compass.application.ports.knowledge import KNOWLEDGE_COURSES
from haui_compass.infrastructure.retrieval.ingestion import CuratedPdfPageReader

COURSE_TITLES = {
    "db": "Cơ sở dữ liệu",
    "ml": "Machine Learning",
    "se": "Software Engineering",
    "ai": "Trí tuệ nhân tạo (AI)",
    "la": "Đại số tuyến tính",
    "stats": "Xác suất thống kê",
    "automation": "Tự động hoá & điều khiển",
}


def materials(root: Path, course_id: str) -> list[dict[str, object]]:
    if course_id not in KNOWLEDGE_COURSES:
        raise FileNotFoundError
    manifest = json.loads((root / "manifest.json").read_text())
    return [
        {
            "slug": Path(d["path"]).name,
            "title": d["title"],
            "format": Path(d["path"]).suffix[1:],
            "publisher": d["publisher"],
            "authors": d.get("authors", []),
            "source_url": d["source_url"],
            "source_page_url": d.get("source_page_url"),
            "license": d["rights"],
            "license_url": d.get("license_url"),
            "collected_at": d["collected_at"],
            "sha256": d["sha256"],
            "bytes": d["bytes"],
        }
        for d in manifest["documents"]
        if d.get("course_id") == course_id and d["source_kind"] == "open_educational"
    ]


def read_material(root: Path, course_id: str, slug: str, page: int) -> dict[str, object]:
    entry = next((d for d in materials(root, course_id) if d["slug"] == slug), None)
    if entry is None:
        raise FileNotFoundError
    path = root / "knowledge" / "courses" / course_id / slug
    if path.is_symlink() or not path.resolve().is_relative_to(root.resolve()):
        raise FileNotFoundError
    content = path.read_bytes()
    if hashlib.sha256(content).hexdigest() != entry["sha256"]:
        raise ValueError("public source hash mismatch")
    if path.suffix == ".pdf":
        pages = CuratedPdfPageReader().pages(path)
        if not 1 <= page <= len(pages):
            raise FileNotFoundError
        return {**entry, "content": pages[page - 1], "page": page, "page_count": len(pages)}
    if page != 1:
        raise FileNotFoundError
    return {**entry, "content": content.decode("utf-8"), "page": None, "page_count": None}


class LocalPublicCourseware:
    def __init__(self, root: Path) -> None:
        self._root = root

    def courses(self) -> list[dict[str, object]]:
        return [
            {"id": key, "title": title, "public_document_count": len(self.materials(key))}
            for key, title in COURSE_TITLES.items()
        ]

    def materials(self, course_id: str) -> list[dict[str, object]]:
        return materials(self._root, course_id)

    def read(self, course_id: str, slug: str, page: int) -> dict[str, object]:
        return read_material(self._root, course_id, slug, page)

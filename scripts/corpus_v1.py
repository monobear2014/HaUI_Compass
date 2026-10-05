"""Offline corpus validation and explicit, read-only authoring helpers.

Run with apps/api/.venv/bin/python from the repository root. No runtime imports this module.
Authoring helpers print JSON to stdout; they never overwrite corpus files or live demo state.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import sys
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
VERSION = "haui-compass-corpus-v1"
SOURCES = {
    "training-model": "https://www.haui.edu.vn/vn/html/mo-hinh-va-chuong-trinh-dao-tao",
    "student-financial-support": "https://www.haui.edu.vn/vn/hoc-bong-hoc-phi/"
    "ho-tro-tai-chinh-va-hoc-bong-danh-cho-sinh-vien-haui/68191",
    "admissions-2025": "https://www.haui.edu.vn/vn/page/ts/detail/66572",
}


def scenario_assets() -> dict[str, str]:
    """Export the existing authored facts at their fixed clock, without resetting the API."""
    from haui_compass.infrastructure.demo.scenarios import (
        NOW,
        ScenarioId,
        scenario_data,
    )

    assets = {}
    for identifier in ScenarioId:
        scenario = scenario_data(identifier, NOW)
        courses, assignments, submissions = scenario.records
        academic = {
            "schema_version": "haui-compass-academic-import-v1",
            "student_external_id": "pilot-student",
            "source": "json",
            "courses": [
                {"external_id": c.ref.id, "name": c.name, "code": c.code}
                for c in courses
            ],
            "assignments": [
                {
                    "external_id": a.ref.id,
                    "course_external_id": a.course_ref.id,
                    "title": a.title,
                    "deadline": a.deadline.isoformat() if a.deadline else None,
                    "estimated_effort_minutes": int(
                        a.estimated_effort.total_seconds() / 60
                    )
                    if a.estimated_effort is not None
                    else None,
                }
                for a in assignments
            ],
            "submissions": [
                {
                    "assignment_external_id": s.assignment_ref.id,
                    "status": s.status.value,
                    "submitted_at": s.submitted_at.isoformat()
                    if s.submitted_at
                    else None,
                }
                for s in submissions
            ],
        }
        fixture = {
            "schema_version": VERSION,
            "fictional_only": True,
            "scenario_id": identifier.value,
            "as_of": NOW.isoformat(),
            "student": {
                "provider": scenario.student.provider,
                "id": scenario.student.id,
            },
            "period": {
                "start": scenario.period.start.isoformat(),
                "end": scenario.period.end.isoformat(),
            },
            "study_windows": [
                {"starts_at": w.starts_at.isoformat(), "ends_at": w.ends_at.isoformat()}
                for w in scenario.windows
            ],
            "tasks": [
                {
                    "id": str(t.id),
                    "assignment_id": str(t.assignment_id),
                    "title": t.title,
                    "estimated_duration_seconds": int(
                        t.estimated_duration.total_seconds()
                    ),
                    "status": t.status.value,
                }
                for t in scenario.tasks
            ],
        }
        base = f"demo/{identifier.value}"
        assets[f"{base}/academic.json"] = (
            json.dumps(academic, ensure_ascii=False, indent=2) + "\n"
        )
        assets[f"{base}/student-workspace.json"] = json.dumps(fixture, indent=2) + "\n"
        from haui_compass.api.schemas.academic_data import CSV_COLUMNS

        output = io.StringIO(newline="")
        writer = csv.writer(output, lineterminator="\n")
        writer.writerow(CSV_COLUMNS)
        for assignment, submission in zip(assignments, submissions, strict=True):
            course = next(c for c in courses if c.ref == assignment.course_ref)
            writer.writerow(
                [
                    course.ref.id,
                    course.name,
                    course.code,
                    assignment.ref.id,
                    assignment.title,
                    assignment.deadline.isoformat() if assignment.deadline else "",
                    submission.status.value,
                    "",
                    int(assignment.estimated_effort.total_seconds() / 60)
                    if assignment.estimated_effort is not None
                    else "",
                ]
            )
        assets[f"{base}/academic.csv"] = output.getvalue()
    return assets


class ArticleText(HTMLParser):
    """Extract only HaUI article container; retain paragraphs/table cells, strip scripts."""

    def __init__(self, container: str):
        super().__init__(convert_charrefs=True)
        self.container = container
        self.depth = 0
        self.active = False
        self.skip = 0
        self.cell_depth = 0
        self.parts: list[str] = []

    def handle_starttag(self, tag, attrs):
        classes = dict(attrs).get("class", "").split()
        if not self.active and self.container in classes:
            self.active = True
            self.depth = 1
        elif self.active and tag == "div":
            self.depth += 1
        if self.active:
            if tag in {"script", "style"}:
                self.skip += 1
            if tag in {"td", "th"}:
                self.cell_depth += 1
                self.parts.append(" | ")
            elif tag == "tr" or (
                tag in {"p", "li", "h1", "h2", "h3", "br"} and not self.cell_depth
            ):
                self.parts.append("\n")
            elif self.cell_depth and tag in {"p", "br"}:
                self.parts.append(" ")

    def handle_endtag(self, tag):
        if self.active:
            if tag in {"script", "style"}:
                self.skip = max(0, self.skip - 1)
            if tag in {"td", "th"}:
                self.cell_depth = max(0, self.cell_depth - 1)
            if tag == "tr" or (
                tag in {"p", "li", "h1", "h2", "h3"} and not self.cell_depth
            ):
                self.parts.append("\n")
            if tag == "div":
                self.depth -= 1
                if self.depth == 0:
                    self.active = False

    def handle_data(self, data):
        if self.active and not self.skip:
            self.parts.append(data)

    def text(self):
        lines = [
            re.sub(r"\s+", " ", line).strip()
            for line in "".join(self.parts).splitlines()
        ]
        return "\n".join(line for line in lines if line) + "\n"


def extract_sources(paths: list[str]) -> dict[str, str]:
    assets = {}
    for key, path in zip(SOURCES, paths, strict=True):
        parser = ArticleText("col-md-8" if key == "training-model" else "irs-blog-col")
        parser.feed(Path(path).read_text(encoding="utf-8-sig"))
        content = parser.text()
        if key == "student-financial-support":
            # The article header contains a changing view counter, not document content.
            lines = content.splitlines()
            content = (
                "\n".join(
                    line
                    for i, line in enumerate(lines)
                    if not (i < 3 and line.isdecimal())
                )
                + "\n"
            )
        if len(content) < 100:
            raise ValueError(f"empty article: {key}")
        assets[f"knowledge/haui/{key}.txt"] = content
    return assets


def aware(value: str) -> datetime:
    result = datetime.fromisoformat(value)
    if result.utcoffset() is None:
        raise ValueError("timestamp requires an explicit timezone")
    return result


def validate(root: Path) -> dict[str, int]:
    """Fail closed on metadata, checksums, linkage, schema or authored-fixture drift."""
    from haui_compass.api.schemas.academic_data import (
        AcademicImportRequest,
        parse_canonical_csv,
    )
    from haui_compass.application.academic_import import (
        AcademicSource,
        dataset_from_values,
    )
    from haui_compass.application.ports.lms import SubmissionStatus

    manifest = json.loads((root / "manifest.json").read_text())
    if manifest["schema_version"] != VERSION:
        raise ValueError("unsupported corpus version")
    if manifest["runtime_loading"] is not False or manifest["version"] != "1.0":
        raise ValueError("unsupported version or runtime loading claim")
    seen_ids, seen_paths = set(), set()
    counts = {"demo": 0, "haui": 0, "courses": 0}
    for entry in manifest["documents"]:
        for field in (
            "id",
            "title",
            "path",
            "group",
            "language",
            "source_kind",
            "publisher",
            "source_url",
            "collected_at",
            "published_at",
            "version",
            "sha256",
            "bytes",
            "rights",
            "authority",
            "temporal_scope",
            "course_id",
            "notes",
        ):
            if field not in entry:
                raise ValueError(f"missing metadata field: {field}")
        if entry["id"] in seen_ids or entry["path"] in seen_paths:
            raise ValueError("duplicate document id/path")
        if not all(
            isinstance(entry[f], str) and entry[f].strip()
            for f in (
                "id",
                "title",
                "path",
                "publisher",
                "version",
                "rights",
                "authority",
                "temporal_scope",
                "notes",
            )
        ) or not re.fullmatch(r"[a-f0-9]{64}", entry["sha256"]):
            raise ValueError("invalid metadata value")
        if type(entry["bytes"]) is not int or entry["bytes"] <= 0:
            raise ValueError("invalid byte count")
        seen_ids.add(entry["id"])
        seen_paths.add(entry["path"])
        path = root / entry["path"]
        if path.is_symlink() or not path.resolve().is_relative_to(root.resolve()):
            raise ValueError("unsafe document path")
        content = path.read_bytes()
        if not content or hashlib.sha256(content).hexdigest() != entry["sha256"]:
            raise ValueError(f"checksum mismatch: {entry['path']}")
        if len(content) != entry["bytes"]:
            raise ValueError("byte count mismatch")
        aware(entry["collected_at"])
        if entry["published_at"] is not None:
            aware(entry["published_at"])
        group = entry["group"]
        counts[group] += 1
        prefix = "demo/" if group == "demo" else f"knowledge/{group}/"
        if not entry["path"].startswith(prefix) or entry["language"] not in {
            "vi",
            "en",
        }:
            raise ValueError("group/path/language mismatch")
        if not all(
            entry[f] for f in ("title", "publisher", "version", "rights", "notes")
        ):
            raise ValueError("blank provenance")
        if group == "haui":
            url = urlparse(entry["source_url"])
            host = url.hostname or ""
            if url.scheme != "https" or not (
                host == "haui.edu.vn" or host.endswith(".haui.edu.vn")
            ):
                raise ValueError("official source must use a HaUI HTTPS domain")
            if (
                entry["source_kind"] != "official_public"
                or entry["authority"] != "public_information_snapshot"
            ):
                raise ValueError("official provenance mismatch")
        elif (
            entry["source_kind"] != "synthetic"
            or entry["source_url"] is not None
            or entry["authority"] != "fictional_demo_only"
        ):
            raise ValueError("fictional provenance mismatch")
        if group == "courses" and (
            entry["course_id"] not in {"db", "ml", "en", "se"}
            or "HƯ CẤU" not in content.decode()
            or not entry["path"].startswith(f"knowledge/courses/{entry['course_id']}/")
        ):
            raise ValueError("course must be linked and visibly fictional")
    actual = {
        p.relative_to(root).as_posix()
        for p in root.rglob("*")
        if p.is_file() and p.name != "README.md" and p.name != "manifest.json"
    }
    if actual != seen_paths or not all(counts.values()):
        raise ValueError("manifest coverage mismatch or missing corpus group")
    expected = scenario_assets()
    for path, text in expected.items():
        if (root / path).read_text() != text:
            raise ValueError(f"fixture drift: {path}")
    for scenario in ("normal", "crunch", "disrupted"):
        base = root / "demo" / scenario
        request = AcademicImportRequest.model_validate_json(
            (base / "academic.json").read_text()
        )
        csv_request = parse_canonical_csv(
            (base / "academic.csv").read_text(),
            student_external_id=request.student_external_id,
        )
        if request.model_copy(update={"source": "csv"}) != csv_request:
            raise ValueError("JSON/CSV semantics differ")
        dataset_from_values(
            student_id=request.student_external_id,
            source=AcademicSource(request.source),
            courses=tuple((c.external_id, c.name, c.code) for c in request.courses),
            assignments=tuple(
                (
                    a.external_id,
                    a.course_external_id,
                    a.title,
                    a.deadline,
                    a.estimated_effort_minutes,
                )
                for a in request.assignments
            ),
            submissions=tuple(
                (s.assignment_external_id, SubmissionStatus(s.status), s.submitted_at)
                for s in request.submissions
            ),
        )
    profiles = json.loads((root / "demo/students.json").read_text())
    if profiles["fictional_only"] is not True or len(profiles["students"]) != 3:
        raise ValueError("invalid synthetic student profiles")
    if {p["scenario_id"] for p in profiles["students"]} != {
        "normal",
        "crunch",
        "disrupted",
    }:
        raise ValueError("profiles must cover each scenario once")
    for profile in profiles["students"]:
        if set(profile) != {
            "id",
            "scenario_id",
            "display_name",
            "year",
            "learning_goal",
            "course_ids",
        }:
            raise ValueError(
                "unexpected profile fields (no real personal data allowed)"
            )
        fixture = json.loads(
            (root / f"demo/{profile['scenario_id']}/student-workspace.json").read_text()
        )
        if profile["id"] != fixture["student"]["id"] or profile["course_ids"] != [
            "db",
            "ml",
            "en",
        ]:
            raise ValueError("student/course linkage mismatch")
    mappings = manifest["course_mapping"]
    if {m["course_id"] for m in mappings} != {"db", "ml", "en"} or len(mappings) != 3:
        raise ValueError("invalid course mapping")
    for scenario in ("normal", "crunch", "disrupted"):
        academic = json.loads((root / f"demo/{scenario}/academic.json").read_text())
        for mapping in mappings:
            course = next(
                c
                for c in academic["courses"]
                if c["external_id"] == f"{scenario}-{mapping['course_id']}"
            )
            titles = {
                a["title"]
                for a in academic["assignments"]
                if a["course_external_id"] == course["external_id"]
            }
            if (
                course["name"] != mapping["fixture_name"]
                or course["code"] != mapping["fixture_code"]
                or titles != set(mapping["assignment_titles"])
            ):
                raise ValueError("course/assignment mapping drift")
            for kind in ("syllabus", "notes", "assignments", "rubric", "faq"):
                if (
                    f"knowledge/courses/{mapping['course_id']}/{kind}.md"
                    not in seen_paths
                ):
                    raise ValueError("incomplete course pack")
    for kind in ("syllabus", "notes", "assignments", "rubric", "faq"):
        if f"knowledge/courses/se/{kind}.md" not in seen_paths:
            raise ValueError("incomplete software-engineering RAG course pack")
    return counts


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT / "data")
    parser.add_argument("--export-demo", action="store_true")
    parser.add_argument("--extract-haui", nargs=3, metavar="HTML_FILE")
    args = parser.parse_args()
    try:
        if args.export_demo:
            print(json.dumps(scenario_assets(), ensure_ascii=False))
        elif args.extract_haui:
            print(json.dumps(extract_sources(args.extract_haui), ensure_ascii=False))
        else:
            print(
                json.dumps(
                    {"status": "PASS", "documents": validate(args.root)},
                    ensure_ascii=False,
                )
            )
    except (ValueError, KeyError, OSError, TypeError) as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

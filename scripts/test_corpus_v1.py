"""Corpus integrity regressions; all mutations happen in disposable copies."""

import hashlib
import json
import shutil
import tempfile
import unittest
from pathlib import Path

from corpus_v1 import ROOT, ArticleText, validate


class CorpusValidationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name) / "data"
        shutil.copytree(ROOT / "data", self.root)
        self.manifest = json.loads((self.root / "manifest.json").read_text())

    def save_manifest(self):
        (self.root / "manifest.json").write_text(
            json.dumps(self.manifest), encoding="utf-8"
        )

    def reseal(self, path):
        entry = next(d for d in self.manifest["documents"] if d["path"] == path)
        content = (self.root / path).read_bytes()
        entry.update(sha256=hashlib.sha256(content).hexdigest(), bytes=len(content))
        self.save_manifest()

    def test_complete_offline_corpus(self):
        self.assertEqual(validate(self.root), {"demo": 10, "haui": 3, "courses": 15})

    def test_tampered_content(self):
        (self.root / "demo/normal/academic.json").write_text("{}")
        with self.assertRaisesRegex(ValueError, "checksum"):
            validate(self.root)

    def test_resealed_fixture_drift(self):
        path = "demo/normal/academic.json"
        value = json.loads((self.root / path).read_text())
        value["assignments"][0]["estimated_effort_minutes"] = 900
        (self.root / path).write_text(json.dumps(value))
        self.reseal(path)
        with self.assertRaisesRegex(ValueError, "fixture drift"):
            validate(self.root)

    def test_duplicate_document(self):
        self.manifest["documents"].append(self.manifest["documents"][0])
        self.save_manifest()
        with self.assertRaisesRegex(ValueError, "duplicate"):
            validate(self.root)

    def test_missing_provenance(self):
        del self.manifest["documents"][0]["rights"]
        self.save_manifest()
        with self.assertRaisesRegex(ValueError, "missing metadata"):
            validate(self.root)

    def test_untrusted_official_domain(self):
        entry = next(d for d in self.manifest["documents"] if d["group"] == "haui")
        entry["source_url"] = "https://haui.edu.vn.example.org/fake"
        self.save_manifest()
        with self.assertRaisesRegex(ValueError, "HaUI HTTPS"):
            validate(self.root)

    def test_path_traversal(self):
        self.manifest["documents"][0]["path"] = "../outside.json"
        self.save_manifest()
        with self.assertRaisesRegex(ValueError, "unsafe"):
            validate(self.root)

    def test_naive_collection_timestamp(self):
        self.manifest["documents"][0]["collected_at"] = "2026-10-05T00:00:00"
        self.save_manifest()
        with self.assertRaisesRegex(ValueError, "timezone"):
            validate(self.root)

    def test_unregistered_file(self):
        (self.root / "demo/extra.json").write_text("{}")
        with self.assertRaisesRegex(ValueError, "coverage"):
            validate(self.root)

    def test_course_mapping(self):
        self.manifest["course_mapping"][0]["assignment_titles"] = [
            "Invented assignment"
        ]
        self.save_manifest()
        with self.assertRaisesRegex(ValueError, "mapping drift"):
            validate(self.root)

    def test_real_data_field_rejected(self):
        path = "demo/students.json"
        value = json.loads((self.root / path).read_text())
        value["students"][0]["email"] = "student@example.org"
        (self.root / path).write_text(json.dumps(value))
        self.reseal(path)
        with self.assertRaisesRegex(ValueError, "unexpected profile fields"):
            validate(self.root)

    def test_extractor_excludes_navigation_and_scripts(self):
        parser = ArticleText("irs-blog-col")
        parser.feed(
            '<nav>menu</nav><div class="irs-blog-col"><p>Nội dung</p>'
            "<script>secret</script><div><p>Bảng</p></div></div><footer>footer</footer>"
        )
        self.assertEqual(parser.text(), "Nội dung\nBảng\n")

    def test_extractor_keeps_table_rows_together(self):
        parser = ArticleText("irs-blog-col")
        parser.feed(
            '<div class="irs-blog-col"><table><tr><td><p>Khóa</p></td>'
            "<td><p>Số lượng</p></td></tr><tr><td>A</td><td>3</td></tr></table></div>"
        )
        self.assertEqual(parser.text(), "| Khóa | Số lượng\n| A | 3\n")


if __name__ == "__main__":
    unittest.main()

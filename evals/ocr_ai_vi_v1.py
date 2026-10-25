"""Labeled Vietnamese OCR and grounded-QA evaluation; never relabel model outputs.

Offline validates fixtures and grader contracts ONLY (no claimed OCR/model accuracy).
Live reports every failure once, including operational failures, with frozen labels.
Only repository synthetic fixtures may be used; arbitrary/private paths are rejected.
"""

# ruff: noqa: E402
from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import re
import sys
import time
import unicodedata
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api/src"))

from haui_compass.application.ports.knowledge import CitationEvidence, GroundedAnswerInput
from haui_compass.application.use_cases.grounded_answer import validate_grounded_answer
from haui_compass.infrastructure.config.llm import LLMSettings
from haui_compass.infrastructure.llm.openai_responses import OpenAIResponsesAdapter
from haui_compass.infrastructure.retrieval.ocr import (
    HybridPdfExtractor,
    OCRSettings,
    VisionOCR,
    render_ocr_markdown,
)

DATASET = ROOT / "evals/datasets/ocr-ai-vi-v1.json"
FIXTURES = ROOT / "evals/ocr/fixtures"
OUTPUT = ROOT / "artifacts/evals/ocr-ai-vi-v1"


def normalized(text: str) -> str:
    return " ".join(unicodedata.normalize("NFC", text).split())


def edit_distance(reference: list | str, prediction: list | str) -> int:
    previous = list(range(len(prediction) + 1))
    for i, expected in enumerate(reference, 1):
        current = [i]
        for j, actual in enumerate(prediction, 1):
            current.append(min(current[-1] + 1, previous[j] + 1,
                               previous[j - 1] + (expected != actual)))
        previous = current
    return previous[-1]


def latex_normalized(text: str) -> str:
    # Formatting-only equivalence; do NOT remove signs, bounds or subscript order.
    text = re.sub(r"\\(?:left|right|displaystyle|textstyle)\b", "", text)
    text = re.sub(r"\\[ ,;!]|\s+", "", text)
    text = text.replace(r"\dfrac", r"\frac").replace(r"\tfrac", r"\frac")
    text = text.replace(r"\mid", "|")
    text = re.sub(r"([_^])\{([A-Za-z0-9])\}", r"\1\2", text)
    return text


def parse_markdown(markdown: str) -> dict:
    formulas = re.findall(r"\$\$\s*([\s\S]*?)\s*\$\$", markdown)
    remainder = re.sub(r"\$\$[\s\S]*?\$\$", "", markdown)
    tables, text = [], []
    lines = remainder.splitlines()
    i = 0
    while i < len(lines):
        if lines[i].strip().startswith("|") and i + 1 < len(lines) and re.fullmatch(
            r"[|:\-\s]+", lines[i + 1].strip()
        ):
            def cells(line: str) -> list[str]:
                return [cell.strip().replace(r"\|", "|") for cell in
                        re.split(r"(?<!\\)\|", line.strip().strip("|"))]

            table = {"headers": cells(lines[i]), "rows": []}
            i += 2
            while i < len(lines) and lines[i].strip().startswith("|"):
                table["rows"].append(cells(lines[i]))
                i += 1
            tables.append(table)
        else:
            text.append(lines[i])
            i += 1
    return {"text": normalized("\n".join(text)), "tables": tables, "formulas": formulas}


def score(case: dict, markdown: str) -> dict:
    actual = parse_markdown(markdown)
    reference = normalized(" ".join(case["paragraphs"]))
    text = actual["text"]
    cer = edit_distance(reference, text) / max(1, len(reference))
    wer = edit_distance(reference.split(), text.split()) / max(1, len(reference.split()))
    expected_tables = case["tables"]
    cells_total = cells_correct = 0
    for index, expected in enumerate(expected_tables):
        observed = actual["tables"][index] if index < len(actual["tables"]) else {}
        expected_rows = [expected["headers"], *expected["rows"]]
        observed_rows = [observed.get("headers", []), *observed.get("rows", [])]
        for row_index, row in enumerate(expected_rows):
            for column, cell in enumerate(row):
                cells_total += 1
                if row_index < len(observed_rows) and column < len(observed_rows[row_index]):
                    cells_correct += normalized(cell) == normalized(observed_rows[row_index][column])
    table_exact = expected_tables == actual["tables"]
    expected_math = [latex_normalized(f) for f in case["formulas"]]
    observed_math = [latex_normalized(f) for f in actual["formulas"]]
    formulas_correct = sum(a == b for a, b in zip(expected_math, observed_math, strict=False))
    formula_exact = expected_math == observed_math
    return {
        "cer": round(cer, 5), "wer": round(wer, 5),
        "table_exact": table_exact, "table_cells_correct": cells_correct,
        "table_cells_total": cells_total,
        "formulas_correct": formulas_correct, "formulas_total": len(expected_math),
        "formula_exact": formula_exact,
        "passed": cer <= 0.10 and table_exact and formula_exact,
    }


def load_cases() -> tuple[dict, dict]:
    data = json.loads(DATASET.read_text())
    manifest = json.loads((FIXTURES.parent / "manifest.json").read_text())
    if manifest["dataset_sha256"] != hashlib.sha256(DATASET.read_bytes()).hexdigest():
        raise ValueError("Dataset changed; regenerate fixtures explicitly")
    cases = data["cases"]
    if len({c["id"] for c in cases}) != len(cases):
        raise ValueError("Duplicate labels")
    lookup = {c["id"]: c for c in cases}
    for fixture in manifest["fixtures"]:
        if Path(fixture["file"]).name != fixture["file"]:
            raise ValueError("Only repository fixtures are permitted")
        path = FIXTURES / fixture["file"]
        if hashlib.sha256(path.read_bytes()).hexdigest() != fixture["sha256"]:
            raise ValueError("Fixture hash mismatch")
        if fixture["split"] != lookup[fixture["id"]]["split"]:
            raise ValueError("Split leakage")
    return data, manifest


async def run(mode: str, split: str, file_type: str, limit: int | None,
              with_qa: bool, output: Path = OUTPUT) -> dict:
    data, manifest = load_cases()
    cases = [c for c in data["cases"] if split == "all" or c["split"] == split]
    if limit:
        cases = cases[:limit]
    settings = LLMSettings.from_env()
    if mode == "live" and not settings.api_key:
        raise ValueError("Live evaluation requires provider credentials")
    ocr_settings = OCRSettings(True, OCRSettings.from_env(settings).model, 40)
    vision = VisionOCR(settings, ocr_settings)
    extractor = HybridPdfExtractor(vision)
    answer_provider = OpenAIResponsesAdapter(settings) if mode == "live" and with_qa else None
    rows, reviews = [], []
    for case in cases:
        row = {"id": case["id"], "category": case["category"], "split": case["split"]}
        started = time.perf_counter()
        markdown = None
        try:
            if mode == "offline":
                # Validate the grader against known gold serialization, not fake OCR output.
                gold = render_ocr_markdown({"text": "\n\n".join(case["paragraphs"]),
                    "tables": case["tables"], "formulas": case["formulas"],
                    "uncertain_regions": []})
                row["passed"] = score(case, gold)["passed"]
                row["contract_only"] = True
            else:
                content = (FIXTURES / (case["id"] + "." + file_type)).read_bytes()
                pages = await extractor.extract(content) if file_type == "pdf" else await vision.extract_image(content, "image/png")
                markdown = "\n\n".join(page.text for page in pages)
                row.update(score(case, markdown))
                if answer_provider:
                    evidence = (CitationEvidence(citation_id="c1", document_id=case["id"],
                        chunk_id=case["id"] + "-p1", title="Synthetic Vietnamese OCR fixture",
                        source_url=None, local_path="", source_type="fictional_demo",
                        page=1, section=None, content=markdown),)
                    qa_results = []
                    for qa in case["qa"]:
                        answer = await answer_provider.answer(GroundedAnswerInput(
                            question=qa["question"], evidence=evidence))
                        covered = any(re.search(r"(?<!\w)" + re.escape(normalized(label)) + r"(?!\w)",
                                               normalized(answer.answer), re.I) for label in qa["answers"])
                        valid_citation = validate_grounded_answer(answer, evidence) is not None
                        qa_results.append({"answer_matches_label": covered,
                                           "valid_citation": valid_citation,
                                           "passed": covered and valid_citation})
                    row["qa"] = qa_results
                    row["passed"] = row["passed"] and all(q["passed"] for q in qa_results)
        except Exception:
            # Do not leak provider errors (they can include bearer/image content).
            row.update({"passed": False, "operational_failure": True})
        row["latency_ms"] = round((time.perf_counter() - started) * 1000)
        rows.append(row)
        print(json.dumps({"id": row["id"], "passed": row["passed"],
                          "mode": mode, "latency_ms": row["latency_ms"]}), flush=True)
        reviews.append({"id": case["id"], "synthetic_extracted_markdown": markdown,
                        "human_review": {"reviewer": None, "vietnamese_fidelity": None,
                            "table_alignment": None, "math_fidelity": None,
                            "semantic_grounding": None, "notes": ""}})
    report = {"dataset": data["version"], "dataset_sha256": manifest["dataset_sha256"],
        "manifest_sha256": hashlib.sha256((FIXTURES.parent / "manifest.json").read_bytes()).hexdigest(),
        "ocr_implementation_sha256": hashlib.sha256((ROOT / "apps/api/src/haui_compass/infrastructure/retrieval/ocr.py").read_bytes()).hexdigest(),
        "mode": mode, "split": split, "input_format": file_type,
        "model": ocr_settings.model if mode == "live" else None,
        "ocr_accuracy_measured": mode == "live",
        "human_review_status": "not independently reviewed", "qa_enabled": with_qa,
        "total": len(rows), "passed": sum(r["passed"] for r in rows),
        "categories": dict(Counter(r["category"] for r in rows)), "cases": rows}
    if mode == "live":
        measured = [r for r in rows if "cer" in r]
        report["metrics"] = {"extracted_cases": len(measured),
            "operational_failures": sum(r.get("operational_failure", False) for r in rows),
            "mean_cer": sum(r["cer"] for r in measured) / max(1, len(measured)),
            "mean_wer": sum(r["wer"] for r in measured) / max(1, len(measured)),
            "table_cells_correct": sum(r["table_cells_correct"] for r in measured),
            "table_cells_total": sum(r["table_cells_total"] for r in measured),
            "formulas_correct": sum(r["formulas_correct"] for r in measured),
            "formulas_total": sum(r["formulas_total"] for r in measured),
            "qa_correct_with_citation": sum(q["passed"] for r in rows for q in r.get("qa", [])),
            "qa_completed": sum(len(r.get("qa", [])) for r in rows),
            "qa_total": sum(len(case["qa"]) for case in cases) if with_qa else 0}
    # Unique run directory: preserve failures and labels, never overwrite evidence.
    run_dir = output / (time.strftime("%Y%m%dT%H%M%S") + f"-{mode}-{file_type}-{split}")
    run_dir.mkdir(parents=True, exist_ok=False)
    (run_dir / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    (run_dir / "human-review.json").write_text(json.dumps(reviews, ensure_ascii=False, indent=2) + "\n")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=["offline", "live"], default="offline")
    parser.add_argument("--split", choices=["dev", "test", "all"], default="test")
    parser.add_argument("--input-format", choices=["png", "pdf"], default="png")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--with-qa", action="store_true")
    args = parser.parse_args()
    result = asyncio.run(run(args.mode, args.split, args.input_format, args.limit, args.with_qa))
    print(json.dumps({"total": result["total"], "passed": result["passed"],
                      "mode": result["mode"], "ocr_accuracy_measured": result["ocr_accuracy_measured"]}))
    raise SystemExit(0 if result["passed"] == result["total"] else 1)

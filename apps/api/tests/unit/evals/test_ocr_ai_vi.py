import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[5]
SPEC = importlib.util.spec_from_file_location("ocr_eval", ROOT / "evals/ocr_ai_vi_v1.py")
assert SPEC and SPEC.loader
evaluation = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(evaluation)


def test_label_hashes_splits_and_synthetic_origin() -> None:
    data, manifest = evaluation.load_cases()
    assert len(data["cases"]) == 20 and len(manifest["fixtures"]) == 40
    assert data["human_review_status"] == "not independently reviewed"
    assert {c["split"] for c in data["cases"]} == {"dev", "test"}


def test_grader_penalizes_cell_shifts_and_invented_empty_values() -> None:
    data, _ = evaluation.load_cases()
    case = next(c for c in data["cases"] if c["id"] == "OCR-VI-018")
    shifted = (
        "\n\n".join(case["paragraphs"])
        + "\n\n"
        + ("| Nhóm | Tuần 1 | Tuần 2 |\n|---|---|---|\n| A | 12 | 0 |\n| B | 17 | |\n| C | 0 | 0 |")
    )
    result = evaluation.score(case, shifted)
    assert not result["passed"] and not result["table_exact"]
    assert result["table_cells_correct"] < result["table_cells_total"]


def test_grader_keeps_vietnamese_accents_and_mathematical_signs() -> None:
    assert evaluation.edit_distance("điện trở", "dien tro") > 0
    assert evaluation.latex_normalized(r"\frac{1}{3}") == evaluation.latex_normalized(
        r"\dfrac{1}{3}"
    )
    assert evaluation.latex_normalized("a_{12}=-0.05") != evaluation.latex_normalized("a_{12}=0.05")
    assert evaluation.latex_normalized("x_1") != evaluation.latex_normalized("x_2")

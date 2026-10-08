import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[5]
SPEC = importlib.util.spec_from_file_location("compass_rag_v1", ROOT / "evals/compass_rag_v1.py")
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def test_dataset_distribution_and_offline_retrieval_report() -> None:
    dataset = MODULE.load_dataset()
    assert len(dataset["cases"]) == 48
    assert sum(len(case.get("turns", [case])) for case in dataset["cases"]) == 54

    rows, metrics = MODULE.run_offline()

    assert len(rows) == 54
    assert metrics["answerable_turns"] == 44
    assert set(metrics["by_category"]) == set(MODULE.CATEGORIES)
    assert 0 <= metrics["hit_at_1"] <= metrics["hit_at_3"] <= metrics["hit_at_5"] <= 1
    assert metrics["definitions"]["mrr"].startswith("mean of 1/rank")


def test_nearest_rank_and_concept_alias_normalization() -> None:
    assert MODULE.nearest_rank([4.0, 1.0, 3.0, 2.0], 0.95) == 4.0
    assert MODULE.concept_present(
        "Đầu ra là một PHÂN PHỐI XÁC SUẤT.",
        {"concept": "probability distribution", "aliases": ["phân phối xác suất"]},
    )


def test_decision_signal_exposes_category_weakness() -> None:
    _, metrics = MODULE.run_offline()
    metrics["by_category"]["adversarial"]["hit_at_3"] = 0.75
    decision = MODULE.decision_signal(metrics)
    assert decision["signal"] == "evidence_supports_hybrid_experiment"
    assert "adversarial" in decision["reason"]


def test_generation_errors_are_not_counted_as_refusals() -> None:
    dataset = MODULE.load_dataset()
    specs = MODULE._turn_specs(dataset)
    rows = []
    for (case_id, index), (case, turn) in specs.items():
        rows.append(
            {
                "case_id": case_id,
                "turn_index": index,
                "category": case["category"],
                "answerable": turn["answerable"],
                "expected_sources": turn["expected_sources"],
                "status": "failed",
                "answer": "",
                "citations": [],
                "retrieved": [],
                "provider_error": True,
                "provider_call_count": 1,
            }
        )
    metrics = MODULE.generation_metrics(rows, dataset)
    assert metrics["provider_error_rate"] == 1.0
    assert metrics["refusal_precision"] is None
    assert metrics["refusal_recall"] == 0.0
    assert metrics["grounded_answer_rate"] == 0.0


def test_pdf_extension_preserves_original_cases_and_checks_wrong_page() -> None:
    original = MODULE.load_dataset()
    dataset = MODULE.load_dataset(ROOT / "evals/datasets/compass-rag-v1-pdf.json")
    assert dataset["cases"][:48] == original["cases"]
    cases = dataset["cases"][48:]
    rows = []
    for case in cases:
        citations = (
            [
                {
                    "chunk_id": case["id"],
                    "document_id": "owned-pdf",
                    "page_number": case["expected_pages"][0],
                    "source_ids": case["expected_sources"],
                }
            ]
            if case["answerable"]
            else []
        )
        rows.append(
            {
                "case_id": case["id"],
                "turn_index": 0,
                "category": "pdf",
                "document_id": "owned-pdf",
                "answerable": case["answerable"],
                "expected_sources": case["expected_sources"],
                "answer": " ".join(item["concept"] for item in case["required_concepts"]),
                "status": "answered" if case["answerable"] else "abstained",
                "citations": citations,
                "retrieved": citations,
                "provider_call_count": int(case["answerable"]),
                "provider_error": False,
            }
        )
    assert MODULE.generation_metrics(rows, dataset)["citation_correctness_rate"] == 1
    rows[0]["citations"][0]["page_number"] = 99
    metrics = MODULE.generation_metrics(rows, dataset)
    assert metrics["citation_precision"] == 0.8333
    assert metrics["citation_correctness_rate"] == 0.8333
    assert rows[0]["page_citation_correct"] is False

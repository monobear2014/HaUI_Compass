import asyncio
import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[5]
SPEC = importlib.util.spec_from_file_location("rag_v1", ROOT / "evals/rag_v1.py")
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def test_rag_dataset_contract_and_offline_baseline() -> None:
    cases = MODULE.load_dataset()
    assert len(cases) == 25
    report = asyncio.run(MODULE.run("offline"))
    assert report["total_cases"] == 25
    assert report["passed_cases"] == 25
    assert report["citation_validity"] == 1.0
    assert report["scope_isolation"] == 1.0
    assert report["abstention_correctness"] == 1.0

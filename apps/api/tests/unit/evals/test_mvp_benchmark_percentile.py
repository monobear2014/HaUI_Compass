"""Lock the benchmark's documented nearest-rank percentile contract."""

import importlib.util
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[5]
SPEC = importlib.util.spec_from_file_location(
    "mvp_benchmark_v1", ROOT / "evals/mvp_benchmark_v1.py"
)
assert SPEC and SPEC.loader
BENCHMARK = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = BENCHMARK
SPEC.loader.exec_module(BENCHMARK)


def test_percentile_uses_documented_nearest_rank() -> None:
    samples = [50.0, 10.0, 20.0, 40.0, 30.0]

    assert BENCHMARK.percentile(samples, 0.50) == 30.0
    assert BENCHMARK.percentile(samples, 0.95) == 50.0
    assert BENCHMARK.percentile(samples, 0.99) == 50.0


@pytest.mark.parametrize("samples, fraction", [([], 0.50), ([1.0], 0.0), ([1.0], 1.01)])
def test_percentile_rejects_undefined_inputs(samples: list[float], fraction: float) -> None:
    with pytest.raises(ValueError):
        BENCHMARK.percentile(samples, fraction)

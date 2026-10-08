"""Enforces the dependency direction from ADR-0001 by reading imports, not by running code.

A dedicated tool (import-linter) is deliberately not used yet: these few rules need no extra
dependency. Revisit if the rules outgrow this file.
"""

import ast
import sys
from pathlib import Path

PACKAGE = "haui_compass"
SOURCE_ROOT = Path(__file__).resolve().parents[2] / "src" / PACKAGE

# layer -> internal layers it may import (its own layer is always allowed). ADR-0001 table.
ALLOWED_LAYERS: dict[str, frozenset[str]] = {
    "domain": frozenset(),
    "engines": frozenset({"domain"}),
    "ai": frozenset({"domain", "engines"}),
    "application": frozenset({"domain", "engines", "ai"}),
    "infrastructure": frozenset({"domain", "application", "ai"}),
    "api": frozenset({"domain", "application"}),
    "config": frozenset(),
}
# Layers that may use only the standard library (plus their allowed internal layers).
STDLIB_ONLY_LAYERS = frozenset({"domain", "engines"})
# Composition roots allowed to wire infrastructure into application/API callers.
COMPOSITION_ROOTS = frozenset(
    {
        "haui_compass.api.dependencies",
        "haui_compass.api.demo",
        "haui_compass.api.demo_preflight",
        "haui_compass.api.postgres_dependencies",
    }
)


def module_name(path: Path) -> str:
    parts = list(path.relative_to(SOURCE_ROOT.parent).with_suffix("").parts)
    if parts[-1] == "__init__":
        parts.pop()
    return ".".join(parts)


def imported_modules(module: str, source: str, *, is_package: bool) -> set[str]:
    """Absolute dotted names of everything a module imports (including nested/conditional)."""
    package_parts = module.split(".") if is_package else module.split(".")[:-1]
    found: set[str] = set()
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.Import):
            found.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            if node.level:
                base = package_parts[: len(package_parts) - (node.level - 1)]
                found.add(".".join([*base, *(node.module.split(".") if node.module else [])]))
            elif node.module:
                found.add(node.module)
    return found


def find_violations(module: str, source: str, *, is_package: bool = False) -> list[str]:
    parts = module.split(".")
    if len(parts) < 2 or parts[0] != PACKAGE or parts[1] not in ALLOWED_LAYERS:
        return []
    layer = parts[1]
    allowed = ALLOWED_LAYERS[layer] | {layer}
    violations: list[str] = []
    for target in sorted(imported_modules(module, source, is_package=is_package)):
        top = target.split(".")[0]
        if top == PACKAGE:
            target_layer = target.split(".")[1] if "." in target else None
            if target_layer is None or target_layer in allowed:
                continue
            if layer == "api" and target_layer == "infrastructure" and module in COMPOSITION_ROOTS:
                continue
            violations.append(f"{module} imports {target} (layer '{layer}' -> '{target_layer}')")
        elif layer in STDLIB_ONLY_LAYERS and top not in sys.stdlib_module_names:
            violations.append(f"{module} imports third-party '{target}' (layer '{layer}')")
    return violations


def test_source_tree_respects_dependency_direction() -> None:
    violations: list[str] = []
    scanned = 0
    for path in sorted(SOURCE_ROOT.rglob("*.py")):
        scanned += 1
        violations += find_violations(
            module_name(path), path.read_text(), is_package=path.name == "__init__.py"
        )
    assert scanned > 0, "no source files scanned; SOURCE_ROOT is wrong"
    assert not violations, "\n".join(violations)


def test_scan_covers_the_layers_that_exist_today() -> None:
    layers = {
        module_name(p).split(".")[1]
        for p in SOURCE_ROOT.rglob("*.py")
        if p.name != "__init__.py" or p.parent != SOURCE_ROOT
    }
    assert {"domain", "application", "infrastructure"} <= layers


def test_domain_must_not_import_outer_layers() -> None:
    for outer in ("application", "infrastructure", "ai", "api", "engines"):
        source = f"from haui_compass.{outer}.thing import X\n"
        assert find_violations("haui_compass.domain.tasks.task", source), outer


def test_domain_must_be_standard_library_only() -> None:
    assert find_violations("haui_compass.domain.tasks.task", "import pydantic\n")
    assert not find_violations("haui_compass.domain.tasks.task", "import datetime, uuid\n")


def test_engines_may_use_domain_but_not_infrastructure() -> None:
    module = "haui_compass.engines.risk.engine"
    assert not find_violations(module, "from haui_compass.domain.risk import RiskSignal\n")
    assert find_violations(module, "from haui_compass.infrastructure.clock import SystemClock\n")
    assert find_violations(module, "from haui_compass.ai.explanation import explain\n")


def test_ai_must_not_import_application_or_infrastructure() -> None:
    module = "haui_compass.ai.explanation.generator"
    assert find_violations(module, "from haui_compass.application.ports import clock\n")
    assert find_violations(module, "import haui_compass.infrastructure.llm\n")


def test_application_must_not_import_infrastructure_or_api() -> None:
    module = "haui_compass.application.use_cases.thing"
    assert find_violations(module, "from haui_compass.infrastructure.clock import SystemClock\n")
    assert find_violations(module, "from haui_compass.api.v1 import router\n")


def test_only_composition_root_in_api_may_import_infrastructure() -> None:
    source = "from haui_compass.infrastructure.clock import SystemClock\n"
    assert find_violations("haui_compass.api.v1.routes", source)
    assert not find_violations("haui_compass.api.dependencies", source)


def test_relative_imports_are_resolved_and_checked() -> None:
    assert find_violations(
        "haui_compass.domain.tasks.task", "from ...infrastructure import clock\n"
    )
    assert not find_violations("haui_compass.domain.tasks.task", "from ..courses import course\n")


def test_imports_inside_functions_are_checked() -> None:
    source = "def f():\n    from haui_compass.infrastructure.clock import SystemClock\n"
    assert find_violations("haui_compass.domain.tasks.task", source)

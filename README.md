# HaUI Compass

> **Know what to do next.**

HaUI Compass is a planned adaptive AI learning companion for students at Hanoi University of Industry (HaUI). It is designed around a closed learning loop—plan, do, monitor, reflect, adapt, and plan again—to recommend a student's next best learning action and explain why it matters.

## Current status

**Current phase: Project foundation / architecture design.**

**IMPLEMENTED:** repository foundation, source-of-truth documentation, working protocol, directory structure, and the backend Python package foundation (core domain types `Course`/`Assignment`/`Task`, typed identifiers, `Clock`/`SystemClock`, `StudentState` v0 with its pure derivation engine, a deterministic rule-based `RiskEngine` v0 (not a probability; thresholds are unvalidated MVP heuristics), a deterministic `NextBestActionEngine` v0 (ordered comparison, no score, no LLM; no `risk_if_deferred` yet), the `LMSProvider` port with a deterministic `MockLMSProvider` (development/test infrastructure only) and record-to-domain mapping, the first end-to-end use case `GenerateDailyRecommendation` (LMS + explicit tasks/capacity -> StudentState -> Risk -> NextBestAction, no FastAPI/database/UI yet), Execution Tracking v0 (`TaskExecution`, task state transitions, and `RecordTaskExecution`, proven to update `StudentState` and NBA eligibility), tests, and an import-boundary check).

**PLANNED:** the web application, FastAPI service, further domain behavior, AI workflows, grounded RAG, behaviour-aware risk, `risk_if_deferred`, weekly planning, reflections, execution persistence, real LMS providers (HaUI, Canvas, Moodle), dashboards, and evaluation suites.

No product feature is claimed to be operational yet.

## High-level architecture

The initial direction is a modular monolith:

```text
Next.js web application
          │
      FastAPI API
          │
  Domain/application modules
    ├── deterministic planning and risk rules
    ├── provider-independent AI capabilities
    ├── LMS provider abstraction
    └── grounded retrieval with citations
          │
  PostgreSQL (+ pgvector when justified)
```

This direction is intentionally revisable. Material decisions will be recorded as Architecture Decision Records (ADRs).

## Repository structure

Package layout and dependency rules are defined in [ADR-0001](docs/decisions/0001-python-package-and-domain-boundaries.md). Everything below is an **empty scaffold**: only placeholder files exist, and no application code has been implemented.

```text
apps/
  api/                          Backend (FastAPI itself is still planned)
    src/haui_compass/           Single Python package; only `domain` (core types, `StudentState` v0, risk types), `engines/student_state`, `engines/risk`, `engines/next_best_action`, the Clock and LMS ports with their mock/system adapters, record mapping, and the `application/use_cases` layer's first use case exist so far
      domain/                   Entities, value objects, invariants (no framework or vendor imports)
      engines/                  Deterministic decision algorithms: student state, risk, planning,
                                next best action, replanning (no AI)
      application/              Use cases and the ports they consume (repositories, LMS, clock)
      ai/                       Only model-requiring capabilities: decomposition, explanation,
                                reflection, retrieval/citations, guardrails
      infrastructure/           Adapters: persistence, LMS providers, LLM providers, retrieval, telemetry
      api/v1/                   HTTP layer
      config/                   Settings
    tests/                      Backend unit and integration tests
  web/                          Planned Next.js web application
packages/shared/                Planned generated or shared contracts
evals/                          Planned AI and product evaluation assets (not unit tests)
tests/                          Reserved for cross-app end-to-end tests
docs/                           Product source of truth, architecture, ADRs, and research
scripts/                        Repository automation
infra/                          Infrastructure definitions when justified
```

Start with [docs/PROJECT.md](docs/PROJECT.md) for product scope and architecture, then read [CLAUDE.md](CLAUDE.md) before making changes.

## Backend development

The backend package foundation lives in `apps/api` and currently depends on nothing at runtime. There is no web server yet, so there is nothing to start.

Requires Python 3.12 or newer (developed on 3.12; [uv](https://docs.astral.sh/uv/) is convenient but optional).

```bash
cd apps/api
uv venv --python 3.12 .venv                   # or: python3.12 -m venv .venv
uv pip install --python .venv/bin/python -e ".[dev]"   # or: .venv/bin/pip install -e ".[dev]"

.venv/bin/python -m pytest                    # tests (includes the import-boundary check)
.venv/bin/ruff check . && .venv/bin/ruff format --check .   # lint and formatting
.venv/bin/mypy                                # strict type checking
.venv/bin/python -m pytest --cov              # optional coverage report
```

Dependency direction between layers is enforced by `apps/api/tests/unit/test_import_boundaries.py` (see ADR-0001).

## Development status

The repository contains documentation, the empty architectural scaffold, and a small tested backend foundation (domain primitives, a clock abstraction, `StudentState` v0, a rule-based Risk Engine v0, and a rule-ordered Next Best Action v0). The web and API applications, database schemas, AI capabilities, and all other product behavior such as planning remains planned and will be introduced incrementally in future tasks.

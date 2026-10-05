# HaUI Compass

> **Know what to do next.**

HaUI Compass is a planned adaptive AI learning companion for students at Hanoi University of Industry (HaUI). It is designed around a closed learning loop—plan, do, monitor, reflect, adapt, and plan again—to recommend a student's next best learning action and explain why it matters.

## Current status

**Current phase: Project foundation / architecture design.**

**Latest implemented milestone:** Demo Evaluation & Council Hardening v0.5, building on the
deterministic Learning Loop API, PostgreSQL persistence foundation, and development-only Next.js
workspace. It includes three resettable fictional scenarios and bounded offline recommendation
explanations with visible decision evidence. See the [demo runbook](docs/demo/demo-showcase-v0.2.md),
[frontend setup and boundaries](apps/web/README.md) and
[product implementation status](docs/PROJECT.md). The opt-in demo uses fictional,
in-memory data; authentication, real LMS and production deployment remain planned.

**AI Task Decomposition v0.3 is IMPLEMENTED, development-only:** a student can generate bounded
offline candidates for a fictional assignment, edit/select them, and confirm the chosen subset
through the existing task-creation boundary before deterministic recommendation and planning.
See the [v0.3 presenter flow](docs/demo/ai-task-decomposition-v0.3.md).

**Real LLM Integration v0.4 is IMPLEMENTED, opt-in and development-only:** the existing
recommendation-explanation and task-decomposition ports can use the OpenAI Responses API with
strict structured output when server configuration and a credential are present. Disabled,
missing-credential, timeout, HTTP and invalid-output paths retain deterministic fallback behavior.
No model chooses risk, NBA, scheduling or replanning, and task candidates still require explicit
confirmation. See the [v0.4 configuration and demo flow](docs/demo/real-llm-integration-v0.4.md)
and [ADR-0006](docs/decisions/0006-openai-responses-infrastructure-adapter.md).

**Demo Evaluation & Council Hardening v0.5 is IMPLEMENTED, development-only:** the canonical
[council runbook](docs/demo/council-demo-v0.5.md) provides an offline and optional-live presenter
path, reset verification, and a safe preflight command. The versioned fictional LLM dataset and
runner provide reproducible offline contract evidence; they do not make a general model-quality or
student-outcome claim. See the [technical evidence summary](docs/demo/council-technical-evidence.md).

The foundation descriptions below describe earlier milestones, not production readiness.

**IMPLEMENTED:** repository foundation, source-of-truth documentation, working protocol, directory structure, and the backend Python package foundation (core domain types `Course`/`Assignment`/`Task`, typed identifiers, `Clock`/`SystemClock`, `StudentState` v0 with its pure derivation engine, a deterministic rule-based `RiskEngine` v0 (not a probability; thresholds are unvalidated MVP heuristics), a deterministic `NextBestActionEngine` v0 (ordered comparison, no score, no LLM; no `risk_if_deferred` yet), the `LMSProvider` port with a deterministic `MockLMSProvider` (development/test infrastructure only) and record-to-domain mapping, the first end-to-end use case `GenerateDailyRecommendation` (LMS + explicit tasks/capacity -> StudentState -> Risk -> NextBestAction, no FastAPI/database/UI yet), Execution Tracking v0 (`TaskExecution`, task state transitions, and `RecordTaskExecution`, proven to update `StudentState` and NBA eligibility), Structured Reflection v0 (`Reflection`, typed `ReflectionSignal`s with a candidate/confirmed split, and the `SubmitReflection`/`ConfirmReflectionSignals` use cases; no LLM, no `StudentState` field yet), Weekly Planner v0 (`StudyPlan`, explicit `StudyWindow`s, deterministic deadline-first allocation, typed unplanned effort, and `GenerateWeeklyPlan`), Adaptive Replanning v0 (explicit baseline/current facts, strict valid-block preservation, explicit remaining effort, typed plan changes and objective churn facts; confirmed reflections are informational only), and Persistence Foundation v0 (application repository ports plus deterministic in-memory adapters for task state, execution facts, confirmed reflections, and append-only typed plan revisions), tests, and an import-boundary check).

**IMPLEMENTED:** FastAPI Walking Skeleton v0 on `feat/api-skeleton`: `/api/v1/health`, persisted-task daily recommendation, persisted task execution with explicit record-id idempotency, stable DTO/error envelopes, OpenAPI generation, and injectable in-memory composition root. This is development-only HTTP plumbing; it has no real authentication or durable database.

**PLANNED:** production web integration, further domain behavior, additional AI workflows,
grounded RAG, behaviour-aware risk, `risk_if_deferred`, weekly goals, LLM-assisted
reflection summaries, evidence-backed reflection effects, estimate calibration,
real LMS providers, lecturer dashboards, authentication and evaluation suites.

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

Package layout and dependency rules are defined in [ADR-0001](docs/decisions/0001-python-package-and-domain-boundaries.md). Implemented backend modules occupy part of the scaffold; unimplemented areas remain placeholders.

```text
apps/
  api/                          FastAPI backend and deterministic application/domain
    src/haui_compass/           Single Python package containing the implemented domain foundation, deterministic engines, application use cases, and current adapters
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
  web/                          Next.js development workspace MVP
packages/shared/                Planned generated or shared contracts
evals/                          Versioned fictional evaluation assets (not deployable application code)
tests/                          Reserved for cross-app end-to-end tests
docs/                           Product source of truth, architecture, ADRs, and research
scripts/                        Repository automation
infra/                          Infrastructure definitions when justified
```

Start with [docs/PROJECT.md](docs/PROJECT.md) for product scope and architecture, then read [CLAUDE.md](CLAUDE.md) before making changes.

## Backend development

The backend lives in `apps/api`. Run the fictional learning-loop demo using the
[frontend development guide](apps/web/README.md); the ordinary API factory is
`haui_compass.api.main:create_app` and remains unseeded by default.

Real LLM access is server-side and opt-in. The default configuration is offline. Set
`HAUI_COMPASS_LLM_ENABLED=true` and `OPENAI_API_KEY` in the API process to compose the OpenAI
Responses adapter; see the v0.4 runbook for all optional settings. Never expose this key to Next.js.

Before a council presentation, run `uv run --extra dev python -m haui_compass.api.demo_preflight`
from `apps/api`; it confirms the reproducible offline path without calling an external provider.

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

### PostgreSQL persistence (development)

The PostgreSQL adapter is an explicit composition path; the default API remains in-memory.
Start the disposable databases with `docker compose -f docker-compose.postgres.yml up -d`,
set `HAUI_COMPASS_DATABASE_URL` (and `HAUI_COMPASS_TEST_DATABASE_URL` for integration tests),
then run `cd apps/api && alembic upgrade head`. Alembic owns schema changes; application startup
never runs migrations. PostgreSQL tests are skipped unless a real PostgreSQL URL is configured.

Dependency direction between layers is enforced by `apps/api/tests/unit/test_import_boundaries.py` (see ADR-0001).

## Development status

The deterministic backend, HTTP learning loop, PostgreSQL adapters/migrations, development
frontend and bounded opt-in OpenAI language adapter are implemented. Authenticated production
integration, real LMS access and broader AI capabilities remain planned; the demo is not a
deployed product.

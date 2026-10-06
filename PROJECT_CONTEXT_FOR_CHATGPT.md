# HaUI Compass — Technical Context for an AI Engineer

> **Purpose.** This is a handoff document for an AI engineer (human or agent) who needs to
> continue supporting HaUI Compass without first rediscovering the repository. It describes
> current code, architectural constraints, deliberate v0 limitations, and the next decisions
> that need evidence. It is not a product claim or a substitute for the source code.
>
> **Status snapshot:** 2026-10-03. The deterministic learning loop, FastAPI API,
> development-only Next.js workspace, academic import, and PostgreSQL persistence adapter are
> implemented. The product is **not production-ready**: there is no authentication, real HaUI
> LMS provider, LLM/RAG capability, lecturer dashboard, or production deployment.

## 1. Owner technical profile and collaboration style

The project owner is a **fresher AI Engineer** with a sound basic foundation in AI/ML/DL,
mathematics, and programming. They use an AI coding assistant both to implement/debug code and
to learn AI engineering topics more deeply.

When assisting them:

- Explain the technical reason behind a change, not only the patch.
- Use Vietnamese by default. It is fine to use standard English engineering terms
  (`idempotency`, `port`, `adapter`, `RAG`, `slack`) with a concise Vietnamese explanation.
- Assume basic ML/DL knowledge; do not restart from elementary definitions. Do show intermediate
  reasoning, data flow, assumptions, invariants, and concrete code examples when a concept is new.
- Make the distinction between **implemented**, **planned**, and **proposed** explicit. Never
  market a planned AI feature as running software.
- Prefer the smallest coherent vertical change with relevant tests. Do not introduce agent
  frameworks, microservices, a generic repository, or a predictive model merely because they
  sound architecturally advanced.

The root working protocol is [CLAUDE.md](CLAUDE.md). Before changing code, read it and
[docs/PROJECT.md](docs/PROJECT.md), inspect the relevant implementation/tests, then check
`git status`. Existing uncommitted work is user-owned. At this snapshot,
`apps/api/uv.lock` is untracked; do not remove, stage, or overwrite it unless its owner asks.

## 2. Product in one paragraph

**HaUI Compass** is an adaptive learning companion for Hanoi University of Industry students.
Its central question is: **“What should this student do next, and why?”** Rather than acting as a
plain assignment list, it turns explicit academic facts, task estimates, deadlines and study
availability into an explainable next action and a feasible weekly plan. The intended learning
loop is:

```text
PLAN → DO → MONITOR → REFLECT → ADAPT → PLAN AGAIN
```

The implemented v0 deliberately solves its deterministic parts with transparent rules. It does
not currently use an LLM to rank, schedule, or calculate risk. Future AI is a supporting layer
for language/reasoning tasks such as task-decomposition suggestions, explanation phrasing,
reflection summarisation, and grounded course-material Q&A.

Product source of truth: [docs/PROJECT.md](docs/PROJECT.md). Current release boundary:
[docs/releases/mvp-v0.1.md](docs/releases/mvp-v0.1.md).

## 3. Repository map

```text
HaUI_Compass/
├── README.md                         # Fast onboarding + truthful current status
├── CLAUDE.md                         # Mandatory engineering protocol
├── docs/
│   ├── PROJECT.md                    # Product source of truth and scope
│   ├── architecture/                 # Initial architecture proposal/reference
│   ├── decisions/                    # ADR-0001 ... ADR-0004
│   ├── evaluation/                   # Deterministic MVP benchmark design
│   ├── pilot/                        # Import contract/runbook/HaUI readiness material
│   └── thesis/                       # Pilot-study procedure and analysis assets
├── apps/
│   ├── api/                          # Python/FastAPI backend
│   │   ├── src/haui_compass/
│   │   │   ├── domain/               # Pure entities, value objects, invariants
│   │   │   ├── engines/              # Pure deterministic algorithms
│   │   │   ├── application/          # Use cases and consumer-owned ports
│   │   │   ├── infrastructure/       # LMS, clocks, memory/Postgres adapters
│   │   │   └── api/                  # FastAPI composition, routes, DTOs/errors
│   │   ├── alembic/                  # PostgreSQL migrations
│   │   └── tests/                    # Unit + integration/contract/API tests
│   └── web/                          # Next.js/React/TypeScript development workspace
├── evals/                            # Versioned engineering eval corpus/runner
├── docker-compose.postgres.yml       # Disposable dev + test PostgreSQL services
└── .env.example                      # Environment-variable template; never add secrets
```

Important entry points:

| Concern | Start here |
|---|---|
| Product scope/status | [README.md](README.md), [docs/PROJECT.md](docs/PROJECT.md) |
| Backend app factory | [api/main.py](apps/api/src/haui_compass/api/main.py) |
| Default dependency graph | [api/dependencies.py](apps/api/src/haui_compass/api/dependencies.py) |
| Explicit PostgreSQL graph | [api/postgres_dependencies.py](apps/api/src/haui_compass/api/postgres_dependencies.py) |
| HTTP routes/DTO mapping | [api/v1/routes.py](apps/api/src/haui_compass/api/v1/routes.py) |
| Fictional frontend demo | [api/demo.py](apps/api/src/haui_compass/api/demo.py) |
| Web API client/types | [web/src/lib/api.ts](apps/web/src/lib/api.ts) |
| Web shared state | [web/src/components/workspace.tsx](apps/web/src/components/workspace.tsx) |
| PostgreSQL model/mapping | [postgres/models.py](apps/api/src/haui_compass/infrastructure/persistence/postgres/models.py), [postgres/mapping.py](apps/api/src/haui_compass/infrastructure/persistence/postgres/mapping.py) |

## 4. Architecture and dependency rules

HaUI Compass is a **modular monolith** with deployable web and API applications, not a
microservice system.

```text
Next.js web (presentation/input only)
            │ HTTP JSON
            ▼
FastAPI API (Pydantic DTOs, error mapping, composition)
            │
Application use cases (orchestration, ports, transactions)
            │
┌───────────┴────────────────────────────────────┐
│ Domain: types + invariants                      │
│ Engines: pure risk/planning/recommendation/etc. │
└───────────┬────────────────────────────────────┘
            │ consumer-owned protocols/ports
            ▼
Infrastructure adapters: memory, PostgreSQL, LMS, clock
```

### Non-negotiable boundaries

1. Dependencies point inward: `web → api → application → domain/engines`.
2. `domain/` and `engines/` must not import FastAPI, Pydantic, SQLAlchemy, database drivers,
   environment configuration, LLM SDKs, network clients, or wall-clock functions.
3. Engines receive all facts and time explicitly; timezone-aware UTC is required for persisted
   facts and engine inputs. `Clock` is injected by a use case.
4. `application/ports/` owns the `Protocol` interfaces that it consumes. Infrastructure
   implements them. Do not create a global `interfaces/` folder or generic `BaseRepository`.
5. ORM models never leak across the infrastructure boundary. Map explicitly to immutable
   domain/application records.
6. The browser must not duplicate risk, ranking, or scheduling algorithms. It renders API output
   and sends user input.

[ADR-0001](docs/decisions/0001-python-package-and-domain-boundaries.md) defines the Python
package/layer boundary; [ADR-0003](docs/decisions/0003-http-api-boundary.md) defines the HTTP
factory/composition boundary.

## 5. Implemented domain model

The current code has the following bounded domain modules. The full conceptual model in
`docs/PROJECT.md` is broader; do not assume all conceptual types have a database schema yet.

| Module | Principal types / meaning |
|---|---|
| `domain/students` | typed `StudentId`; immutable `StudentState` with capacity and progress v0 |
| `domain/courses` | `Course` value/entity boundary for academic context |
| `domain/assignments` | `Assignment`, `AssignmentId`, deadline and assignment facts |
| `domain/tasks` | actionable `Task`, `TaskId`, `TaskStatus`, `TaskExecution`, outcomes/summaries |
| `domain/plans` | `PlanPeriod`, `StudyWindow`, `StudyBlock`, immutable `StudyPlan`, `UnplannedTask`, replanning audit types |
| `domain/risk` | `AssignmentRiskContext`, versioned policy, `RiskSignal`, levels/evidence/reason codes |
| `domain/recommendations` | action candidate, recommendation/no-recommendation types, ranking evidence/reasons |
| `domain/reflections` | structured responses, reflection period, candidate and confirmed typed signals |
| `domain/shared` | validation and domain errors |

### Ownership and persistence semantics

- The LMS remains authoritative for courses, assignments, deadlines and submission status.
  v0 deliberately has no `CourseRepository` or `AssignmentRepository`.
- Compass owns student-specific tasks, append-only execution facts, confirmed reflection signals,
  initial plans and append-only plan revisions.
- `Task` and `TaskExecution` do not contain a student ID; application-level stored envelopes carry
  explicit student ownership. Never infer ownership from an assignment UUID.
- Candidate reflection signals are proposals only and are not persisted as confirmed facts.
- `StudyPlan` is persistence-agnostic. `StoredStudyPlan` adds record ID, revision, optional parent,
  save time and, for revisions, the typed `ReplanningResult`.

These decisions are intentional and documented in
[ADR-0002](docs/decisions/0002-persistence-ownership-and-revisions.md).

## 6. Core engines: exact v0 behaviour

All engines below are deterministic, side-effect-free functions. Preserve their reason codes,
evidence shapes and versioning when extending them.

### 6.1 Student-state derivation

Source: [engines/student_state/derive.py](apps/api/src/haui_compass/engines/student_state/derive.py).

Given explicit tasks, available capacity and `now`, it returns an immutable `StudentState`:

- committed effort = full estimates of all non-completed tasks;
- `IN_PROGRESS` still counts at full estimate because v0 does not infer partial remaining work;
- progress is counts of not-started/in-progress/completed tasks;
- overcommitment is reported, never silently clamped.

It is not yet a behavioural profile, a persisted snapshot design, or reflection-aware memory.

### 6.2 Risk Engine v0

Source: [engines/risk/assess.py](apps/api/src/haui_compass/engines/risk/assess.py).

Input is an explicit assignment context: deadline, open-task count, remaining effort, capacity
until this exact deadline, and `now`. Output is `RiskSignal(level, reason_codes, evidence,
engine_version)`. Rules are first-match wins:

| Priority | Condition | Result |
|---:|---|---|
| 1 | no open tasks | `LOW / NO_REMAINING_WORK` |
| 2 | deadline ≤ now | `HIGH / DEADLINE_PASSED` |
| 3 | effort or deadline-specific capacity unknown | `UNKNOWN / MISSING_*` |
| 4 | zero capacity and positive effort | `HIGH / NO_CAPACITY_BEFORE_DEADLINE` |
| 5 | effort > capacity | `HIGH / EFFORT_EXCEEDS_CAPACITY` |
| 6 | `0 ≤ slack < 25% × effort` | `MEDIUM / LOW_SLACK` |
| 7 | otherwise | `LOW / SUFFICIENT_SLACK` |

`slack = capacity - effort`. The 25% threshold is an unvalidated MVP heuristic, **not** a late
submission probability and not an ML score. Any policy change requires explicit tests and a new
engine version.

### 6.3 Next Best Action (NBA) v0

Source: [engines/next_best_action/recommend.py](apps/api/src/haui_compass/engines/next_best_action/recommend.py).

Completed tasks are excluded. Eligible tasks are ordered, not weighted-scored:

1. assignment risk: `HIGH`, `MEDIUM`, `LOW`;
2. earlier assignment deadline;
3. `IN_PROGRESS` before `NOT_STARTED`;
4. lower assignment ID, then lower task ID for a stable tie-break.

`UNKNOWN` risk is never treated as safe. It is reported as `UNKNOWN` but ranked as the
policy-selected tier (`MEDIUM` by default). The output includes reason codes, risk evidence and
the deciding ranking dimension. `risk_if_deferred`, alternative candidates, dismissals and learned
ranking are intentionally absent; calculating deferral risk needs an explicit capacity-after-
deferral model.

### 6.4 Weekly Planner v0

Source: [engines/planning/schedule.py](apps/api/src/haui_compass/engines/planning/schedule.py).

The planner schedules each non-completed task's *stated* effort into explicit study windows:

- order: earliest deadline, then in-progress on a deadline tie, then stable IDs;
- overlapping/touching input windows are normalised/merged;
- allocation uses earliest available time before the assignment deadline;
- one long task may span multiple `StudyBlock`s;
- insufficient capacity leaves a typed exact remainder in `UnplannedTask`.

It does not read persistence, LMS, risk, `StudentState`, execution history, reflection, an LLM or
the wall clock. Do not change estimates or invent availability inside this engine.

### 6.5 Execution transition

Source: [engines/execution/transitions.py](apps/api/src/haui_compass/engines/execution/transitions.py).

```text
NOT_STARTED + PARTIAL   → IN_PROGRESS
NOT_STARTED + COMPLETED → COMPLETED
IN_PROGRESS + PARTIAL   → IN_PROGRESS
IN_PROGRESS + COMPLETED → COMPLETED
COMPLETED + any outcome → reject
```

Execution records use explicit record IDs. An identical retry is idempotent; reusing that ID with
different semantic content is a conflict. Actual duration is a fact, not an automatic subtraction
from remaining effort.

### 6.6 Structured reflection

Sources: [engines/reflection/candidates.py](apps/api/src/haui_compass/engines/reflection/candidates.py) and
[application/use_cases/persisted_learning_loop.py](apps/api/src/haui_compass/application/use_cases/persisted_learning_loop.py).

Structured answers may nominate reflected tasks, workload feedback, difficult topics and deferred
tasks. The engine produces deterministic candidates:

- factual `EstimationFeedbackSignal` from a task's estimated and recorded actual duration;
- self-reported workload, difficult-topic and deferred-task signals.

The server regenerates candidates and accepts only explicitly selected candidate IDs at
confirmation time. This is important: a client cannot promote an arbitrary signal to durable
memory. In v0, confirmed reflection is persisted but informational for replanning.

### 6.7 Adaptive Replanning v0

Source: [engines/replanning/replan.py](apps/api/src/haui_compass/engines/replanning/replan.py).

Inputs include baseline plan, current tasks/assignments, current study windows, *explicit remaining
effort for every open task*, execution summaries, confirmed reflections and `effective_at`.

- Past blocks and a block crossing `effective_at` are frozen/reserved.
- Valid future blocks are preserved if they still fit windows, deadlines and explicit remaining
  effort.
- Only residual work is sent through Weekly Planner.
- Finished tasks lose future blocks; infeasible work remains visibly unplanned.
- Output contains per-task typed change reasons and objective churn counts/durations.

Do not derive remaining effort as `estimate - actual duration`; the user must state it. Reflection
signal kinds are reported as informational only, so no reflection silently changes placement.

## 7. Application workflows and API

The application layer coordinates repositories, LMS mapping, one injected clock read and the pure
engines. Important use cases live in `application/use_cases/`:

- `get_daily_recommendation.py` / `generate_daily_recommendation.py`:
  `LMS + persisted tasks + explicit capacity → StudentState → per-assignment Risk → NBA`.
- `create_study_task.py`: validates a task against an LMS/imported assignment, then stores it.
- `record_persisted_task_execution.py`: appends idempotent execution and atomically updates task
  status.
- `persisted_learning_loop.py`: persisted plan generation, reflection candidate/confirmation,
  replan and history orchestration.
- `academic_import.py`: validates JSON/CSV-shaped academic input and routes it behind the LMS
  provider boundary.

The routes are thin adapters in [api/v1/routes.py](apps/api/src/haui_compass/api/v1/routes.py).
Main implemented route groups are:

| Route group | Purpose |
|---|---|
| `GET /api/v1/health` | health check |
| `POST/GET/DELETE /api/v1/academic-data` and `/import`, `/import/csv` | student-provided academic data lifecycle |
| `POST /api/v1/tasks` | create a Compass task for an assignment |
| `POST /api/v1/daily-recommendation` | return risks + one NBA/no-recommendation |
| `POST /api/v1/task-executions` | record idempotent work session and task transition |
| `POST /api/v1/weekly-plans`, `GET .../latest`, `GET .../history` | plan creation and append-only history |
| `POST /api/v1/reflections/candidates`, `/confirm` | candidate generation and explicit confirmation |
| `POST /api/v1/weekly-plans/replan` | create the next plan revision |

HTTP error responses have a stable envelope: `{ "error": { "code": ..., "message": ... } }`.
Pydantic DTOs stay in `api/schemas/`, especially
[learning_loop.py](apps/api/src/haui_compass/api/schemas/learning_loop.py).

### Academic import boundary

The import contract is [docs/pilot/academic-import-v1.md](docs/pilot/academic-import-v1.md).
It supports user-provided `manual`, `csv`, or `json` namespaced sources—not a real LMS login.
Canonical CSV has one assignment per row and an exact header. Imports are validated before an
atomic replacement; they are idempotent only when exactly identical. Do not accept passwords,
tokens, grades, submissions or other students' private data through this route.

## 8. Persistence and data consistency

### In-memory default

`build_container()` in [api/dependencies.py](apps/api/src/haui_compass/api/dependencies.py) is the
ordinary app's default. It uses `MockLMSProvider` plus in-memory task/execution/plan/reflection
repositories. It is appropriate for local development/test only and loses state after restart.

### PostgreSQL path

`build_postgres_container()` is explicit in
[api/postgres_dependencies.py](apps/api/src/haui_compass/api/postgres_dependencies.py). It uses
synchronous SQLAlchemy 2.x, psycopg and Alembic. Configure `HAUI_COMPASS_DATABASE_URL` (or
`HAUI_COMPASS_TEST_DATABASE_URL` for integration tests), run Alembic, then compose the app with
this container. Normal startup does **not** infer this from an environment variable and does not
run migrations automatically.

Important guarantees/choices:

- UTC-aware timestamps and integer-second durations;
- database constraints and real PostgreSQL transactions; no SQLite substitute;
- one transaction handles execution append plus task snapshot update;
- plan revisions are append-only and latest-plan rows are protected against stale baseline writes;
- execution ID uniqueness handles idempotent retries versus semantic conflicts;
- PostgreSQL repositories require access inside `PostgresPersistenceTransactionManager.run()`.

[ADR-0004](docs/decisions/0004-postgresql-persistence-and-transactions.md) is the durable
rationale. Migrations are in `apps/api/alembic/versions/`.

## 9. Web workspace and demo boundaries

The development UI is in `apps/web`, built with Next.js 16, React 19 and TypeScript. It has:

- **Today:** one next action, explanation/risk evidence and execution recording;
- **Weekly Plan:** study blocks, plan/replan forms, unplanned effort and before/after changes;
- **Reflect:** structured responses, candidate display and explicit selection;
- **History:** plan revisions;
- **Academic:** manual/CSV/JSON import and task creation for pilot data.

`haui_compass.api.demo:create_demo_app` seeds four fictional tasks and three authored availability
windows in memory. It is opt-in; default API startup remains unseeded. The web app proxies
`/compass-api/*` to `/api/v1/*` and must not contain business-decision copies.

Run locally:

```bash
cd apps/api
uv run --extra dev uvicorn haui_compass.api.demo:app --host 127.0.0.1 --port 8001

# separate terminal
cd apps/web
npm ci
COMPASS_API_URL=http://127.0.0.1:8001 npm run dev
```

Read [apps/web/README.md](apps/web/README.md) before changing frontend behaviour. Notable v0 UI
constraints: Hanoi timezone presentation; browser-local input converted to aware ISO timestamps;
remaining effort is explicit user input; candidate checkboxes start unchecked; no mutation is
auto-retried; replan comparison is session-local even though plan history persists while the API
runs.

## 10. Tests, checks and evaluation evidence

### Test layout

```text
apps/api/tests/
├── unit/domain/                 # entities, validation, invariants
├── unit/engines/                # deterministic engine boundary cases
├── unit/application/            # use cases and ports
├── integration/api/             # FastAPI endpoints/learning loop
├── integration/persistence/     # memory contract/learning-loop persistence
├── integration/postgres/        # real PostgreSQL adapter, transaction and HTTP tests
└── integration/lms/             # mock LMS and provider contract tests
apps/web/tests/workspace.spec.ts # Playwright browser/API flow
evals/mvp_benchmark_v1.py        # deterministic benchmark runner
evals/datasets/mvp-v1.json       # scenario manifest / golden expectations
```

Useful commands:

```bash
# Backend
cd apps/api
uv run --extra dev pytest
uv run --extra dev ruff check .
uv run --extra dev ruff format --check .
uv run --extra dev mypy

# Frontend
cd apps/web
npm run typecheck
npm run lint
npm run build
npm test

# Engineering benchmark, fictional data only
cd apps/api
uv run --extra dev python ../../evals/mvp_benchmark_v1.py --output ../../artifacts/evals/mvp-v1
```

PostgreSQL tests are deliberately skipped without a real configured disposable database. Start it
with `docker compose -f docker-compose.postgres.yml up -d` and configure the test URL before
claiming PostgreSQL validation.

The recorded local baseline for commit `4dbf3fd` was 36/36 benchmark cases, 5/5 in-memory loops,
5/5 PostgreSQL loops, 12/12 Playwright checks and zero observed PostgreSQL invariant violations.
Treat this as local deterministic engineering evidence with fictional data—not product reliability,
student-outcome improvement, security assurance or real-world latency evidence. See
[docs/evaluation/mvp-benchmark-v1.md](docs/evaluation/mvp-benchmark-v1.md).

## 11. Accepted design decisions

| ADR | Decision to preserve |
|---|---|
| [ADR-0001](docs/decisions/0001-python-package-and-domain-boundaries.md) | One Python package; pure domain/engines; consumer-owned ports; no vendor/framework import inward. |
| [ADR-0002](docs/decisions/0002-persistence-ownership-and-revisions.md) | LMS data remains authoritative; Compass persists its own facts; candidate reflections are not facts; plan history is append-only. |
| [ADR-0003](docs/decisions/0003-http-api-boundary.md) | FastAPI is confined to `api`; `create_app(container=...)` supports explicit dependency injection; trusted request identity is development-only. |
| [ADR-0004](docs/decisions/0004-postgresql-persistence-and-transactions.md) | PostgreSQL + SQLAlchemy/Alembic for durable semantics; migrations are explicit; no SQLite compatibility claim; transaction and concurrency semantics belong in adapter tests. |

Other durable principles:

- Use an LLM to phrase or propose, never as the only calculator of dates, capacity, completion,
  risk thresholds or schedule placement.
- Any AI output that could mutate durable state must be schema-validated and, where appropriate,
  confirmed by the student.
- Privacy and academic integrity are product boundaries, not prompt-only instructions.
- Add versioned policies/evaluation data before changing rules that affect recommendations.

## 12. Current implementation state: what works versus what does not

### Implemented now

- Python domain model, deterministic engines, use cases and typed errors.
- Mock LMS and user-provided CSV/JSON/manual academic import boundary.
- Daily recommendation from persisted tasks, deadline risk and explicit assignment capacity.
- Task execution tracking with idempotency and task state transitions.
- Deterministic weekly planning with explicit unplanned effort.
- Structured reflection candidates plus server-validated explicit confirmation.
- Adaptive replan with audited revisions/history and explicit remaining effort.
- FastAPI learning-loop endpoints and development-only Next.js UI.
- In-memory and PostgreSQL repository adapters, migrations and contract/integration tests.

### Not implemented / do not imply otherwise

- Authentication, authorization, multi-user identity or role-based data boundaries.
- Direct HaUI LMS integration, OAuth/credentials, sync scheduling or a real LMS cache.
- Production frontend-to-PostgreSQL composition, durable reflection browsing, arbitrary task CRUD,
  arbitrary availability/window management or manual plan pins.
- LLM features, model provider abstraction in runtime, embeddings, pgvector, RAG, citations or
  course Q&A.
- Lecturer dashboard, privacy-safe aggregation, operations dashboard, telemetry, cost controls,
  backup/retention/deletion policy, load/security testing or deployment hardening.
- Predictive ML, calibrated risk probability, estimate calibration, behavioural adaptation and
  `risk_if_deferred`.

## 13. AI roadmap and guardrails

AI is planned **after** preserving the deterministic loop. Add capabilities as narrow vertical
slices with a test/evaluation plan rather than introducing a general agent framework.

| Priority | Capability | Required boundary before shipping |
|---:|---|---|
| 1 | Natural-language explanation of existing risk/NBA | Input is immutable engine evidence; output cannot alter level/reasons; deterministic template fallback. |
| 2 | Task decomposition suggestions | LLM outputs candidate tasks only; schema validation, student edit/confirmation, provenance and integrity constraints. |
| 3 | Reflection summarisation/candidate proposals | Bounded typed signals, provenance, validation and explicit user confirmation; raw reflection remains private. |
| 4 | Course-material RAG | Authorized ingestion, source-aware chunks, authorization filtering, structural citation validation, abstention and versioned evals. |
| 5 | Integrity classification/redirect | Deterministic pre-checks plus evaluated classifier; never complete graded work or auto-submit it. |
| 6 | Behaviour-aware risk / ML | Only after enough privacy-safe history, defensible labels, calibration method, baseline and fairness/privacy evaluation. |

For RAG, PostgreSQL + pgvector is the initial direction only when ingestion/retrieval exists. A
separate vector DB, Redis, background workers, LangGraph, or multi-agent orchestration requires a
measured workload/stateful orchestration need.

## 14. Technical debt, current blockers and recommended next slices

### Current blockers to pilot/production

1. **No real identity or authorization.** Student identity is trusted request data. This blocks
   any real multi-user, lecturer or sensitive-data deployment.
2. **No real HaUI LMS integration.** Import/mock data is useful for pilot flow validation but does
   not prove real-source data quality, authentication, freshness or consent.
3. **The ordinary API/frontend demo is in-memory.** PostgreSQL adapters exist, but normal
   `create_app()` uses memory; there is no production environment composition/startup path and no
   frontend demo seeded against PostgreSQL.
4. **No validated learning outcomes.** Current benchmarks establish deterministic software
   correctness on fictional cases, not usefulness to real students.
5. **No security/operations policy.** Retention/deletion, backup/recovery, logging redaction,
   observability, rate limiting, secrets handling and deployment hardening are absent.

### Important v0 limitations / debt

- Risk's 25% slack threshold and NBA ordering are unvalidated heuristics. They are explainable,
  but must not be described as predictive accuracy.
- Capacity is assignment-specific and must be supplied explicitly for risk. Without it risk is
  correctly `UNKNOWN`.
- Execution duration never changes remaining effort automatically; this is deliberate safety, but
  makes replan input more manual.
- Confirmed reflections are stored but currently do not change schedule placement.
- Planner uses deadline-first allocation only: no goals, task dependencies, preferences, session
  lengths, calendar integration, manual pins or optimization objective.
- Frontend context/replan comparison has development-session limitations; API restart loses
  in-memory demo data.
- Exact-period plan lookup means callers must preserve matching period boundaries.
- PostgreSQL runs synchronously and has not been load-tested. Do not add async infrastructure
  without a concrete bottleneck.
- Documentation contains historical/planned language alongside newer implemented slices. Resolve
  a seeming conflict by checking `README.md`, relevant ADR, implementation and tests; update docs
  in the same change when status materially changes.

### Sensible next work order

1. Define pilot scope/data governance and authentication/authorization boundary before storing
   real student data.
2. Finish a safe pilot data path: import UX/validation, task/window management, PostgreSQL
   composition, migrations and real-database CI coverage.
3. Run the documented pilot protocol and collect privacy-safe behaviour/planning evidence before
   changing risk/ranking heuristics.
4. Add explainable `risk_if_deferred` only with an explicit deferral-capacity scheduling model.
5. Add one bounded AI feature (prefer explanation or candidate task decomposition) with schema,
   fallback, integrity tests and a small versioned evaluation set.
6. Implement RAG only after authorized course-document ingestion and citation/abstention evals
   are ready.
7. Build lecturer aggregates only after role separation, privacy policy and minimal-access design
   are enforceable.

## 15. Safe change workflow for the next engineer

1. Read this file, [CLAUDE.md](CLAUDE.md), [docs/PROJECT.md](docs/PROJECT.md), applicable ADRs
   and the closest test before editing.
2. State whether the request changes a domain invariant, engine policy, persistence contract, HTTP
   schema, UI only, or a planned product boundary.
3. For domain/engine changes: write/update focused unit tests first or alongside the change; keep
   the function pure and inject `now`/policy.
4. For persistence changes: update mapper/model/migration/repository contract tests together;
   test against real PostgreSQL, never silently validate with SQLite.
5. For API changes: preserve stable error envelopes; keep DTO conversion at the boundary; verify
   through integration tests.
6. For frontend changes: call existing API use cases rather than duplicating decision logic; run
   TypeScript/lint/build/Playwright checks appropriate to the change.
7. For an AI feature: define allowed input/output, validation, provenance, fallback, failure mode,
   privacy and an evaluation dataset before adding a provider SDK.
8. Review `git diff`/`git status`, preserve unrelated user changes, then report what was verified
   and what remains unvalidated.

## 16. Reference reading order

1. [README.md](README.md) — current high-level status and setup.
2. [CLAUDE.md](CLAUDE.md) — repository operating rules.
3. [docs/PROJECT.md](docs/PROJECT.md) — product source of truth and planned scope.
4. ADRs [0001](docs/decisions/0001-python-package-and-domain-boundaries.md),
   [0002](docs/decisions/0002-persistence-ownership-and-revisions.md),
   [0003](docs/decisions/0003-http-api-boundary.md), and
   [0004](docs/decisions/0004-postgresql-persistence-and-transactions.md).
5. `apps/api/src/haui_compass/api/dependencies.py` and `api/v1/routes.py` — live composition and
   externally reachable workflows.
6. The core engine files listed in section 6 plus their tests in `apps/api/tests/unit/engines/`.
7. [apps/web/README.md](apps/web/README.md) and `apps/web/tests/workspace.spec.ts` — real UI
   contract and development boundaries.
8. [docs/evaluation/mvp-benchmark-v1.md](docs/evaluation/mvp-benchmark-v1.md) and
   [docs/pilot/academic-import-v1.md](docs/pilot/academic-import-v1.md) — evidence and pilot data
   contract.


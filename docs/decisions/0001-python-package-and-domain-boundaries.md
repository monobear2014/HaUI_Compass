# ADR-0001: Python Package and Domain Boundaries

## Status

Accepted (2026-09-27)

Implementation status: **PLANNED**. This ADR decides structure and rules only. No backend code exists yet, and the existing scaffold folders are not moved by this ADR (see *Migration plan*).

## Context

`docs/PROJECT.md` requires a modular monolith (Next.js + FastAPI + PostgreSQL), deterministic risk/planning/ranking, provider-independent AI and LMS, and reproducible recommendations. `docs/architecture/initial-architecture.md` proposed boundaries but left open (its §5, §13):

1. how `domain/`, `ai/`, `integrations/` at the repository root become importable by `apps/api`;
2. whether `ai/planning` and `ai/risk` belong under `ai/` at all;
3. where ports, time, and `StudentState` live.

The initial scaffold has root-level `domain/`, `ai/{guardrails,memory,orchestration,planning,providers,reflection,retrieval,risk}`, and `integrations/lms/{base,mock}`. Problems with it:

- **`ai/planning` and `ai/risk` contradict PROJECT.md**, which says risk and deadline/capacity/ranking decisions are deterministic and an LLM "should not be the sole calculator". Placing them under `ai/` invites LLM logic into them.
- **`ai/providers`** conflates provider *interfaces* (consumed by AI capabilities) with vendor *adapters* (infrastructure).
- **`ai/memory`**: in this product, "memory" is `StudentState` plus confirmed reflection signals, which are deterministic derivations, not model behaviour.
- **`ai/orchestration`** anticipates stateful multi-step agents that PROJECT.md says need a demonstrated need first.
- Root-level Python packages have no `pyproject.toml`, no import root, and would need `sys.path` tricks or an ad hoc editable install spanning unrelated folders. The FastAPI app is the only consumer of that code.

The IntelliPlan audit showed both the benefit (a pure `intelligence/` package with injected time, tested without Flask) and the failure mode (glue modules importing back into a monolithic app). This ADR keeps the first and structurally prevents the second.

## Decision

1. **All backend Python code lives in one installable package, `haui_compass`, under `apps/api/src/haui_compass/`**, with its own `apps/api/pyproject.toml`. Root-level `domain/`, `ai/`, and `integrations/` are retired (migrated in a later branch).
2. The package is organised in **six layers with inward dependencies**: `domain` ← `engines` ← `application` ← `api`, with `ai` and `infrastructure` as side layers (see *Dependency Direction*).
3. **`domain` and `engines` are separate.** `domain` holds types and invariants; `engines` holds deterministic decision algorithms over those types.
4. **Deterministic logic never lives under `ai/`.** Risk, planning, replanning, next-best-action ranking, and `StudentState` derivation live in `engines/`. `ai/` contains only capabilities that genuinely require a model or model-adjacent computation.
5. **Ports live with their consumer.** There is no global `interfaces/` package.
6. **Time is explicit.** Engines take `now` as a parameter; use cases obtain it from a `Clock` port. Nothing below `application` reads the system clock.
7. **`evals/` stays at the repository root** (outside the deployable package). **Backend tests live in `apps/api/tests/`.**
8. Cross-layer rules are enforced mechanically (import-linter contracts) once the package exists.

## Target Package Structure

```text
apps/
├── api/
│   ├── pyproject.toml
│   ├── src/haui_compass/
│   │   ├── domain/                    # types + invariants. stdlib only.
│   │   │   ├── shared/                # Evidence, ReasonCode, Minutes, DateRange, errors
│   │   │   ├── students/              # Student, StudentState (+ sections)
│   │   │   ├── courses/               # Course, Enrollment
│   │   │   ├── assignments/           # Assignment, SubmissionStatus
│   │   │   ├── tasks/                 # Task, StudySession, progress rules
│   │   │   ├── plans/                 # StudyPlan, PlannedBlock, PlanFeasibility, PlanChange
│   │   │   ├── reflections/           # Reflection, ReflectionSignal (+ validation, bounds)
│   │   │   ├── risk/                  # RiskSignal, RiskLevel, RiskThresholds (config value type)
│   │   │   └── recommendations/       # Recommendation, RecommendationResponse
│   │   │
│   │   ├── engines/                   # deterministic algorithms; depend on domain only
│   │   │   ├── student_state/         # derive StudentState from facts
│   │   │   ├── risk/                  # RiskEngine
│   │   │   ├── planning/              # PlanningEngine (+ feasibility verifier, decomposition templates)
│   │   │   ├── next_best_action/      # NextBestActionEngine
│   │   │   └── replanning/            # ReplanningEngine
│   │   │
│   │   ├── application/               # use cases; orchestration; owns most ports
│   │   │   ├── use_cases/
│   │   │   └── ports/                 # repositories, LMSProvider, Clock, UnitOfWork
│   │   │
│   │   ├── ai/                        # model-requiring capabilities only
│   │   │   ├── ports.py               # LLMProvider, EmbeddingProvider, VectorStore
│   │   │   ├── decomposition/         # LLM assignment → task suggestions (+ validation)
│   │   │   ├── explanation/           # reason codes → phrasing (+ validation, fallback)
│   │   │   ├── reflection/            # summarise reflection, propose candidate signals
│   │   │   ├── retrieval/             # chunking, hybrid ranking, answer + citation validation
│   │   │   └── guardrails/            # academic-integrity classification and redirects
│   │   │
│   │   ├── infrastructure/            # implements ports; only place with vendor/DB SDKs
│   │   │   ├── persistence/           # SQLAlchemy models, repositories, Alembic env
│   │   │   ├── lms/                   # MockLMSProvider (first), later HaUI/Canvas/Moodle
│   │   │   ├── llm/                   # vendor adapters (OpenAI, Anthropic, Gemini, …)
│   │   │   ├── retrieval/             # pgvector store, ingestion
│   │   │   ├── clock.py               # SystemClock
│   │   │   └── telemetry/
│   │   │
│   │   ├── api/                       # FastAPI: HTTP only
│   │   │   ├── v1/                    # routers, request/response schemas (Pydantic)
│   │   │   ├── dependencies.py        # composition root: wires ports → adapters
│   │   │   └── main.py
│   │   │
│   │   └── config/                    # settings (env → typed settings); no logic
│   │
│   ├── migrations/                    # Alembic (versions/)
│   └── tests/
│       ├── unit/{domain,engines,ai,application}/
│       └── integration/{api,persistence,lms}/
└── web/                               # Next.js (own tests)

evals/                                 # AI/retrieval/product quality (repo root, not shipped)
├── datasets/  planning/  rag/  reflection/
packages/shared/                       # generated TS types from OpenAPI only
tests/                                 # reserved for cross-app end-to-end (web + api)
```

Differences from the candidate tree in the task brief:

- Added `domain/shared`, `engines/student_state` (deriving state is deterministic and needed by every other engine), `ai/explanation`, `ai/ports.py`, `infrastructure/{clock,telemetry}`, `api/dependencies.py` (composition root).
- `domain/risk` holds only the *types* (`RiskSignal`, `RiskLevel`, `RiskThresholds`); `engines/risk` holds the algorithm. This avoids two "risk" directories doing the same job.
- Decomposition *templates* (deterministic) live in `engines/planning`; only the LLM path lives in `ai/decomposition`.
- `ai/providers`, `ai/memory`, `ai/orchestration` are **not** carried over.
- Ports are not one directory: repository/LMS/Clock ports sit in `application/ports`, model ports in `ai/ports.py`.

## Dependency Direction

```text
            api ──────────────► infrastructure   (only explicit composition/operational roots)
             │
             ▼
        application ─────────► ai
             │                  │
             ▼                  ▼
          engines ───────────► domain ◄───────── ai
```

Allowed imports (everything else is forbidden):

| Layer | May import |
|---|---|
| `domain` | stdlib and `typing` only |
| `engines` | `domain` |
| `ai` | `domain`, `engines` (types/results only, never to recompute them) |
| `application` | `domain`, `engines`, `ai`, and its own `ports` |
| `infrastructure` | `domain`, `application.ports`, `ai.ports`, vendor/DB SDKs |
| `api` | `application`, `domain` (for response mapping), and `infrastructure` **only** in explicit, bounded composition/operational roots |
| `config` | stdlib and settings library |

Consequences of the rules:

- `domain` must not import FastAPI, SQLAlchemy, PostgreSQL drivers, Redis, any LLM SDK, LangGraph, or LMS APIs. Pydantic is also excluded from `domain`; domain types are frozen stdlib dataclasses / enums. Pydantic is used at trust boundaries (API schemas, validating model output).
- `ai` never imports `application` or `infrastructure`; `infrastructure` implements `ai.ports`.
- `engines` never import `ai`. An engine cannot call a model, by construction.
- Enforcement: import-linter (or equivalent) contracts added with the walking skeleton and run in CI. Adding the tool is a dependency decision to be made at that time.

### Explicit API composition and operational roots

The normal API code does not freely import infrastructure. Wiring application ports to adapters is
limited to named roots with a clear, bounded responsibility. The current implementation lists
these modules explicitly in its import-boundary test:

- `api.dependencies`: default in-memory application composition and normal runtime container.
- `api.postgres_dependencies`: explicit PostgreSQL composition; never selected implicitly.
- `api.demo`: opt-in fictional in-memory scenario composition for the council showcase.
- `api.demo_preflight`: operational presenter tooling that composes/checks the demo and optionally
  probes a fictional provider request only when explicitly requested.

These modules may construct containers and read adapter settings, but they are not reusable
business dependencies. Routes, schemas, domain types, engines and application use cases continue
to depend inward and must not import infrastructure for ordinary behavior.

## Domain Responsibilities

`domain` holds **typed business concepts, value objects, and invariants**; it holds no algorithms that rank or decide.

- Entities/aggregates: `Student`, `Course`, `Enrollment`, `Assignment`, `Task`, `StudySession`, `StudyPlan`, `Reflection`, `Recommendation`.
- Value objects: `Evidence` (source, sample size, confidence, observed_at), `ReasonCode`, `Minutes`, `RiskLevel`, `RiskSignal`, `RiskThresholds`, `ReflectionSignal`, `StudentState`.
- Invariants and small policies: a task's progress is within bounds; valid status transitions; a `ReflectionSignal` has an allowed type and bounded value; a `Recommendation` must carry reason codes and evidence.
- Frozen dataclasses; no I/O, no clock, no randomness.

**Domain vs engine rule of thumb:** if it is a *noun with rules about itself*, it is domain. If it is a *verb that computes a decision from several domain objects*, it is an engine. A one-line invariant does not justify an engine; an engine does not justify a new domain concept.

## Deterministic Engine Responsibilities

Engines are pure functions or stateless classes over domain objects: same inputs (including `now`) → same output, no I/O, no model calls, no globals.

| Engine | Input | Output |
|---|---|---|
| `student_state` | facts (tasks, sessions, availability, confirmed reflection signals, corrections), previous state, `now` | `StudentState` |
| `risk` | `StudentState`, assignments, tasks, `RiskThresholds`, `now` | `RiskSignal` per assignment |
| `planning` | tasks, capacity, risk signals, constraints from `StudentState`, `now` | `StudyPlan` + deferrals + feasibility report |
| `next_best_action` | `StudentState`, assignments, tasks, risk signals, available minutes, dismissals, `now` | ranked `Recommendation`s |
| `replanning` | previous plan, execution facts, confirmed reflection signals, `now` | new `StudyPlan` + `PlanChange` explanations |

Engines return **reason codes and evidence**, not prose. Threshold and weight values are passed in as versioned configuration objects (`RiskThresholds`, ranking weights), not hard-coded across modules, so they can be changed and tested at their boundaries. This ADR does not fix their values.

## Application Layer Responsibilities

Use cases coordinate; they contain no algorithms and no framework or vendor code.

Initial use cases: `SyncAcademicData`, `GetStudentState`, `GenerateDailyRecommendation`, `GenerateWeeklyPlan`, `RecordTaskProgress`, `SubmitReflection`, `ConfirmReflectionSignals`, `ReplanWeek`, `AskCourseQuestion`, `GetCourseRiskOverview`.

A use case: authorises the caller and applies privacy rules → loads data through repository ports → obtains `now` from `Clock` → calls engines → optionally calls an `ai` capability → persists results and decision traces through a unit of work → returns a domain result (not an HTTP or ORM object).

It must **not** contain SQL/ORM code, FastAPI types, or raw LLM SDK calls.

## AI Layer Responsibilities

`ai/` holds only what genuinely requires a model, or the model-adjacent machinery around it. It is **not** a dumping ground.

Belongs in `ai/`:

- `decomposition`: LLM suggestions turning an assignment into candidate tasks, with schema validation.
- `explanation`: turning engine reason codes into natural language, with validation and a deterministic fallback.
- `reflection`: summarising a reflection and proposing *candidate* `ReflectionSignal`s (validation and bounds are domain rules; confirmation is an application step).
- `retrieval`: chunking, hybrid ranking, answer composition from retrieved passages, **structural citation validation**, abstention.
- `guardrails`: academic-integrity classification and redirect responses (deterministic pre-checks plus optional model classifier, with versioned test cases).
- `ports.py`: `LLMProvider`, `EmbeddingProvider`, `VectorStore`.

Does **not** belong in `ai/`:

- Risk, planning, replanning, ranking, capacity, deadline math, `StudentState` derivation. Those are `engines/`.
- Vendor SDK code. That is `infrastructure/llm`.
- Database access, LMS access.
- Agent frameworks or multi-agent orchestration until a stateful-orchestration need is demonstrated (PROJECT.md).

**Boundary rules:**

- `RiskEngine ≠ AI`, `PlanningEngine ≠ AI`, `NextBestActionEngine ≠ AI`. A deterministic component stays deterministic even when an LLM phrases its output.
- The flow is `RiskEngine → RiskSignal(reason_codes, evidence)` and then, optionally, `ExplanationGenerator → text`. The explanation receives the signal and may not alter level, score, or reason codes. Output is validated against the signal (unknown codes dropped); on failure a deterministic template built from the codes is used.
- AI output that could change durable state (decomposed tasks, reflection signals) is a *candidate* that passes domain validation and, where PROJECT.md requires, student confirmation before becoming a fact.

## Infrastructure Responsibilities

Implements ports; the only layer allowed to import SQLAlchemy, DB drivers, vendor LLM/embedding SDKs, HTTP clients for LMSs, and pgvector.

- `persistence`: SQLAlchemy models (separate from domain types), repositories, unit of work, Alembic migrations.
- `lms`: `MockLMSProvider` first; later `HaUILMSProvider`, `CanvasProvider`, `MoodleProvider`. Credentials/OAuth live here, not in the port.
- `llm`: vendor adapters behind `LLMProvider`/`EmbeddingProvider`, with timeouts, retries/fallback, usage recording, kill switch.
- `retrieval`: pgvector `VectorStore` and document ingestion.
- `clock.py`, `telemetry/`.

Persistence models are mapped to/from domain types explicitly; ORM classes never leak into `domain`, `engines`, or `application`.

## Ports and Interfaces

Rule: **a port is defined in the layer that consumes it**, as a `typing.Protocol` (or ABC where behaviour is shared), and implemented in `infrastructure`.

| Port | Defined in | Consumed by |
|---|---|---|
| `StudentRepository`, `CourseRepository`, `AssignmentRepository`, `TaskRepository`, `PlanRepository`, `ReflectionRepository`, `RecommendationRepository`, `StudentStateRepository` | `application/ports` | use cases |
| `UnitOfWork` | `application/ports` | use cases |
| `LMSProvider` | `application/ports` | `SyncAcademicData` |
| `Clock` | `application/ports` | use cases |
| `LLMProvider`, `EmbeddingProvider`, `VectorStore` | `ai/ports.py` | `ai` capabilities |

Why not a single `interfaces/` directory: it would be a layer every other layer imports, obscuring who depends on what and inviting cycles. Consumer-owned ports keep the dependency arrow visible.

`LMSProvider` initial contract (narrow, read-only, authentication excluded):

```text
get_courses(student_ref)                      -> list[CourseRecord]
get_assignments(course_ref)                   -> list[AssignmentRecord]
get_submission_status(assignment_ref, student_ref) -> SubmissionRecord | None
```

Records are immutable, normalised, and carry `provider`, `external_id`, and `fetched_at`. Enrollments may be added when a use case needs them. Not over-designed: no OAuth, no writes, no pagination abstraction until a real provider needs them.

`LLMProvider` expresses a capability, not a vendor: bounded messages and an optional output schema in; text or parsed result plus usage and model id out.

## StudentState Ownership

- **Concept:** `StudentState` is a **derived, immutable, versioned snapshot** (a value object with identity `snapshot_id`), not a mutable entity and not a JSON bag.
- **Location:** type in `domain/students`; derivation in `engines/student_state`; persistence via `StudentStateRepository`; orchestration by use cases.
- **Facts vs derived:** *facts* are persisted as their own records: tasks, progress, study sessions, stated availability, confirmed reflection signals, student corrections. *Derived* values are recomputed by the `student_state` engine from facts and a previous snapshot. A snapshot is persisted **when something depends on it** (a `Recommendation` or `RiskSignal` records the `snapshot_id` it used) so decisions stay reproducible.
- **Typed sections**, each field carrying `Evidence` where it is inferred:
  - `capacity`: weekly available minutes, remaining this week (facts + arithmetic).
  - `progress`: per-assignment remaining estimated minutes, completion.
  - `behaviour`: estimate ratio, plan adherence, late-submission tendency (Evidence, sample counts).
  - `learning`: difficult topics (Evidence; source = reflection or assessment).
  - `preferences`: e.g. preferred session length (Evidence; source = reflection or stated).
  - `risk_summary`: aggregate of current `RiskSignal`s.
  - `corrections`: student overrides, source `STATED`, respected by the engine.
- **Slice 1 scope:** only `capacity`, `progress`, and `risk_summary`; other sections are added as their slices arrive. Adding a section is an additive, typed change.
- **Not decided here:** physical storage form (typed columns vs a schema-validated document), retention, and snapshot compaction. These belong to the persistence design; the domain type must stay typed regardless.

## Risk Engine Placement

`engines/risk`, with types in `domain/risk`. Deterministic and transparent for the MVP.

- Inputs: deadline, remaining estimated effort, available capacity before the deadline, progress, scheduling slack, `now`, `RiskThresholds`.
- Output: `RiskSignal` with `level`, an optional numeric `score` only if justified by the rule set, `reason_codes`, `evidence` (the concrete numbers used), `snapshot_id`, and `thresholds_version`.
- Threshold values are **not** fixed by this ADR. They live in a versioned, explicitly passed `RiskThresholds` value and are tested at each boundary.
- Any LLM use is limited to `ai/explanation` phrasing a finished `RiskSignal`.

## Next Best Action Placement

`engines/next_best_action`, with `Recommendation` in `domain/recommendations`.

- Consumes structured inputs: `StudentState`, assignments, tasks, `RiskSignal`s, available minutes, dismissals, `now`.
- Generates candidates, scores them with documented weights (component values returned), ranks, and returns a structured `Recommendation`: `task_id`, `priority`, `estimated_duration`, `reason_codes`, `evidence` (including `snapshot_id` and component values), and `risk_if_deferred` (computed by re-running the `risk` engine with the candidate deferred, not asserted by text).
- Natural-language text is a presentation concern (`ai/explanation` or deterministic templates); it never changes ranking.
- Recommendations and student responses (accepted/dismissed/completed) are persisted by the use case.

## Time Dependency

- Nothing in `domain`, `engines`, or `ai` calls `datetime.now()`, `date.today()`, or reads the clock.
- Engines receive `now: datetime` (timezone-aware; naive datetimes are rejected) as an explicit argument.
- Use cases obtain `now` from the `Clock` port (`SystemClock` in production, `FixedClock` in tests) and pass it down.
- Persist and compute in UTC. Day-boundary logic ("due today", weekly windows) takes an explicit timezone parameter, defaulting to `Asia/Ho_Chi_Minh` for HaUI, so tests can pin both instant and zone.
- Slice 1 acceptance depends on this: a fixed `now` and fixture must yield an identical recommendation on every run.

## Testing Strategy

```text
apps/api/tests/
├── unit/
│   ├── domain/         invariants, value objects (no I/O)
│   ├── engines/        pure engines with FixedClock/now; boundary tests for every threshold
│   ├── ai/             validation, fallbacks, citation checks using fake providers
│   └── application/    use cases with in-memory fakes of ports
└── integration/
    ├── api/            FastAPI routes against a test database
    ├── persistence/    repositories + migrations against PostgreSQL
    └── lms/            provider contract tests (Mock now; real providers later)
tests/                  cross-app end-to-end (web + api), later
evals/                  AI/retrieval/product quality (repo root)
```

- **Tests** verify deterministic software correctness. They run in CI, must be reproducible, and use fake providers; no network or real model calls.
- **Evals** measure AI, retrieval, and product quality (faithfulness, citation correctness, guardrail behaviour, planning usefulness, estimate calibration) against versioned, privacy-safe datasets in `evals/`. They may call real models, are non-deterministic or cost money, report metrics and baselines rather than pass/fail correctness, and run on demand or on a schedule. `evals/` may import `haui_compass`; `haui_compass` never imports `evals/`.
- Frontend tests live with `apps/web`.

## Consequences

### Positive

- One import root and one `pyproject.toml`; no path hacks; API and tests import the same package.
- The dependency rules make IntelliPlan-style back-imports and LLM-in-the-decision-path structurally impossible (and checkable in CI).
- Engines are testable with plain objects and a fixed `now`: Slice 1 needs no database, network, or model.
- Explanation, decomposition, retrieval, and guardrails can be swapped or disabled without touching decisions.
- Consumer-owned ports keep the dependency graph legible.
- StudentState has a single owner, typed sections, and reproducible snapshots.

### Negative

- More layers and mapping code (ORM ↔ domain, domain ↔ API schema) than a flat FastAPI app; some duplication is accepted as the price of isolation.
- `domain` vs `engines` is a judgement call at the margin; the rule of thumb may need case-by-case discussion.
- Import-linter (or similar) is a new tool to adopt and maintain.
- A migration step is required to move the scaffold; until then the repository layout and README describe the old root folders.
- Backend code being under `apps/api/src/` makes any future second consumer (e.g. a worker) share the package via installation rather than a shared root import.

## Alternatives Considered

1. **Keep root-level `domain/`, `ai/`, `integrations/`.** Mirrors the logical scaffold and keeps folders short, but the code has no import root or `pyproject.toml`, and `apps/api` would depend on sibling directories through path configuration or an editable install spanning unrelated folders. Ownership is unclear (who packages `ai/`?), and it encourages multiple loosely coupled packages that a single-deployable modular monolith does not need. **Rejected.**
2. **Put most backend code under `apps/api/src/haui_compass`.** One package, one dependency graph, one test root, standard `src/` layout that avoids accidental imports from the working directory, and a clean boundary with `apps/web`. **Chosen.**
3. **Put planning/risk inside `ai/`.** Matches the scaffold as drawn, but blurs "deterministic" and "model-driven", contradicts PROJECT.md's rule that an LLM must not be the sole calculator of risk, and makes it easy for prompts to creep into thresholds and ranking. It also makes the "no LLM in the decision path" property impossible to enforce with import rules. **Rejected.**
4. **Keep deterministic engines outside `ai/`.** Makes the deterministic core importable by tests without any AI dependency and lets an import rule guarantee `engines` never reaches a model. **Chosen.**
5. **Merge `engines` into `domain`** (single "domain" with services). Fewer directories, but domain would then hold both types and decision algorithms and the "domain depends on nothing" rule would need exceptions. Rejected to keep types stable and algorithms replaceable; revisit if the split proves to be ceremony.
6. **One global `interfaces/` package for all ports.** Simple to find, but decouples ports from consumers and invites cyclic imports. Rejected in favour of consumer-owned ports.

## Migration plan (not performed by this ADR)

To be done on a later refactor/chore branch, before or as part of the walking skeleton. Existing scaffold folders contain only `.gitkeep` files, so the move is mechanical.

| Current scaffold | Destination |
|---|---|
| `domain/{students,courses,assignments,tasks,plans,reflections,recommendations}` | `apps/api/src/haui_compass/domain/<same>` |
| *(new)* | `domain/{risk,shared}`, `engines/*`, `application/*`, `infrastructure/*`, `api/*`, `config/` |
| `ai/planning` | **Removed.** Deterministic planning → `engines/planning`; LLM decomposition → `ai/decomposition` |
| `ai/risk` | **Removed.** Risk algorithm → `engines/risk`; types → `domain/risk`; phrasing → `ai/explanation` |
| `ai/providers` | **Split.** Interfaces → `ai/ports.py`; vendor adapters → `infrastructure/llm` |
| `ai/memory` | **Removed.** Memory = `StudentState` (`engines/student_state`) + confirmed reflection signals (`domain/reflections`) |
| `ai/orchestration` | **Removed** until a stateful-orchestration need is demonstrated |
| `ai/retrieval` | `ai/retrieval` (pipeline) + `infrastructure/retrieval` (pgvector, ingestion) |
| `ai/reflection` | `ai/reflection` |
| `ai/guardrails` | `ai/guardrails` |
| `integrations/lms/base` | `application/ports` (`LMSProvider`) |
| `integrations/lms/mock` | `infrastructure/lms` (`MockLMSProvider`) |
| `evals/*` | stays at repository root |
| `tests/` | stays, reserved for cross-app end-to-end; backend tests move to `apps/api/tests` |
| `packages/shared` | stays (generated TS types from OpenAPI) |
| `README.md` "Repository structure" | update when the migration lands |

## Follow-up

- Refactor branch performing the migration above.
- Walking-skeleton branch: `pyproject.toml`, Python version pin, lint/type/test tooling, import-linter contracts.
- ADR needed later: authentication approach, StudentState persistence form, Risk v0 thresholds/versioning, pgvector introduction.

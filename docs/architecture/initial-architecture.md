# Initial Architecture Proposal

- **Status:** PROPOSED — not an ADR, not accepted, nothing here is implemented.
- **Date:** 2026-09-27
- **Inputs:** [`docs/PROJECT.md`](../PROJECT.md) (source of truth), [`docs/research/intelliplan-audit.md`](../research/intelliplan-audit.md)
- **Update 2026-09-27:** [ADR-0001](../decisions/0001-python-package-and-domain-boundaries.md) is accepted and supersedes this proposal's package layout, scaffold mapping (§5), and open items 1–2 in §13. Where they differ, the ADR wins; the rest of this document remains a proposal.
- **Implementation status:** Every component below is **PLANNED**. The repository currently contains documentation and an empty scaffold only.

This proposal describes how HaUI Compass could be structured after studying IntelliPlan. It keeps PROJECT.md's direction (Next.js + FastAPI modular monolith, PostgreSQL, provider-independent AI and LMS) and adds concrete boundaries. Decisions that deserve an ADR are listed in §13.

---

## 1. Design goals

1. Answer **"What should this student do next, and why?"** reproducibly.
2. Keep deterministic decisions (deadlines, capacity, progress, risk thresholds, ranking) in pure, framework-free code.
3. Make `StudentState` the single owner of derived learning signals.
4. Close the loop: execution **and structured reflection** change the next plan.
5. Put LLMs at the edges: phrasing, decomposition assistance, reflection summarisation, grounded Q&A — each validated and replaceable.
6. Keep LMS and LLM vendors behind narrow interfaces.
7. Privacy and integrity enforced at boundaries, not in prompts alone.

### Lessons taken from IntelliPlan (concepts only)

| Adopt | Avoid |
|---|---|
| Pure engine package: no clock/env/DB/LLM inside; `today`/`now` injected (`intelliplan/intelligence/__init__.py`) | God-file app (`App.py`), glue modules importing the app |
| Frozen dataclass inputs/outputs; stable reason codes with one label table | Dict-shaped contracts and two normalisation layers |
| Evidence/provenance on every estimate (`Evidence`, `EvidenceSource`) | Implicit student model scattered across services |
| Composition roots with injected providers (`services/next_action.py`) | Dual scheduling paths behind feature flags |
| LLM as validated narrator with deterministic fallback (`reasoning.py`) | LLM choosing schedules; tutor giving final answers |
| Privacy-preserving decision audit (`models/scheduler_decisions.py`) | Boot-time DDL, lazily created tables, silent `except Exception` |
| Stability cost when replanning; overrides applied literally with consequences | Unvalidated prompt-level citations |

---

## 2. System context

```text
 Student / Lecturer (browser)
          │  HTTPS, JSON
          ▼
 ┌───────────────────────┐        ┌──────────────────────────┐
 │ apps/web  (Next.js,TS)│ ─────► │ apps/api  (FastAPI)      │
 │ UI, no business rules │  REST  │ HTTP, auth, validation   │
 └───────────────────────┘        └────────────┬─────────────┘
                                               │ calls use cases
                                   ┌───────────▼────────────┐
                                   │ Application layer      │  use cases / workflows,
                                   │ (transactions, authz)  │  composition roots
                                   └───┬───────────────┬────┘
                          pure calls   │               │ ports (interfaces)
                   ┌───────────────────▼──┐     ┌──────▼───────────────────────┐
                   │ Domain + Engines     │     │ Infrastructure adapters      │
                   │ (pure Python)        │     │ PostgreSQL repos · LLM ·     │
                   │ entities, StudentState│    │ LMS · vector retrieval ·     │
                   │ Planning · Risk · NBA │    │ clock · telemetry            │
                   └──────────────────────┘     └──────────────────────────────┘
```

Dependencies point **inward**: web → API → application → domain. Infrastructure implements interfaces (ports) declared by the application/domain. The domain imports nothing from FastAPI, SQLAlchemy, LLM SDKs, or LMS SDKs.

---

## 3. Layers and responsibilities

### Web (`apps/web`)

Next.js + TypeScript. Renders state and recommendations returned by the API; collects input (availability, progress, reflection answers). **No ranking, risk, or deadline logic in the frontend** — the UI displays `reasons` and `deferral_risk` returned by the API. Types are generated from the API's OpenAPI schema (see §10).

### API (`apps/api`)

FastAPI routers: authentication, request/response models (Pydantic), role checks, mapping errors to HTTP. Thin: each route calls one application use case.

### Application layer

Use cases such as `SyncAcademicData`, `GetNextBestAction`, `BuildWeeklyPlan`, `RecordStudySession`, `SubmitReflection`, `ConfirmReflectionSignals`, `Replan`, `AskCourseQuestion`, `GetCourseRiskOverview`. Responsibilities: load data through repositories, build `StudentState`, call pure engines, persist results and decision traces, enforce authorization and privacy rules, call AI ports where the use case needs language capability.

### Domain layer (pure)

Entities and value objects from PROJECT.md's conceptual model: `Student`, `Course`, `Enrollment`, `Assignment`, `Task`, `StudyPlan`, `StudySession`, `Reflection`, `ReflectionSignal`, `StudentState`, `RiskSignal`, `Recommendation`, plus value types such as `Evidence` (source, sample size, confidence, observed_at), `ReasonCode`, `Minutes`, `Capacity`.

### Engines (pure, deterministic)

Stateless functions over domain types, `now` injected:

| Engine | Input | Output |
|---|---|---|
| `state` | assignments, tasks, sessions, availability, confirmed reflection signals, previous state | `StudentState` snapshot |
| `risk` | `StudentState`, assignments/tasks, `now` | `RiskSignal` per assignment (level, reason codes, evidence) |
| `planning` | tasks, capacity, risk, constraints from state | `StudyPlan` + deferrals + feasibility report |
| `nba` | state, risk, plan, available minutes, dismissals, `now` | ranked `Recommendation`s with components, reasons, deferral risk |
| `replanning` | previous plan, execution, confirmed reflection signals | new plan + change explanations |

### Infrastructure

PostgreSQL repositories (SQLAlchemy + Alembic migrations), LLM provider adapters, LMS provider adapters, retrieval store (pgvector when introduced), clock, telemetry.

---

## 4. Key questions answered

### What belongs in domain logic?

Everything that must be reproducible and testable without a network: entity invariants (task status transitions, progress bounds), capacity arithmetic, deadline math, estimate calibration, risk thresholds, plan feasibility, NBA scoring and ranking, replanning rules, reflection-signal validation (types, ranges, bounds), privacy classification of fields.

### What belongs in AI logic?

Only tasks needing language or judgement, each producing **candidate** output that the application validates:

- decomposition *suggestions* for assignments without a matching template;
- natural-language phrasing of an already-computed recommendation or risk (reason codes in, sentence out, validated, deterministic fallback);
- summarising a reflection and proposing candidate signals (student confirms);
- grounded course Q&A over retrieved passages, with citation validation;
- integrity classification of tutor requests (with deterministic rules first and a test set).

### Which components remain deterministic?

Risk Engine, Planning, NBA ranking, capacity, calibration, StudentState derivation, replanning rules, citation *validation*, authorization, lecturer aggregation. LLMs may explain these; they never compute them.

### Where does StudentState live?

`StudentState` is a **domain aggregate** owned by a `students`/`state` module. It is **derived**, not hand-edited: the `state` engine rebuilds it from facts (tasks, sessions, availability, confirmed reflection signals). Proposed shape (illustrative, not final):

```text
StudentState (snapshot_id, student_id, computed_at, version)
├── capacity:    weekly_available_minutes, remaining_this_week, per-day windows
├── progress:    per-assignment remaining_estimated_minutes, percent_done
├── behaviour:   estimate_ratio (Evidence), plan_adherence (Evidence), late_tendency (Evidence)
├── learning:    difficult_topics[] (Evidence, source = reflection | assessment)
├── preferences: preferred_session_minutes (Evidence, source = reflection | stated)
└── corrections: student overrides with timestamps
```

Snapshots are persisted so each `Recommendation` and `RiskSignal` can reference the `snapshot_id` it was computed from (reproducibility). Students can view and correct fields; a correction is a fact with source `STATED` that the engine respects.

#### StudentState v0 (IMPLEMENTED)

**StudentState v0 is a derived snapshot of the student's current academic execution state.** It is a typed, immutable result computed by a pure engine from explicit facts. Code: `domain/students/state.py` (types) and `engines/student_state/derive.py` (`derive_student_state(student_id, tasks, available_capacity, now)`).

| Part | Contents |
|---|---|
| Identity and time | `student_id`, `as_of` (timezone-aware, UTC), `schema_version` (shape version, currently 1; not a snapshot id) |
| `capacity` | `available` and `committed` (estimated effort of tasks not completed); derived `remaining` and `overcommitted_by`, so over-commitment is reported, never clamped away |
| `progress` | counts of tasks not started / in progress / completed; derived `total`, `remaining`, and `completion_ratio` (`None` when there are no tasks) |

Scope in v0: the engine describes exactly the tasks and capacity it is given; choosing the tasks and the period is the caller's job until planning exists. Tasks in progress count at their full estimate because partial progress is not recorded yet.

It is **not** yet: a database record design (persistence, snapshot ids), a behavioural or ML profile, reflection memory, or a risk prediction. The illustrative `behaviour`, `learning`, `preferences`, `corrections`, and `risk_summary` sections above are still PLANNED and will be added as their slices arrive.

### Where does the Risk Engine live?

A pure `risk` engine in the domain/engines package, called by application use cases. MVP rules are explicit and tabled, e.g. `required_minutes_before_deadline` vs `available_minutes_before_deadline` (after calibration), days to deadline, not-started status, dependency blocking. Output: `RiskSignal(level, reason_codes, evidence, thresholds_version)`. Thresholds live in one versioned config object with tests at each boundary. Simulation-based risk (IntelliPlan `risk.py`) is a later option once calibrated data exists.

#### Risk Engine v0 (IMPLEMENTED)

**Risk Engine v0 is a deterministic, rule-based assessment of how constrained one assignment is.** Question answered: *given the work remaining and the capacity available before this deadline, how constrained is this assignment?* Code: `domain/risk/` (`AssignmentRiskContext`, `RiskPolicy`, `RiskSignal`, `RiskEvidence`) and `engines/risk/assess.py` (`assess_assignment_risk(context, policy)`).

- **Input:** an explicit `AssignmentRiskContext`: `now`, `deadline`, open task count, remaining effort (`None` = not estimated), and `available_capacity_until_deadline` (`None` = unknown). That capacity must be computed for *this deadline's* window; it is not `StudentState.capacity`, which covers a different horizon. The engine fetches nothing.
- **Output:** a `RiskSignal` with a `level` (`LOW` / `MEDIUM` / `HIGH` / `UNKNOWN`), typed `reason_codes`, typed `evidence` (deadline, time until deadline, open tasks, effort, capacity, slack, slack ratio), `as_of`, and `engine_version`. It does not modify `StudentState`.
- **Rules (first match wins):**

| # | Condition | Level | Reason code |
|---|---|---|---|
| 1 | no open tasks | LOW | `NO_REMAINING_WORK` |
| 2 | deadline ≤ now (nothing to do with the time left) | HIGH | `DEADLINE_PASSED` |
| 3 | effort and/or capacity unknown | UNKNOWN | `MISSING_EFFORT_ESTIMATE` / `MISSING_CAPACITY` |
| 4 | capacity is zero, effort > 0 | HIGH | `NO_CAPACITY_BEFORE_DEADLINE` |
| 5 | effort > capacity (slack < 0) | HIGH | `EFFORT_EXCEEDS_CAPACITY` |
| 6 | 0 ≤ slack < 25% of effort | MEDIUM | `LOW_SLACK` |
| 7 | otherwise | LOW | `SUFFICIENT_SLACK` |

  `slack = capacity − effort`. An estimate of zero effort with open tasks is taken literally (LOW).
- **What it is not:** not an ML model, not a calibrated probability of a late submission (no percentages are produced), and not behaviour-aware (it ignores the student's history).
- **Thresholds are unvalidated MVP heuristics.** The 25% slack threshold is an initial engineering policy in `RiskPolicy` (`DEFAULT_RISK_POLICY`, `engine_version` 1), chosen for explainability, not fitted to HaUI data. Validation against real outcomes is required before any accuracy claim (PROJECT.md, *Evaluation Strategy*). Change a threshold only together with a new `engine_version`.
- **Consumption:** `NextBestActionEngine` (PLANNED) will take `RiskSignal`s as input; nothing consumes them yet. An LLM may later phrase a signal but must not change it.

### Where does Next Best Action live?

A pure `nba` engine: **generate** candidates (next task of highest-risk assignment, continue in-progress task, short task fitting the available gap, review a difficult topic, break) → **score** with a documented weighted objective (each component returned) → **rank** → attach `reasons` (top reason codes), `deferral_risk` (the risk level/change if skipped today, computed by re-running `risk` with the candidate deferred), and `evidence` (snapshot id, component values). The application persists the `Recommendation` and the student's response (accepted / dismissed / completed).

### Where does Reflection feed back into planning?

```text
Reflection answers (structured form)
   → [optional LLM] summary + candidate signals
   → validation (schema, bounds, allowed signal types)
   → student confirmation
   → ReflectionSignal facts (source=reflection, reflection_id)
   → state engine → StudentState (preferences, difficult topics, calibration adjustments)
   → planning / replanning read StudentState, not raw reflection text
```

Raw reflection text stays private to the student. Only confirmed, typed signals influence planning; each planning change they cause is surfaced as an explanation ("sessions capped at 45 min — from your reflection on 2026-10-05").

### How is the LMS abstracted?

A narrow, read-oriented port, separate from authentication:

```text
LMSProvider (port)
  list_courses(student_ref)            -> [CourseRecord]
  list_enrollments(student_ref)        -> [EnrollmentRecord]
  list_assignments(course_ref)         -> [AssignmentRecord]
  get_submission_status(assignment_ref, student_ref) -> SubmissionRecord | None
```

Records are normalised and immutable with `provider`, `external_id`, and `fetched_at`. A `SyncAcademicData` use case upserts them into HaUI tables with sync provenance. `MockLMSProvider` reads fixture data; `HaUILMSProvider`, `CanvasProvider`, `MoodleProvider` are later adapters. Credentials/OAuth live in the adapter, not in the port (unlike IntelliPlan's `LMSProvider`).

### How are LLM providers abstracted?

A small port expressing *capabilities*, not vendors:

```text
LLMClient (port)
  complete(messages, schema=None, limits) -> LLMResult(text | parsed, usage, model_id)
EmbeddingClient (port)
  embed(texts) -> vectors, model_id
```

Adapters per vendor live in `infrastructure/llm` (ports in `ai/ports.py`, per ADR-0001). Cross-cutting concerns wrap the port: budget/rate limits, kill switch, timeouts, retries/fallback chain, usage recording, redaction. Each AI use (explain, decompose, reflect, answer) is a function that builds a bounded input, calls the port, **validates** the output against a schema/allow-list, and falls back deterministically where a fallback exists.

### Where does RAG fit?

A supporting `retrieval` module used only by the `AskCourseQuestion` use case (and later, optionally, by tutoring). Flow: authorized document ingestion → source-aware chunking → embeddings → pgvector (when introduced) with `course_id`/visibility filters → hybrid retrieval → answer constrained to passages → **structural citations** (`{document_id, chunk_id, locator}`) validated against retrieved ids → abstain when evidence is insufficient. RAG does not feed StudentState except through explicit, non-private signals (e.g. question topic counts, if approved).

### How does the frontend communicate with the backend?

JSON over HTTPS to versioned REST endpoints (`/api/v1/...`). FastAPI publishes OpenAPI; the web app generates TypeScript types from it. Authentication via HTTP-only session cookie or bearer token (ADR). No direct DB access from the web app; no business rules in React components. Server-side rendering calls the same API.

---

## 5. Module map (proposed)

```text
Web (apps/web)
│
API (apps/api)
│
Application layer (use cases)
│
Domain layer
├── Student            ── Enrollment
├── Course
├── Assignment
├── Task
├── StudyPlan          ── StudySession
├── StudentState
├── Reflection         ── ReflectionSignal
├── RiskSignal
└── Recommendation
│
Engines / services
├── Planning        (deterministic)
├── Risk            (deterministic)
├── NextBestAction  (deterministic)
├── Reflection      (deterministic validation; AI assists summarising)
├── Retrieval       (infrastructure-heavy; AI for answers)
└── Memory          (= StudentState derivation + confirmed signals)
│
Infrastructure
├── PostgreSQL (SQLAlchemy, Alembic)
├── LLM providers
├── LMS providers (Mock first)
└── Vector retrieval (pgvector when justified)
```

### Mapping onto the current scaffold

**Superseded by ADR-0001.** Backend code lives in a single package under `apps/api/src/haui_compass/`; deterministic engines live in `engines/`, not `ai/`; `ai/planning`, `ai/risk`, `ai/memory`, and `ai/orchestration` are removed and `ai/providers` is split into ports and infrastructure adapters. See the ADR's *Target Package Structure* and *Migration plan*. The scaffold folders themselves have not been moved yet.

---

## 6. Data model direction (not a schema)

PostgreSQL, SQLAlchemy 2.x, Alembic migrations from the first table. Principles:

- Facts (assignments, tasks, sessions, reflection answers, confirmed signals) are stored; derived values (StudentState, risk, recommendations) are stored as **snapshots** referencing their inputs and engine/threshold version.
- Provider-sourced rows keep `provider`, `external_id`, `synced_at`.
- Private data (reflection free text, conversations) in separate tables with explicit access policies.
- Audit tables for recommendations and plan versions avoid duplicating assignment content (IntelliPlan `scheduler_decisions` idea).

---

## 7. Privacy and roles

- Roles: `student`, `lecturer`, later `admin`. Authorization in application use cases, not only in routes.
- Lecturer data is produced by an aggregation use case that reads only non-private fields and enforces a minimum group size before showing distributions.
- Reflection free text, tutor conversations, and StudentState behavioural fields are student-private by default.
- Logs and telemetry use ids and counts, not content.

---

## 8. Academic integrity

A policy module (`ai/guardrails`) with: explicit request categories (explain, plan, practice, review-own-draft vs complete-graded-work), deterministic pre-checks, optional LLM classifier behind the provider port, redirect responses, and a versioned test set in `evals/`. Integrity checks run in the application layer before any tutor/Q&A generation. IntelliPlan's tutor prompt policy (`chatbot_api.py:937`) is explicitly **not** adopted.

---

## 9. Observability

From Slice 1: structured logs with request id, per-use-case latency, error counts. Decision traces: every `Recommendation`/`RiskSignal` stores snapshot id, component values, reason codes, engine and threshold versions. From the first LLM use: model id, tokens, latency, cost, validation failures, fallback count — without prompt/response content by default.

---

## 10. API style

- REST, JSON, `/api/v1`, Pydantic schemas, OpenAPI → generated TS types in `packages/shared` or `apps/web`.
- Example Slice 1 endpoints: `POST /api/v1/sync` (mock), `GET /api/v1/courses`, `GET /api/v1/assignments`, `GET /api/v1/state`, `GET /api/v1/risk`, `GET /api/v1/next-action`, `POST /api/v1/next-action/{id}/response`.

---

## 11. First vertical slice (PLANNED — not implemented)

**Goal:** prove the domain architecture end to end without any LLM.

```text
MockLMSProvider (fixture: 2–3 courses, ~8 assignments, varied deadlines/estimates)
   ↓ SyncAcademicData
Course + Assignment (+ one default Task per Assignment)
   ↓
StudentState v0 (capacity from a stated weekly availability; remaining minutes; progress)
   ↓
Risk Engine v0 (deterministic: slack = available_before_deadline − remaining; thresholds → low/medium/high/overdue; reason codes)
   ↓
Next Best Action v0 (candidates = open tasks; score = documented weights over risk, urgency, fit-to-gap, in-progress; returns reasons + deferral_risk + evidence)
   ↓
FastAPI endpoints
   ↓
Next.js page: "Today" — one recommended action with Why now / Risk if deferred, plus the risk list
```

**Includes:** walking skeleton (Next.js, FastAPI, PostgreSQL via local Docker), Alembic, OpenAPI types, unit tests for engines with injected `now`, one API integration test, one UI smoke test, fixture data.

**Excludes:** authentication beyond a single seeded student (or minimal dev auth — decision needed), planning, sessions, reflection, LLMs, RAG, lecturer views.

**Done when:** given the fixture and a fixed `now`, the API returns the same recommendation every time; changing availability or marking progress changes risk and the recommendation in the documented way; tests cover each risk threshold boundary and NBA tie-breaking.

---

## 12. Later slices (PLANNED)

| Slice | Scope | Key proof |
|---|---|---|
| 2. Weekly planning | Weekly goal, availability windows, greedy capacity-aware planner (EDF by risk), feasibility verifier, template decomposition; AI decomposition suggestions optional | Plans are feasible or report overload explicitly |
| 3. Execution tracking | `StudySession`, progress updates, plan-vs-actual, calibration ratio in StudentState | Actual execution changes state and risk |
| 4. Structured reflection | Weekly form, typed `ReflectionSignal`s, optional LLM summary with validation, student confirmation | Signals are bounded, attributable, private |
| 5. Adaptive replanning | Next plan uses execution + confirmed reflection signals; stability cost; change explanations | Plan changes are explained, no silent churn |
| 6. Course RAG + citations | Ingestion, chunking, pgvector, authz filters, validated citations, abstention; integrity guardrails | Citation correctness and abstention measured |
| 7. Lecturer risk dashboard | Course aggregates, minimum group size, intervention signals | No private content exposed |
| 8. Evaluation + observability | Datasets and baselines for planning, NBA usefulness, RAG, guardrails; latency/cost dashboards | Metrics defined and reproducible |

---

## 13. Decisions needing ADRs (not yet made)

1. ~~Python packaging layout~~ — decided in ADR-0001.
2. ~~`ai/planning` and `ai/risk` placement~~ — decided in ADR-0001 (removed; deterministic engines live in `engines/`).
3. Authentication approach for the MVP (dev-only seeded user vs real auth in Slice 1).
4. Session cookie vs bearer token between Next.js and FastAPI.
5. Risk Engine v0 thresholds and their versioning.
6. StudentState persistence: snapshot table vs recompute-on-read with cached snapshots.
7. When to introduce pgvector (Slice 6) and the embedding provider.

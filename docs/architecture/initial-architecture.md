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

> **Superseded in part by the implemented v0 (below).** v0 uses an ordered comparison instead of the weighted objective described here, ranks only tasks (no break or review candidates), and does not implement `risk_if_deferred`. The paragraph below is the original proposal.

A pure `nba` engine: **generate** candidates (next task of highest-risk assignment, continue in-progress task, short task fitting the available gap, review a difficult topic, break) → **score** with a documented weighted objective (each component returned) → **rank** → attach `reasons` (top reason codes), `deferral_risk` (the risk level/change if skipped today, computed by re-running `risk` with the candidate deferred), and `evidence` (snapshot id, component values). The application persists the `Recommendation` and the student's response (accepted / dismissed / completed).

#### Next Best Action v0 (IMPLEMENTED)

**NextBestActionEngine v0 chooses the single task a student should do next using an ordered comparison, not a score.** It is deterministic and rule-ordered: no weighted numeric score, no learned ranking, no calibrated behaviour model, and no LLM. Code: `domain/recommendations/` (`ActionCandidate`, `RecommendationPolicy`, `Recommendation`, `NoRecommendation`) and `engines/next_best_action/recommend.py` (`recommend_next_action(candidates, now, policy)`).

- **Input:** explicit `ActionCandidate`s (a `Task`, its `Assignment`, and that assignment's `RiskSignal`) plus `now`. The engine fetches nothing and does not re-assess risk. It does not consume `StudentState`: with this ordering nothing in it affects the choice, and capacity already reaches the ranking through the risk signal.
- **Eligibility:** completed tasks are never recommended. No eligible task gives a typed `NoRecommendation(NO_ACTIONABLE_TASKS)`, not an error.
- **Ranking order** (each step matters only when all earlier steps tie):

| # | Step | Rule |
|---|---|---|
| 1 | Assignment risk tier | HIGH, then MEDIUM, then LOW |
| 2 | Deadline | earlier assignment deadline first (overdue is simply earliest) |
| 3 | Status | in-progress before not-started |
| 4 | Stable tie-break | lower assignment id, then lower task id |

- **`UNKNOWN` risk** (not enough evidence to assess) is never ranked as safe. For ordering only, it takes the tier named in `RecommendationPolicy.unknown_risk_treated_as` (default MEDIUM: it ranks with MEDIUM, so the deadline decides between them, and below known HIGH). The recommendation still reports the risk as `UNKNOWN`.
- **Output:** a `Recommendation` with typed `reason_codes` (`HIGH/MEDIUM/UNKNOWN_ASSIGNMENT_RISK`, `EARLIEST_DEADLINE`, `CONTINUE_IN_PROGRESS_TASK`, `ONLY_ACTIONABLE_TASK`, `STABLE_TIE_BREAK`), typed `evidence` (deadline, time until deadline, estimated duration, task status, the risk level and reasons, eligible-candidate count, and the `deciding_dimension` that separated it from the runner-up), `as_of`, and `engine_version`. Any explanation text is derived from these and must not alter them.
- **Determinism:** the result never depends on input order; ties end in the id tie-break.
- **Unvalidated heuristics.** The ordering itself, and putting risk before deadline, are initial product-engineering choices, not evidence-based. Known consequence: a HIGH-risk assignment due far in the future outranks a nearer-deadline MEDIUM or LOW one. Evaluation is required before any claim that the recommendations are useful (PROJECT.md, *Evaluation Strategy*). Changing the ordering or policy values requires a new `engine_version`.
- **Limitation: `risk_if_deferred` is NOT implemented.** The product vision includes it, but the RiskEngine needs `available_capacity_until_deadline`, and the capacity remaining after a deferral cannot be known without a scheduling model. Inferring it would be fabrication, so `Recommendation` has no such field. It is expected to return with planning, as an explicit deferral scenario supplying the changed capacity.
- **Not included:** runner-up alternatives, dismissal handling, task sequencing within an assignment (only in-progress-first plus the id tie-break), and any presentation text.

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

Raw reflection text stays private to the student. Only confirmed, typed signals influence planning; each planning change they cause is surfaced as an explanation ("sessions capped at 45 min — from your reflection on 2026-10-05"). The deterministic left half of this diagram (structured submission through student confirmation) is now implemented without any LLM — see *Structured Reflection v0* below; the `[optional LLM]` summary step and the `state engine → StudentState` consumption step remain PLANNED.

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

#### LMSProvider boundary and MockLMSProvider (IMPLEMENTED)

Code: `application/ports/lms.py` (port, records, `ExternalRef`, `LMSNotFoundError`), `application/lms_mapping.py` (records to domain), `infrastructure/lms/mock.py` and `mock_data.py` (`MockLMSProvider`). The signature sketch above is the original proposal; the implemented port is a refinement, student-scoped like a real LMS view and credential-free:

```text
LMSProvider (port, read-only)
  get_courses(student)                                  -> tuple[LMSCourseRecord, ...]
  get_assignments(student, *, courses=None)             -> tuple[LMSAssignmentRecord, ...]
  get_submission_statuses(student, *, assignments=None) -> tuple[LMSSubmissionRecord, ...]
```

- **Records are boundary types, not domain entities.** They have no raw-payload or `meta` field and no `dict[str, Any]`. Deadlines and submission times are normalised to timezone-aware UTC on construction; naive datetimes are rejected.
- **Identity:** `ExternalRef(provider, id)`. External ids are never assumed to equal domain ids. Domain ids are derived deterministically (`uuid5`) in `lms_mapping`, a stateless v0 strategy that a stored mapping can replace later. This is not an identity-resolution system.
- **Mapping is explicit and honest.** `Course` and `Assignment` are built outside the domain. An assignment with no deadline is reported as *skipped* (`NO_DEADLINE`), never given a made-up one; effort is passed through unchanged, so `None` stays unknown (the RiskEngine then says `UNKNOWN`). Submission state and course codes are not mapped, since the domain has no place for them yet.
- **LMS assignments are not Tasks.** Turning an assignment into action-sized tasks is decomposition/planning, a separate concern. Nothing here generates tasks.
- **Errors:** one `LMSNotFoundError` (unknown student, course, or assignment). Failures are never disguised as empty results.
- **`estimated_effort` is optional planning data that most real LMSs do not provide.** `MockLMSProvider` supplies **synthetic** values so later slices can exercise the risk engine; a real provider returns `None`.
- **`MockLMSProvider` is development and test infrastructure, not a production integration.** It is in-memory and deterministic (no network, files, randomness, or clock) and serves one canonical fictional scenario (two students; three courses, eight assignments across overdue, imminent, mid and far deadlines, unknown effort, an undated assignment, and every submission status), with deadlines relative to an explicit anchor.
- **Contract tests:** `tests/support/lms_contract.py` is provider-agnostic and any provider must pass it.
- **Status of the providers:** `HaUILMSProvider` (PLANNED), `CanvasProvider` (PLANNED), `MoodleProvider` (PLANNED). No real LMS integration, credentials, HTTP layer, or persistence exists.

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

## 11. First vertical slice

#### GenerateDailyRecommendation (IMPLEMENTED, domain layer only)

**The core decision pipeline now runs end to end, without FastAPI, a database, or a UI.** Code: `application/use_cases/daily_recommendation.py` (request/result/errors) and `generate_daily_recommendation.py` (`GenerateDailyRecommendation(lms, clock, risk_policy?, recommendation_policy?).execute(request)`).

```text
LMSProvider.get_assignments(student)
   ↓ application/lms_mapping (existing; undated assignments are reported skipped, not invented)
Assignment (mapped; identity via ExternalRef)
   +
explicit Task tuple (supplied by the caller; NOT generated from assignments)
   +
explicit capacity: general available_capacity, and per-assignment available_until_deadline
   ↓
StudentState            (engines/student_state, unchanged)
   ↓
RiskSignal per assignment that has ≥1 supplied task  (engines/risk, unchanged; capacity not
                                                        supplied for an assignment ⇒ UNKNOWN,
                                                        never borrowed from general capacity)
   ↓
ActionCandidate per open (non-completed) task
   ↓
Recommendation | NoRecommendation  (engines/next_best_action, unchanged)
   ↓
DailyRecommendationResult (as_of, StudentState, per-assignment RiskSignals, the recommendation,
                            skipped LMS assignments)
```

- **Clock discipline:** the use case reads the clock exactly once; that single instant becomes `as_of` and is passed to every engine call, so `DailyRecommendationResult` enforces one shared snapshot instant across `StudentState`, every `RiskSignal`, and the recommendation.
- **Tasks stay explicit input.** Task planning and decomposition do not exist yet, so nothing infers "work on this assignment" tasks from an `Assignment`. A caller (a future planner, a task repository, or a person) supplies `tuple[Task, ...]`; each task must reference an assignment the LMS actually reports for this student, and non-existent, undated, or duplicated references are rejected with a coded `DailyRecommendationInputError`, never silently dropped.
- **Two capacities, never conflated:** `available_capacity` (general, feeds `StudentState`) and `AssignmentCapacity.available_until_deadline` (per assignment, feeds that assignment's `RiskEngine` call). An assignment with tasks but no matching `AssignmentCapacity` gets `UNKNOWN` risk; general capacity is never substituted.
- **LMS submission status is not used in v0.** The domain has no `Submission` entity yet, and whether a submitted assignment's remaining tasks still matter is the task supplier's decision, not this use case's. This is a stated limitation, not an oversight.
- **Port independence:** the use case depends only on `application.ports.lms.LMSProvider` and `application.ports.clock.Clock`; it never imports `haui_compass.infrastructure` or `MockLMSProvider` (checked by a source-text test, in addition to the existing import-boundary tests).
- **No duplicated logic:** risk rules live only in `engines/risk`, ranking only in `engines/next_best_action`; the use case calls them and does not reimplement either.
- **Not yet:** FastAPI routes, persistence, a `TaskRepository`, planning, reflection, RAG, real LMS providers, or natural-language explanation. Those remain the later slices below.

#### Execution Tracking v0 (IMPLEMENTED, domain layer only)

**The loop now extends past the recommendation, into what the student actually did.** Code: `domain/tasks/execution.py` (`TaskExecution`, `ExecutionOutcome`, `TaskExecutionSummary`), `engines/execution/{transitions,summary}.py`, `application/use_cases/record_task_execution.py`.

```text
Recommendation (from GenerateDailyRecommendation)
   ↓ student performs the task
TaskExecution (observed fact: task_id, started_at, ended_at, outcome — PARTIAL or COMPLETED)
   ↓ engines/execution/transitions.apply_task_execution (pure)
Updated Task (immutable; NOT_STARTED/IN_PROGRESS + PARTIAL → IN_PROGRESS; either + COMPLETED →
              COMPLETED; COMPLETED + anything → rejected)
   ↓
derive_student_state(updated tasks, …)   -- unchanged; no progress logic duplicated
   ↓
StudentState reflects the new progress and committed effort
```

- **A fact, not a judgement.** `TaskExecution` records what the student reports happened in one sitting (`actual_duration` is derived from its own timestamps, never a separately stored number that could disagree with them). It is not a plan, an estimate, or a prediction, and it computes no behavioural signal.
- **`TaskExecutionSummary`** (`engines/execution/summary.summarize_task_executions`) is a plain, order-independent aggregate over a task's history — counts and timestamps only. It rejects a history that is logically contradictory (mixed task ids, more than one completion) but does **not** check for overlapping session times or exact duplicate records; both are documented v0 limitations (there is no `ExecutionId` to detect a duplicate by).
- **`RecordTaskExecution`** is orchestration only: it builds the `TaskExecution` from explicit, caller-supplied `started_at`/`ended_at` (never from the `Clock` — an execution describes an observed interval, not "now") and delegates the transition to the engine. There is no `TaskRepository` yet; the caller receives the updated `Task` and holds it.
- **Proven end to end:** an integration test runs a real recommendation, records a `PARTIAL` execution (task stays eligible, becomes `IN_PROGRESS`), then a `COMPLETED` one (task leaves NBA eligibility), all through `GenerateDailyRecommendation` and `derive_student_state` unchanged.
- **Execution history is factual input for future Reflection and Adaptive Planning** (PROJECT.md). This branch does not implement either: no calibration coefficient, no procrastination or productivity inference, no behavioural model is computed from these facts yet — see `docs/research/intelliplan-execution-reference.md` for why that is deferred.
- **StudentState was not changed.** Its progress already derives from `Task` status, so the new loop closes through the existing `derive_student_state`, not a new field.

#### Structured Reflection v0 (IMPLEMENTED, domain layer only)

**The purpose is not a chatbot; it is turning a student's answers into validated, confirmable facts.** Code: `domain/reflections/{reflection,signals}.py` (`Reflection`, `ReflectionPeriod`, `ReflectionResponses`, `WorkloadFeedback`, the four `ReflectionSignal` variants, `CandidateReflectionSignals`, `ConfirmedReflectionSignals`), `engines/reflection/{candidates,confirm}.py`, `application/use_cases/{submit_reflection,confirm_reflection_signals}.py`.

```text
Execution history (TaskExecutionSummary, reused — not re-aggregated)
        +
Student answers (ReflectionResponses: reflected/deferred task ids, workload feedback, topics)
   ↓ SubmitReflection (Clock read once: submitted_at)
Reflection
   ↓ engines/reflection/candidates.generate_candidate_signals (pure)
CandidateReflectionSignals (proposals only)
   ↓ student picks which ones are true
   ↓ ConfirmReflectionSignals (Clock read once: confirmed_at)
   ↓ engines/reflection/confirm.confirm_reflection_signals (pure)
ConfirmedReflectionSignals (student-approved facts; the only reflection output later slices may use)
```

- **Candidate and confirmed are different types, not a flag.** `CandidateReflectionSignals` is a proposal; only `confirm_reflection_signals` can produce a `ConfirmedReflectionSignals`, and only from signals the candidate actually proposed (checked by multiset, so over-selecting the same signal is rejected, not silently accepted). Nothing auto-confirms a model-generated or self-reported conclusion.
- **Facts vs self-report are different signal types, not different values of one field.** `EstimationFeedbackSignal` (a task's own estimate next to the actual duration observed for it, both kept, never collapsed into a ratio) is derived from execution facts already aggregated by `engines/execution/summary.summarize_task_executions` — reused, not duplicated. `WorkloadFeedbackSignal`, `DifficultTopicSignal`, and `DeferredTaskSignal` are self-report only, taken verbatim from `ReflectionResponses`; none of them is inferred from execution history (`docs/research/intelliplan-reflection-reference.md`, which also documents that IntelliPlan has no structured reflection subsystem to draw on here).
- **A closed, small v0 signal set.** No personality profiles, motivation/productivity scores, opaque behavioural scores, or knowledge graphs. `DeferredTaskSignal` is named after the factual student statement ("I put this off"), deliberately not a psychological label like "procrastination", which is never inferred automatically from a late timestamp.
- **Determinism.** `ReflectionResponses` deduplicates and sorts its task-id and topic fields on construction (case-insensitively for topics), so `generate_candidate_signals` produces the same candidate signals regardless of input order or of the iteration order of the task/summary mappings supplied to it.
- **`submitted_at`/`confirmed_at` come from the Clock, read once per use case** — unlike `TaskExecution`'s timestamps, a submission or a confirmation genuinely is "now", not an observed historical interval.
- **Proven end to end:** an integration test builds execution history for a task, submits a reflection referencing it plus self-reported topics and a deferred task, and confirms only some of the resulting candidates — proving the rejected proposal never reaches `ConfirmedReflectionSignals`.
- **Not implemented in this branch:** `StudentState` is unchanged — no reflection field was added to it, and `ConfirmedReflectionSignals` is not yet consumed anywhere. Free-text reflection, an LLM summarizer that proposes candidate signals from prose, and adaptive replanning are all PLANNED (`ai/reflection`, slice 5 below).


---

**Original proposal (superseded in the ways noted above):** prove the domain architecture end to end without any LLM.

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
| 3. Execution tracking | `TaskExecution` fact record and transitions **IMPLEMENTED** (this document, above); `StudySession` persistence, plan-vs-actual reporting, and calibration ratio remain PLANNED | Actual execution changes state (proved); risk/calibration integration is a later step |
| 4. Structured reflection | `Reflection`, typed `ReflectionSignal`s, candidate/confirmed split, and the `SubmitReflection`/`ConfirmReflectionSignals` use cases **IMPLEMENTED** (this document, above); a weekly UI form, free-text reflection, and an LLM summary that proposes candidate signals from prose remain PLANNED | Signals are bounded, attributable, private (proved for the deterministic path; LLM path not built) |
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

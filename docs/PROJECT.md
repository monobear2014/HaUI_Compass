# HaUI Compass

> **Know what to do next.**

**Document status:** Product source of truth

**Project phase:** Technical MVP / council demo system, development-only

**Implementation status:** This document distinguishes **IMPLEMENTED** development/demo
capabilities from **PLANNED** product capabilities. Implemented status does not imply a production
deployment, real HaUI LMS integration, or validated educational outcome.

## Vision

HaUI Compass is a **PLANNED** adaptive AI learning companion for students at Hanoi University of Industry (HaUI). It will help each student continuously understand academic commitments, choose a feasible next action, learn from actual execution, and improve the next plan.

The system is organized around one product question:

> **What should this student do next, and why?**

Its intended differentiator is the combination of student state, academic context, a transparent risk engine, next-best-action recommendations, reflection memory, and adaptive replanning. It may learn from the general category of AI learning companions, but it must not clone another product.

## Problem

Course and assignment lists explain what exists, but not what a particular student should do now. Students must reconcile deadlines, task size, progress, available time, learning difficulty, and previous planning accuracy. Large assignments remain vague, overloaded plans become stale, and repeated estimation or procrastination patterns are rarely fed back into future planning.

HaUI Compass is **PLANNED** to close that gap without replacing the student's own learning or decision-making.

## Target Users

### Student — PLANNED

Students will manage courses, assignments, plans, tasks, study progress, course-grounded questions, reflections, learning history, and their personal learning state.

### Lecturer — PLANNED

Lecturers will see course-level, privacy-conscious aggregates: progress, deadline risk, common difficult topics, and signals that may justify an intervention. They must not receive unnecessary access to private student conversations.

### Administrator — PLANNED, post-core MVP unless required

Administration will remain minimal initially. Potential later responsibilities include user and course configuration, AI usage and cost monitoring, and system configuration.

## Product Principles

1. Recommend an explainable next action, not merely a to-do list.
2. Adapt from observed execution and structured reflection.
3. Keep deterministic decisions deterministic and auditable.
4. Use AI only where it adds meaningful judgment or language capability.
5. Ground course-material answers and make citations traceable.
6. Protect academic integrity and student privacy by design.
7. Start with a focused MVP, a modular monolith, and replaceable external providers.
8. Measure behavior and quality before claiming improvement.

## Core Learning Loop

**PLANNED for the product experience; a bounded development-only implementation is described in
the HTTP Walking Skeleton status below:**

```text
PLAN → DO → MONITOR → REFLECT → ADAPT → PLAN AGAIN
```

## HTTP Walking Skeleton v0

**IMPLEMENTED at the API/application foundation level:** `apps/api` exposes FastAPI under
`/api/v1` with an explicit `create_app(container=...)` factory. It now composes the complete
deterministic learning loop: persisted-task daily recommendation and execution, persisted weekly
plan revision generation/retrieval/history, structured reflection candidate generation plus explicit
server-validated confirmation, and adaptive replanning. Routes are HTTP adapters over application
use cases; student identity is a trusted development request field only. Authentication remains
**PLANNED**. Development-only frontend integration is **IMPLEMENTED** below.

## Frontend Workspace MVP

**IMPLEMENTED, development-only:** `apps/web` provides an independently written
Next.js/TypeScript workspace: Today (next action, rationale, execution recording),
Weekly Plan (grouped study blocks, explicit Generate/Replan, visible unplanned work,
backend-reason before/after comparison), Reflect (structured answers, factual versus
self-reported candidates, explicit confirmation), and History (revision snapshots).
Desktop and mobile share four navigation destinations and our own light visual tokens.

The opt-in `haui_compass.api.demo` entrypoint seeds fictional in-memory tasks and a
plan, and exposes three reproducible showcase scenarios with atomic in-memory reset.
Today separates deterministic decision evidence from a bounded natural-language
explanation. The required offline template provider is implemented behind an
application port; invalid/failed/timed-out optional providers fall back to it.
Normal API startup remains unseeded and exposes no demo routes.
**AI Task Decomposition v0.3 is IMPLEMENTED, development-only:** Academic Data can request one to
five bounded task candidates from an application-owned provider, review/edit/select them, and
explicitly confirm them through the existing task-creation boundary. Candidate sessions are
ephemeral and never enter risk/planning before confirmation. The deterministic offline fallback is
required; timeout, provider exception and invalid output cannot make the demo depend on a vendor.
The current implementation uses only assignment/course fields already present.
**Real LLM Integration v0.4 is IMPLEMENTED, opt-in and development-only:** server composition can
connect both existing language ports to an OpenAI Responses API infrastructure adapter using strict
JSON Schema output. Configuration is disabled by default, secrets remain server-side, and missing
credentials, timeout, HTTP/provider failure, malformed output or authoritative validation failure
return to the existing deterministic fallback. UI provenance distinguishes online model output
from offline templates. Risk, NBA, Planner and Replanner are unchanged and remain deterministic;
confirmed selection remains the only candidate-to-task transition. There is no production AI
operations claim, provider retry policy or model-quality evaluation dataset.
**Demo Evaluation & Council Hardening v0.5 is IMPLEMENTED, development-only:** a canonical,
resettable council runbook covers candidate confirmation, deterministic decision evidence, planning
and adaptation; presenter preflight makes offline readiness explicit. A versioned LLM capability
dataset contains fictional cases only. Its runner is reproducible offline and supports explicitly
opted-in live contract evaluation with non-secret metadata. This is guardrail evidence, not a
claim of general model quality or student outcomes.
The frontend calls existing application use cases through HTTP; it does not duplicate
planning or ranking. Risk may be unknown without assignment capacity. Execution time
does not imply remaining effort; confirmed reflection remains informational in v0.
Production identity, real LMS integration, arbitrary task/window management, durable
reflection browsing and frontend-to-PostgreSQL demo composition remain **PLANNED**.
See [web setup and limitations](../apps/web/README.md).

**PostgreSQL Persistence v0 is IMPLEMENTED:** synchronous SQLAlchemy 2.x,
psycopg, Alembic, typed relational models/adapters, and a small transaction boundary are present.
The default in-memory composition remains available. A real PostgreSQL instance is required to
validate the PostgreSQL contract/concurrency/HTTP tests; no SQLite substitute is used.

Academic data and student state inform a plan. Execution updates actual progress. Structured reflection captures why reality differed from the plan. Useful, bounded signals update student state and influence the next plan.

## Core Features

All features below are **PLANNED**:

- Course, assignment, deadline, and workload management.
- Weekly goals and feasible weekly/daily study plans.
- Production decomposition of large assignments into actionable tasks. The bounded development
  demo flow is implemented above.
- Study-session and task-progress tracking.
- Transparent deadline-risk detection.
- A daily Next Best Action with rationale and skip risk.
- Structured weekly reflection and learning history.
- Adaptive replanning based on execution and reflection.
- Course-material Q&A through grounded RAG with citations.
- Lecturer-facing aggregate progress, risk, and intervention signals.

## Student Experience

**PLANNED:** A student authenticates, imports or receives mock academic data, reviews courses and deadlines, sets a weekly goal, and receives a feasible plan. Each day the system recommends a specific task-sized action with an estimate, deadline context, rationale, and risk if deferred. The student records progress and completes a weekly reflection; the next plan incorporates relevant signals rather than starting from zero.

The experience should retain student agency: recommendations are explainable, editable where appropriate, and never presented as infallible.

## Lecturer Experience

**PLANNED:** A lecturer sees a course dashboard with aggregate progress, approaching deadline risk, common difficult topics, and possible intervention signals. Views should disclose the minimum necessary information and avoid surfacing private conversations or unrelated personal reflection content.

Signals are decision support, not automated grading or a definitive judgment about a student.

## Academic Integrity

**PLANNED policy and guardrails:** HaUI Compass will help students understand concepts, analyze requirements, plan work, practice, review, and improve their own drafts. It must not complete graded work on a student's behalf or automatically submit coursework.

When a request crosses that boundary, the assistant should redirect constructively—for example, offer to explain the prompt, analyze a rubric, build an outline, ask guiding questions, generate analogous practice, or review a student-authored draft. Integrity decisions should be testable and consistently enforced across providers.

## Privacy

**PLANNED:** Collect and retain only the data needed for the learning experience. Separate private student interactions from lecturer-visible aggregates. Enforce role-based authorization at data-access boundaries, minimize sensitive content in logs and telemetry, and define retention/deletion behavior before production use.

Student state and reflections may contain sensitive behavioral inferences. They require explicit access rules, provenance, correction mechanisms, and careful handling in model prompts. Raw private conversations must not automatically become lecturer-visible data.

## Student State

**PLANNED:** `StudentState` is a versioned, explainable representation of useful current learning signals—not a permanent label or an opaque psychological profile. The conceptual dimensions may include:

- **Capacity:** weekly availability and remaining study time.
- **Behavior:** plan adherence, estimate calibration, and late-submission tendency.
- **Learning:** topics where the student reports or demonstrates difficulty.
- **Risk:** current assignment-level risk summaries.
- **Reflection:** actionable patterns such as difficulty starting large tasks or a preferred session length.

The schema is deliberately not fixed yet. Each derived value should eventually have provenance, recency, confidence where relevant, and a clear update rule. Students should be able to inspect and correct important state.

## Risk Engine

**PLANNED:** The first risk engine should use transparent, deterministic rules based on information such as time to deadline, remaining estimated effort, task dependencies, progress, available capacity, and calibrated estimation bias. Thresholds must be explicit and tested.

An LLM may explain an existing risk result in natural language, but it should not be the sole calculator of deadlines, completion, capacity, or risk thresholds. Predictive ML should be considered only when suitable historical data, a defensible target, and an evaluation plan exist.

## Next Best Action

**PLANNED:** A recommendation identifies one concrete action that fits the student's context. A useful recommendation contains:

- course and assignment;
- action-sized task;
- estimated duration;
- deadline or urgency context;
- concise reasons for choosing it now;
- risk if it is deferred; and
- enough evidence to audit the ranking.

The ranking should initially combine deterministic constraints and transparent scoring. AI can help decompose work or explain the recommendation, while the system preserves the inputs and reasoning needed to reproduce the choice.

## Weekly Planning

**IMPLEMENTED at the domain/application foundation level:** Weekly Planner v0 creates an immutable, deterministic `StudyPlan` from explicit `Task` and `Assignment` facts, an explicit UTC `PlanPeriod`, and explicit UTC `StudyWindow`s. It schedules only open tasks, uses each task's stated estimate unchanged, permits effort to span multiple `StudyBlock`s, enforces assignment deadlines, and returns typed remaining `UnplannedTask` effort when capacity is insufficient.

The v0 ordering is transparent: earliest assignment deadline, then `IN_PROGRESS` before `NOT_STARTED` when deadlines tie, then stable assignment/task identifiers. Overlapping or touching input windows are merged before allocation so capacity is never counted twice. The planner uses no LLM, RiskSignal, StudentState, execution history, reflection signal, persistence, LMS access, or wall clock.

**PLANNED:** weekly goals and production UI integration, independent post-plan feasibility reporting, evidence-backed reflection effects, and estimate calibration. Development planning UI is implemented above.

## Reflection

**PLANNED:** Weekly reflection will capture structured answers about estimate errors, postponed tasks, difficult topics, workload realism, and desired changes. The experience should favor a few actionable questions over an open-ended transcript.

AI may summarize a reflection and propose candidate signals, but durable memory updates should be bounded, attributable to their source, and subject to validation or student confirmation where appropriate.

## Adaptive Replanning

**IMPLEMENTED at the domain/application foundation level:** Adaptive Replanning v0 takes an explicit baseline `StudyPlan`, current tasks and assignments, current study windows, explicit remaining effort for every open task, optional execution summaries and confirmed reflections, and an explicit `effective_at`. It freezes past blocks and a block crossing that instant, preserves every valid future block that fits current effort and constraints, and sends only residual work through Weekly Planner v0.

Execution duration never implies remaining work. The full duration of a crossing block reserves explicit remaining effort; callers should normally replan between sessions. Completed tasks lose future work, infeasible effort remains typed and visible, and every actual task-level modification has typed reasons plus before/after evidence. The result also reports objective churn counts/durations rather than an unvalidated stability score. All confirmed reflection signal kinds, including deferred-task signals, are explicitly reported as informational in v0 and cannot silently change placement.

**PLANNED:** production UI integration, manual pins/overrides, independently validated reflection-to-plan actions, estimate calibration, behavioral adaptation, and autonomous triggers. Development replanning UI is implemented above.

## Persistence Foundation

**IMPLEMENTED at the application/infrastructure foundation level:** Persistence Foundation v0 defines narrow application-owned repository protocols and deterministic in-memory adapters for current task state, append-only task executions, confirmed reflection signals, and append-only study-plan revisions with typed adaptive-replanning audit. `StudyPlan` remains persistence-agnostic; `StoredStudyPlan` supplies record identity, revision, parent revision, save time, and the typed `ReplanningResult` where applicable.

LMS remains authoritative for courses, assignments, deadlines, and submission status, so v0 deliberately has no `CourseRepository` or `AssignmentRepository`. Candidate reflection signals are not stored as confirmed facts. Repository timestamps and identifiers are explicit, ordering is deterministic, exact record-ID retries are idempotent, and a sequential stale-baseline guard prevents silently branching a plan history.

The in-memory adapters are development/test infrastructure only: they provide no durability across process restart, transaction spanning repositories, thread/process concurrency guarantee, authorization, database schema, ORM, migration, or production readiness. Ownership and revision decisions are recorded in ADR-0002.

**PLANNED:** retention/deletion rules, authorization, and production operations policy.

## RAG

**Data & Knowledge Corpus v1 is IMPLEMENTED, offline/development-only:** `data/demo` contains
fixed-clock snapshots of the three existing fictional scenarios, student profiles and academic
JSON/CSV artifacts compatible with the current import contract. `data/knowledge/haui` contains
three normalized public HaUI article snapshots with source URLs, collection/publication dates,
temporal limitations and rights notes. `data/knowledge/courses` contains three original fictional
Vietnamese course packs linked to existing demo courses and assignments. A versioned manifest
records identity, provenance and SHA-256; an offline validator checks integrity, source boundaries,
fixture drift and existing academic import schemas. These files are not loaded by the runtime;
course briefs are not supplied to current AI providers, and no engine or business semantics change.
This is a bounded source collection, not a complete set of verified current HaUI regulations.
See [corpus inventory and limitations](../data/README.md).

**PLANNED:** Retrieval-augmented generation is a supporting course-learning capability, not the product's central architecture. The intended flow is document ingestion, source-aware chunking, embedding/indexing, retrieval with authorization filters, answer generation constrained to retrieved evidence, and traceable citations.

Course-material answers must distinguish supported answers from uncertainty. If evidence is missing or conflicting, the assistant should say so instead of hallucinating. Citation correctness, context precision/recall, faithfulness, and answer relevance will require dedicated evaluation datasets.

PostgreSQL with `pgvector` is the initial storage direction. A standalone vector database should be introduced only if measured scale or retrieval requirements justify it.

## LMS Integration Strategy

**PLANNED:** Core business logic will depend on a narrow LMS provider interface rather than vendor-specific APIs. The MVP will use a `MockLMSProvider` and mock/imported academic data. Potential later adapters include `HaUILMSProvider`, `CanvasProvider`, and `MoodleProvider`.

The boundary should normalize courses, enrollments, assignments, deadlines, and permitted submission metadata while preserving source identifiers and synchronization provenance. Production HaUI LMS integration is not required for the first MVP.

## High-Level Architecture

**IMPLEMENTED as a development-only technical MVP:** a modular monolith with explicit internal
module boundaries and separately runnable web/API applications. Production deployment, identity,
authorization, real LMS integration and operational policy remain **PLANNED**.

```text
Next.js + TypeScript web
          │
    FastAPI application
          │
 ┌────────┴─────────────────────────────────────┐
 │ Domain and application modules              │
 │ Students · Courses · Assignments · Tasks    │
 │ Plans · Reflections · Recommendations       │
 ├──────────────────────────────────────────────┤
│ AI capabilities                             │
│ Bounded suggestions/explanations            │
│ Guardrails · OpenAI adapter · provider ports│
 ├──────────────────────────────────────────────┤
 │ Integrations                                │
 │ LMS provider interface → Mock provider      │
 └────────┬─────────────────────────────────────┘
          │
 PostgreSQL (+ pgvector when needed)
```

Redis and asynchronous processing may be introduced later only for a concrete workload. Model roles may eventually include a lightweight router/classifier, a capable planning/reflection model, and an embedding model. Orchestration should begin as simple application workflows; LangGraph or multiple agents require a demonstrated stateful-orchestration need.

The repository scaffold mirrors logical ownership, not independently deployed microservices.

## Domain Model

**PLANNED conceptual model:**

- `User` represents identity and role membership.
- `Student` and `Lecturer` represent role-specific profiles.
- `Course` and `Enrollment` connect people to an academic context.
- `Assignment` captures a deliverable and deadline.
- `Task` is an actionable unit of work, potentially decomposed from an assignment.
- `StudyPlan` schedules intended work; `StudySession` records execution.
- `Submission` records permitted submission status or metadata, not autonomous submission.
- `Reflection` captures structured review inputs and derived candidates.
- `StudentState` holds current, explainable, time-sensitive learning signals.
- `RiskSignal` records evidence and severity for a risk assessment.
- `Recommendation` records a ranked action and its rationale.
- `LearningResource`, `Document`, and `Citation` support grounded learning assistance.
- `Conversation` contains private interaction context with explicit access boundaries.

This is not a finalized database schema. Aggregates, ownership, lifecycle, cardinality, and retention rules must be refined through use cases before migrations are created.

## MVP Scope

Every item is **PLANNED**:

1. Student authentication.
2. Mock/imported academic data through the LMS abstraction.
3. Courses, assignments, and deadlines.
4. Weekly goal and AI-assisted weekly plan.
5. Assignment task decomposition.
6. Daily Next Best Action.
7. Task and progress tracking.
8. Basic, transparent deadline risk.
9. Weekly structured reflection.
10. Adaptive plan for the next week.
11. Course-material RAG with answer citations.
12. Lecturer course dashboard with aggregate progress, risk, and possible intervention signals.

Scope should be delivered as vertical slices so behavior can be validated early rather than building all infrastructure first.

## Non-Goals

The initial phase will not include:

- production HaUI LMS integration;
- payments or a mobile application;
- complex microservices or a large multi-agent swarm;
- autonomous grading or automatic coursework submission;
- unnecessary predictive ML without appropriate data;
- production-scale infrastructure or premature Kubernetes; or
- a standalone vector database without measured justification.

## Evaluation Strategy

Evaluation infrastructure and results are **PLANNED**. No improvement claim should be made without real evidence and a defined baseline.

### Product outcomes

- Task completion and weekly plan completion.
- Plan adherence and reflection completion.
- On-time submission and deadline miss rates.

### Planning quality

- Plan and workload feasibility.
- Deadline feasibility and priority alignment.
- Estimate calibration against actual duration.

### AI and RAG quality

- Faithfulness and answer relevance.
- Context precision and recall.
- Citation correctness.
- Integrity-guardrail behavior.

### Engineering health

- p50 and p95 latency.
- Error rate.
- Token usage and cost per student/week.
- Retrieval and workflow failures.

Evaluation datasets must be versioned, privacy-safe, representative, and separated from ad hoc demos. Metrics need explicit definitions before collection.

## Engineering Principles

- Inspect before changing; preserve user work.
- Implement domain behavior before orchestration complexity.
- Prefer a modular monolith and explicit module interfaces.
- Keep pure domain rules independent of frameworks and model providers.
- Use deterministic calculations for deterministic facts.
- Keep LLM and LMS providers replaceable behind interfaces.
- Validate all external/model outputs at trust boundaries.
- Add tests with behavior changes and use typed contracts where practical.
- Design authorization, privacy, observability, and evaluation from the beginning.
- Avoid unnecessary dependencies and abstractions.
- Record consequential architecture decisions and migration implications.
- Clearly label implementation status and never present a plan as working software.

## Roadmap

### Phase 0 — Foundation — IMPLEMENTED

- Product source-of-truth documentation.
- Persistent working protocol.
- Initial monorepo directory scaffold.
- ADR convention and environment-variable template.

### Phase 1 — Walking skeleton — PLANNED

- Establish minimal Next.js and FastAPI applications.
- Define local development, quality checks, and CI.
- Add PostgreSQL development setup and the first narrow domain slice.
- Validate frontend-to-API-to-database flow without AI complexity.

### Phase 2 — Student planning loop — PLANNED

- Mock LMS data, courses, assignments, tasks, capacity, progress, and weekly plans.
- Deterministic basic risk and first explainable Next Best Action.
- Structured reflection and bounded adaptive replanning.

### Phase 3 — Grounded learning support — PLANNED

- Authorized document ingestion and retrieval.
- Answers with traceable citations, abstention behavior, and RAG evaluations.
- Academic-integrity guardrails and test cases.

### Phase 4 — Lecturer insight and hardening — PLANNED

- Privacy-conscious course aggregates and intervention workflow.
- Observability, cost controls, security review, and broader evaluations.
- Evidence-based decisions about production LMS integration and scaling.

## Definition of Done for MVP

The MVP is done only when all of the following are demonstrated and tested; all are currently **PLANNED**:

- A student can authenticate and work with mock/imported course, assignment, and deadline data.
- The student can set weekly capacity or goals and receive a feasible, inspectable plan.
- A large assignment can be converted into editable, action-sized tasks.
- The system tracks actual progress and calculates basic deadline risk deterministically.
- The student receives a reproducible Next Best Action with a clear rationale and deferral risk.
- A structured weekly reflection creates traceable, bounded inputs to the next plan.
- Replanning responds to actual execution without silently discarding user constraints.
- Course questions are answered from authorized material with correct citations, or the system clearly abstains.
- Academic-integrity scenarios redirect toward legitimate learning support.
- A lecturer can see authorized course-level aggregates without access to private student conversations.
- Core domain rules, authorization boundaries, provider contracts, and critical workflows have automated tests.
- Evaluation datasets and baseline metrics exist for planning, RAG, and guardrail behavior.
- Relevant latency, errors, model usage, and cost can be observed without logging unnecessary sensitive content.
- Setup, architecture, limitations, and `IMPLEMENTED` versus `PLANNED` status are accurately documented.

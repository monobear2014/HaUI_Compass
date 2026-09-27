# HaUI Compass

> **Know what to do next.**

**Document status:** Product source of truth

**Project phase:** Foundation and architecture design

**Implementation status:** Unless explicitly labeled **IMPLEMENTED**, every product capability in this document is **PLANNED**.

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

**PLANNED:**

```text
PLAN → DO → MONITOR → REFLECT → ADAPT → PLAN AGAIN
```

Academic data and student state inform a plan. Execution updates actual progress. Structured reflection captures why reality differed from the plan. Useful, bounded signals update student state and influence the next plan.

## Core Features

All features below are **PLANNED**:

- Course, assignment, deadline, and workload management.
- Weekly goals and feasible weekly/daily study plans.
- Decomposition of large assignments into actionable tasks.
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

**PLANNED:** weekly goals and product UI, persistence, independent post-plan feasibility reporting, reflection-aware planning, estimate calibration, and adaptive replanning of an existing plan.

## Reflection

**PLANNED:** Weekly reflection will capture structured answers about estimate errors, postponed tasks, difficult topics, workload realism, and desired changes. The experience should favor a few actionable questions over an open-ended transcript.

AI may summarize a reflection and propose candidate signals, but durable memory updates should be bounded, attributable to their source, and subject to validation or student confirmation where appropriate.

## Adaptive Replanning

**PLANNED:** Replanning will compare plan versus execution, update relevant estimates and constraints, carry forward unfinished work, and build a feasible next plan. Adaptation must not silently rewrite goals or continuously churn a plan without meaningful new evidence.

The planner should expose why dates, task sizes, or priorities changed and should preserve important user constraints.

## RAG

**PLANNED:** Retrieval-augmented generation is a supporting course-learning capability, not the product's central architecture. The intended flow is document ingestion, source-aware chunking, embedding/indexing, retrieval with authorization filters, answer generation constrained to retrieved evidence, and traceable citations.

Course-material answers must distinguish supported answers from uncertainty. If evidence is missing or conflicting, the assistant should say so instead of hallucinating. Citation correctness, context precision/recall, faithfulness, and answer relevance will require dedicated evaluation datasets.

PostgreSQL with `pgvector` is the initial storage direction. A standalone vector database should be introduced only if measured scale or retrieval requirements justify it.

## LMS Integration Strategy

**PLANNED:** Core business logic will depend on a narrow LMS provider interface rather than vendor-specific APIs. The MVP will use a `MockLMSProvider` and mock/imported academic data. Potential later adapters include `HaUILMSProvider`, `CanvasProvider`, and `MoodleProvider`.

The boundary should normalize courses, enrollments, assignments, deadlines, and permitted submission metadata while preserving source identifiers and synchronization provenance. Production HaUI LMS integration is not required for the first MVP.

## High-Level Architecture

**PLANNED initial direction:** a modular monolith with deployable web and API applications and explicit internal module boundaries.

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
 │ Planning · Retrieval · Reflection · Risk    │
 │ Memory · Guardrails · Provider abstraction  │
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

# HaUI Compass — Council Technical Cheat Sheet v1

**Evidence baseline:** commit `b06ee2d`, verified 2026-10-05.
**Safe opening sentence:** “HaUI Compass is a reproducible, development-only technical demo for
an explainable student planning loop. It does not yet claim deployment or learning outcomes.”

## Architecture in 30 seconds

```text
Next.js workspace → FastAPI API → application use cases → domain + deterministic engines
                                      ↓
                         infrastructure: memory/PostgreSQL, mock LMS, optional LLM adapter
```

- **Modular monolith:** one backend with boundaries, not microservices.
- **Domain:** typed facts and invariants; no framework, database, clock, or model SDK.
- **Engines:** pure deterministic functions; explicit time and inputs.
- **Application:** use cases plus consumer-owned ports.
- **Infrastructure:** adapters for persistence, mock LMS, clock and optional OpenAI Responses API.

## Core engines

| Component | Implemented behavior | Say carefully |
| --- | --- | --- |
| Risk Engine | Rule-ordered level plus reason codes/evidence from deadline, remaining effort, capacity and slack. | Not a predictive probability. |
| Next Best Action | Open tasks ordered by risk, deadline, in-progress status, stable IDs. | No learned ranker or opaque score. |
| Weekly Planner | Deadline-first allocation into explicit study windows; typed unplanned effort. | Does not create time or infer availability. |
| Adaptive Replanner | Preserves valid future blocks, uses explicit remaining effort, returns typed change reasons. | Execution duration does not automatically become remaining effort. |

**25% slack:** transparent, versioned MVP heuristic for low slack. It is **not validated with
student outcomes**.

## AI boundary

- **Implemented capability 1:** assignment facts → bounded candidate task steps.
- **Implemented capability 2:** deterministic recommendation facts → Vietnamese explanation.
- **Confirmation invariant:** provider output → validated ephemeral candidate → student edits/selects
  → existing task-creation use case → durable task.
- **AI cannot:** calculate risk, select NBA, create a plan, replan, or directly persist task facts.
- **Online path:** opt-in OpenAI Responses adapter, strict JSON Schema, server-side secret only.
- **Offline path:** deterministic template fallback; full demo works with no network.

## Key terms

| Term | Meaning in this demo |
| --- | --- |
| Fact | Explicit task, deadline, availability, execution or confirmed reflection data. |
| Candidate | Untrusted proposal, not a durable fact. |
| Decision evidence | Typed reason codes and numbers produced before AI language. |
| Remaining effort | Explicit current student input during replan, not estimate minus duration. |
| Unplanned task | Effort that cannot fit the supplied valid windows. |
| Plan revision | Append-only plan snapshot linked to a parent and typed replan audit. |

## Verified engineering numbers

- **Backend:** 1532 passed; **14 skipped** because no real PostgreSQL test database URL was set.
- **Frontend Playwright:** 20/20 passed.
- **Offline LLM evaluation:** 28/28 fictional cases passed.
  - 20 decomposition cases.
  - 8 recommendation-explanation cases.
- **Quality gates:** Ruff, format check, mypy, TypeScript typecheck, ESLint and production build passed.
- **Live LLM evaluation:** **NOT RUN**. Do not call offline evidence a live-model result.

## Strengths worth emphasizing

- Consequential decisions remain deterministic and inspectable.
- AI boundary is narrow, validated, and has fallback.
- Student confirmation protects durable state.
- Planner keeps insufficient capacity visible.
- Replanner preserves valid work and plan history explains revisions.
- Core behavior has automated regression coverage.

## Limitations to state proactively

- All demo/evaluation data are fictional.
- No real HaUI LMS integration or real student data.
- No authentication, authorization, production deployment, or full privacy governance.
- PostgreSQL adapter exists but was not exercised here without a real database.
- No student-outcome study, heuristic calibration, predictive ML, or live-model evaluation evidence.
- RAG is planned and absent from the demo.

**Why acceptable for this demo:** The milestone demonstrates an architecture and a reproducible
decision loop before collecting real student data or making institutional claims. Those later steps
need approval, governance and empirical evaluation.

## Roadmap to describe

1. Approval and pilot design.
2. Identity, privacy, data governance and retention rules.
3. Narrow HaUI LMS adapter behind the existing port.
4. Real-user pilot with explicit usability and planning metrics.
5. Heuristic calibration from evidence.
6. Authorized course-material RAG with citations and evaluations.
7. Behavior-aware ML only if data, target, baseline and evaluation justify it.

## Safe closing sentence

“The current result is an inspectable foundation: Plan, Execute, Reflect, Adapt, and Plan Again.
The next milestone is evidence from a governed pilot, not a claim that the demo already improves
student outcomes.”

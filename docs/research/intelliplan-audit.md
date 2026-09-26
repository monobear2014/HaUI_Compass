# IntelliPlan Technical Audit

- **Status:** Research document (not an ADR, not a decision)
- **Date:** 2026-09-27
- **Reference:** https://github.com/UAnirudh/IntelliPlan
- **Commit inspected:** `78731438d0bd71524d99ec1bc32b3dfafe1cb75d` (2026-09-26, "feat: turn Foundations into a branching adaptive journey"), shallow clone
- **Local path:** `.references/IntelliPlan/` (git-ignored, read-only)
- **Source of truth for comparison:** [`docs/PROJECT.md`](../PROJECT.md)

All file paths below are relative to the IntelliPlan repository root unless stated otherwise. Status labels used for IntelliPlan capabilities:

- **IMPLEMENTED** — code exists, is wired into the app, and (where noted) has passing tests.
- **PARTIAL** — code exists but is feature-flagged, duplicated by a legacy path, stubbed, or incomplete.
- **DOCUMENTED_ONLY** — described in README/docs but not found in code.
- **NOT_FOUND** — neither code nor meaningful documentation found.

---

## 1. Executive Summary

IntelliPlan is a large, fast-moving student productivity product (Flask, ~20.7k-line `App.py`, 356 routes in that file alone, plus web/Chrome-extension/desktop/mobile clients). Inside it sits a **genuinely high-quality, pure, deterministic scheduling intelligence package** — `intelliplan/intelligence/` — with an optimizer planner, an empirical-Bayes estimate-calibration model, a Bayesian follow-through model, a Monte Carlo deadline-risk simulator, and an explainable Next-Best-Action scorer. Its 376 pure-engine tests pass in under a second using only the Python standard library (verified locally, see §16).

That package is the only part of IntelliPlan that is strongly relevant to HaUI Compass, and even there the value is **conceptual**, not copyable:

1. **License blocks direct reuse.** The README says "MIT — see LICENSE", but **no LICENSE file exists** in the repository and the GitHub API reports `license: null`. Legally, this is "all rights reserved" by default. Direct source reuse (Level C) is not permitted until the author adds a license or grants permission. `adaptive_tutor/` additionally declares itself a port of a *separate* third-party project.
2. **The engines are good; the surrounding app is not a model.** The pure engines are wrapped by glue modules that lazily import from `App.py` (`next_action_glue.py`, `followthrough_glue.py`, `intelliplan/api/roles.py` → `from App import _load_user_assignments`), two parallel normalisation layers, feature-flagged dual paths (`planner_v2` vs LLM scheduling), boot-time DDL instead of migrations, and a very wide non-core feature surface.
3. **IntelliPlan covers roughly half of the HaUI Compass loop.** It implements Academic Data → (implicit) student model → Risk → Next Action → Plan → Execution → Adaptive Replanning. It does **not** implement structured reflection, reflection-driven memory, a first-class StudentState aggregate, academic-integrity enforcement, grounded course RAG with verifiable citations, or privacy-preserving lecturer aggregates. Those are exactly HaUI Compass's differentiators.

**Recommendation:** Treat IntelliPlan as a reference for *algorithms and engineering discipline* (pure engines, injected clock, evidence/provenance on every estimate, reason codes, LLM only as a validated narrator). Implement HaUI Compass independently (Level A/B), starting with simpler, transparent rules; defer IntelliPlan's statistical models until HaUI Compass has real execution data to justify them.

---

## 2. Repository and License

### Repository facts

| Item | Value |
|---|---|
| Created | 2026-03-03 (GitHub API) |
| Last push | 2026-09-26 |
| Tracked files | 686 (excluding `.git`) |
| Language/runtime | Python 3.13 (`Dockerfile`), Flask; vanilla JS + Jinja templates |
| Largest file | `App.py` — 20,712 lines, ~937 KB |
| Deployment | Railway via `Dockerfile` + `Procfile` (gunicorn `App:app`) |
| Committed binaries | `IntelliPlan-Extension-V.{1,2,3}.zip`, `static/IntelliPlan - Google Play package.zip` |

### License verification

| Check | Result |
|---|---|
| `LICENSE`, `LICENSE.*`, `COPYING`, `NOTICE` in tree | **None** (`git ls-files` and `find` both empty) |
| GitHub API `GET /repos/UAnirudh/IntelliPlan` → `license` | **`null`** |
| GitHub API `GET /repos/UAnirudh/IntelliPlan/license` | **HTTP 404** |
| README claim (`README.md:643-645`) | "MIT License — see [LICENSE](LICENSE) for details." — link target does not exist |
| Copyright notice | None found in repository |
| Third-party provenance | `adaptive_tutor/__init__.py`: "A port of the adaptive-ai-tutor architecture"; `adaptive_tutor/store.py`: "Ported from the adaptive-ai-tutor Prisma schema + `student-model.ts`". Upstream project and its license are not identified. `static/js/vendor/gsap/` carries its own vendor README. |

### Implications

- Without a LICENSE file, **no reuse right has been granted**. A README sentence pointing to a non-existent file is, at best, ambiguous evidence of intent and should not be relied on for copying code.
- **Level A (concept) reuse is unaffected**: ideas, algorithms, and published statistical methods (Beta-Binomial shrinkage, empirical Bayes, logistic regression, Monte Carlo simulation, MMR) are not copyrightable.
- **Level C (direct) reuse is blocked** until one of: (a) the author commits a LICENSE file, (b) written permission is obtained, or (c) the author confirms the MIT intent in a verifiable way. Even then, `adaptive_tutor/` needs its own upstream license check.
- If MIT is later confirmed: MIT requires preserving the copyright and permission notice in all copies or substantial portions. See §25.

---

## 3. IntelliPlan Product Scope

IntelliPlan is positioned (README) as an AI study planner for (mostly US high-school and college) students. Actual scope observed in code:

| Domain | Evidence |
|---|---|
| LMS/grade import | `canvas_helper.py`, `canvas_oauth.py`, `studentvue_helper.py`, `schoology_helper.py`, `intelliplan/integrations/lms/{google_classroom,blackboard,moodle,powerschool}.py` |
| Scheduling / planning | `scheduler_engine.py`, `fallback_scheduler.py`, `scheduler_depth.py`, `scheduler_clarify.py`, `intelliplan/intelligence/planner.py`, `intelliplan/services/scheduling.py` |
| Command Center ("Today") | `intelliplan/services/today.py`, `intelliplan/intelligence/{priority,workload,health,narrator}.py`, `command_center_glue.py` |
| Next Best Action | `intelliplan/intelligence/nba.py`, `intelliplan/services/next_action.py`, `intelliplan/api/next_action.py`, `next_action_glue.py` |
| Follow-through / behaviour | `intelliplan/intelligence/{followthrough,behavior}.py`, `followthrough_glue.py` |
| Active study sessions | `intelliplan/api/active.py`, `intelliplan/repositories/active_sessions.py`, `active_glue.py` |
| AI tutor ("Plani") | `chatbot_api.py` (1.6k lines), `plani_agent.py` (1.3k), `adaptive_tutor/` |
| Notes RAG | `intelliplan/retrieval/` |
| Grade prediction / GPA | `intelliplan/services/grade_prediction.py`, `intelliplan/intelligence/predictions.py` |
| Gamification | `streak_engine.py`, `pet_engine.py`, `growth_glue.py`, `intelliplan/growth/` |
| Flashcards / primer / "Foundations" | `flashcards/`, `primer/` |
| Teacher/parent views | `intelliplan/api/roles.py` |
| Study groups / voice | `intelliplan/api/group_tasks.py`, `intelliplan/api/group_voice.py` |
| Calendars / Notion | `google_calendar_helper.py`, `outlook_calendar_helper.py`, `ics_feed.py`, `notion_helper.py` |
| Notifications / email | `intelliplan/notifications/`, `intelliplan/email/`, `notifications_glue.py` |
| Payments / paywall | `stripe` in `requirements.txt`, `static/js/ip-paywall.js`, `ai_firewall.plan_for` |
| Other clients | `extension/` (Chrome), `desktop/`, `mobile/` (Expo), `android-version/` |
| Developer API / MCP | `intelliplan_api.py`, `api_keys.py`, `intelliplan_mcp.py`, `mcp/ollama_mcp.py` |
| Marketing / SEO | `intelliplan.tech-audit/`, sitemap/IndexNow routes in `App.py` |

The product is broad. The planning-intelligence core is a minority of the codebase.

---

## 4. Actual Architecture

```text
Browser (Jinja templates + vanilla JS in static/js)   Chrome ext · desktop · Expo mobile
                 │
          Flask App.py  (≈20.7k lines, 356 routes, ~60 SQLAlchemy models)
                 │  registers blueprints; glue modules lazily `from App import …`
     ┌───────────┼────────────────────────────────────────────────────────┐
     │ legacy helpers (repo root)            │ intelliplan/ package        │
     │ scheduler_engine.py (pure)            │  api/          Flask blueprints
     │ fallback_scheduler.py                 │  services/     composition roots, DI
     │ canvas_helper.py, studentvue_helper…  │  intelligence/ PURE engines (no I/O, no clock, no LLM)
     │ chatbot_api.py, plani_agent.py        │  domain/       frozen dataclasses
     │ ai_provider.py, ai_firewall.py        │  repositories/ SQLAlchemy access
     │ *_glue.py (App ⇄ services)            │  models/       ORM tables (additive)
     │ adaptive_tutor/, flashcards/, primer/ │  retrieval/    per-user notes RAG
     │                                       │  integrations/lms/ typed providers
     └───────────────────────────────────────┴────────────────────────────┘
                 │
     SQLAlchemy → SQLite (dev) / PostgreSQL (prod, psycopg2)
     Boot-time idempotent DDL (`intelliplan/migrations.py`, `db_boot.py`) — no Alembic
```

### Layering quality

- **Strong:** `intelliplan/intelligence/__init__.py` states and the tests enforce three rules — domain dataclasses in/out, no clock/env/DB access (caller passes `today`/`now`), no LLM. `intelliplan/services/next_action.py` and `services/today.py` receive every dependency as an injected callable.
- **Weak:** the application shell. `App.py` defines ~60 ORM models inline (e.g. `UserIdentity`, `TaskFeedback`, `SavedSchedule`, `StudySession`, `StudyMastery`, `StudentLink`), and blueprints reach back into it (`intelliplan/api/roles.py:_summarize_for_view` → `from App import _load_user_assignments`). The project's own `docs/scheduler-audit.md` documents **two parallel normalisation layers** (loose dicts vs typed `Assignment`) feeding different engines.

---

## 5. Core Scheduling System

**Status: IMPLEMENTED (behind a feature flag), with legacy LLM path still present.**

Two-stage design (`intelliplan/services/scheduling.py` docstring):

1. **Day allocation** — `intelliplan/intelligence/planner.py` (`build_plan`, L627). A cost-minimising optimizer over (session → day): greedy seed placing most-constrained work first (`_assign`), local search (`_optimise`), deferred retry, value-based triage (`_triage`), coalescing and renumbering. Deadlines are hard constraints; overload is reported via `Plan.overloaded` / `Plan.deferred` rather than hidden. Weights are one dataclass (`PlannerWeights`, L202). Dependencies between stages are honoured (`_apply_dependencies`, L960).
2. **Clock placement** — `scheduler_engine.place_day_blocks` lays sessions into the student's free windows with breaks; imports nothing from Flask/SQLAlchemy.

Supporting engines:

| Concern | Module | Notes |
|---|---|---|
| Base effort sizing | `intelliplan/intelligence/sizing.py` | Derives minutes from LMS metadata (word counts, pages, problem counts, rubric rows, quiz questions) with documented rate priors; points only as fallback. Parses HTML descriptions (Canvas-oriented). |
| Decomposition | `intelliplan/intelligence/decomposition.py` | **Template-based, not LLM**: research paper / essay / exam / presentation / lab / project / reading templates with ordered, dependent stages and effort shares; explicit "never decompose" list (problem sets, quizzes). |
| Capacity | `intelliplan/services/scheduling.py:usable_minutes` | Discounts window minutes for gaps/breaks (~74%). Availability from `UserIdentity.availability`. |
| Feasibility check | `intelliplan/intelligence/constraints.py:check_schedule` | Post-hoc verifier: overlaps, durations, past-deadline work, capacity, busy calendar, windows, past blocks. Never repairs. |
| Counterfactual plans | `intelliplan/intelligence/counterfactual.py` | Builds plans under several named objective profiles and measures each on the same axes (academic benefit, learning benefit, deadline risk, stress). |
| Priority | `intelliplan/intelligence/priority.py` | 0..100 = urgency (≤40, piecewise by days-to-due) + importance (≤25) + grade impact (≤20) + effort (≤10) + dependency (≤5); each emits a `ReasonChip`. |
| 7-day workload | `intelliplan/intelligence/workload.py` | Committed + prework vs availability → per-day stress. |

**Wiring:** `App.py:generate_schedule` (L10798) uses the optimizer only when `feature_enabled("planner_v2")`; otherwise an LLM path (`ai_chat_json`) with a deterministic `fallback_scheduler.py` when AI is unavailable. So scheduling is dual-path.

---

## 6. Adaptive Scheduling

**Status: IMPLEMENTED.** Design docs: `docs/adaptive-scheduler/01-architecture-audit.md`, `02-implementation.md`, `03-follow-through-engine.md`.

| Mechanism | Module | What it does |
|---|---|---|
| Replan from reality | `intelliplan/intelligence/planner.py:reschedule` (L1506), `Reality` (L1491) | Rebuilds from what actually happened. |
| Intent-based repair | `intelliplan/intelligence/rescheduling.py:replan` (L841) | "I'm sick tomorrow"-style intents (`parse_disruption`). Existing sittings become **anchors** priced by `_stability_cost`, so the plan is repaired, not rebuilt. Solves literally *and* rebalanced, simulates both, reports the difference (`diff_plans`, `_sitting_churn`). |
| Autopilot | `intelliplan/intelligence/autopilot.py` | Detects missed work, new LMS work, due-date changes; acts with explanation, one-tap undo, per-plan off switch, cooldowns. |
| Overrides with consequences | `intelliplan/intelligence/overrides.py` | Applies a student override *literally*, then reports signed gains/costs (`ConsequenceReport`). Never blocks. |
| Risk-controlled buffers | `intelliplan/intelligence/robust.py:plan_with_risk_control` | plan → simulate → add buffer to at-risk work → re-plan, kept only if measurably better on common random numbers. |
| Audit trail | `intelliplan/models/scheduler_decisions.py` | `schedule_versions` (every plan shown + why it changed) and `schedule_decisions` (every NBA recommendation/override + reason codes + whether accepted). Stores no titles/grades. |

This is IntelliPlan's strongest area and the closest overlap with HaUI Compass's "Adaptive Replanning". The key difference: IntelliPlan adapts from **execution and explicit intents**, never from **reflection** (§13).

---

## 7. Student Modeling

**Status: IMPLEMENTED as several implicit models; no first-class StudentState aggregate.**

| Model | Module | Method |
|---|---|---|
| Estimate calibration | `intelliplan/intelligence/estimation.py` | Multiplicative bias in log space, `ln(actual/estimated)`, hierarchically pooled global → course → (course, kind), shrinkage by effective sample count, 45-day recency half-life, ±ln(4) clamp; returns uncertainty that the planner spends as buffer. |
| Completion behaviour | `intelliplan/intelligence/behavior.py` | Beta-Binomial per slice (course, time-of-day) shrunk toward "everything else" (parent minus child to avoid double counting). Produces `BehaviorProfile` (completion/abandon/reschedule rates, best slot, stamina, workload tolerance). |
| Follow-through | `intelliplan/intelligence/followthrough.py` | Bayesian (MAP) logistic regression via Newton's method with Gaussian prior; features for slot, weekday, length, urgency, load, course. Includes `evaluate_holdout` (out-of-time evaluation against a baseline) and `fit_population_prior`. |
| Mastery | `intelliplan/domain/student.py:MasteryEstimate`, `intelliplan/services/learning_graph.py`, `intelliplan/repositories/concept_mastery.py`, `adaptive_tutor/store.py` | Per-concept mastery with confidence and sources; separate mastery store in the tutor. |
| Provenance | `intelliplan/domain/student.py:Evidence`, `EvidenceSource` | Every estimate carries `MEASURED` / `PARTIAL` / `POPULATION` / `STATED` + decay-weighted sample count + confidence. |
| Profile | `intelliplan/repositories/student_profile.py`, `adaptive_tutor/store.py` (`adaptive_student_profile`, `adaptive_learner_memory`) | Onboarding answers; LLM-built "durable learner memory" for the tutor. |

The evidence/provenance pattern maps almost exactly onto PROJECT.md's requirement that StudentState values have "provenance, recency, confidence where relevant, and a clear update rule". However, there is **no single versioned StudentState object**: models are rebuilt ad hoc by each service from raw history, and mastery exists in at least two places (learning graph vs `adaptive_tutor`).

---

## 8. Next Action

**Status: IMPLEMENTED.** `intelliplan/intelligence/nba.py`, service `intelliplan/services/next_action.py`, API `intelliplan/api/next_action.py`, UI `static/js/next_action.js`, glue `next_action_glue.py`.

- **Generation** (`generate`, L218) is deliberately heterogeneous: `ActionKind` = start/continue task, study/review concept, practice, exam prep, admin, **break**, **defer** (`intelliplan/domain/student.py`).
- **Scoring** (`score`, L373) is one linear objective with `NBAWeights` (deadline 1.60, academic value 1.00, mastery gap 0.85, completion 0.90, schedule fit 0.70, learning gain 0.60, continuity 0.35; costs: stress 0.75, time 0.30, context switch 0.30). Per-component contributions are returned on `NextAction.components`.
- **Explanation**: stable reason codes with a single label table (`REASON_LABELS`, e.g. `due_tomorrow`, `low_mastery`, `fits_the_gap`, `your_best_time`), ranked by `_rank_reasons`. `NextAction.explanation` = "why now" lines.
- **Student agency**: `_honour_dismissals` drops what the student already declined today; decisions logged to `schedule_decisions`.
- **LLM boundary**: `intelliplan/intelligence/reasoning.py` lets a model *phrase* an already-made decision, sees only reason codes and rounded values, output is validated (`_validate`) and unknown codes dropped, deterministic fallback on any failure.

**Missing vs HaUI requirement:** no explicit "risk if deferred" field on the recommendation (deadline pressure is an input, not a stated consequence of skipping), and no StudentState snapshot id to reproduce the ranking later.

---

## 9. LMS Integrations

**Status: PARTIAL — two coexisting integration styles.**

- **Typed abstraction** — `intelliplan/integrations/lms/base.py`: `LMSCourse`, `LMSAssignment` (frozen dataclasses with provider-namespaced `external_id`), abstract `LMSProvider` (OAuth: `get_authorize_url`, `exchange_code`, `refresh_tokens`; data: `list_courses`, `list_assignments`, `sync_all`), and `StubProvider`. `registry.py` maps keys to instances. Providers: `google_classroom.py`, `blackboard.py`, `moodle.py`, `powerschool.py`.
- **Legacy helpers** — `canvas_helper.py` (573 lines), `canvas_oauth.py`, `canvas_routes.py`, `studentvue_helper.py`, `schoology_helper.py`. Canvas is **not** behind `LMSProvider`; it "mirrors the surface area of studentvue_helper" so `App.py` routes treat sources uniformly via dicts.
- **Sync safety** — `intelliplan/sync/idempotency.py` (offline replay ledger), `tests/test_sync_idempotency.py`, `tests/test_lms_cache.py`.

Assessment: the `base.py` contract is reasonable but **OAuth-shaped** (tokens are part of every call) and lacks enrollments, submission metadata, and sync provenance. HaUI Compass needs a narrower, auth-agnostic read contract that a `MockLMSProvider` can satisfy trivially.

---

## 10. AI Architecture

**Status: IMPLEMENTED, but not provider-independent in the HaUI sense.**

- `ai_provider.py` (951 lines): module-level functions (`chat`, `chat_json`, `vision`, `speak`, `transcribe_audio`) walking a model chain — Gemini primary, Groq fallback, optional Claude for paid tier (`_claude_chat`). Plan-tier routing and allowance charging via `set_account_hooks`. Typed errors (`AIQuotaExhausted`, `AIAllowanceExceeded`, `AIUnavailable`, `AITruncatedError`). Vendor-specific code lives inside the same module; there is no provider interface class.
- `ai_firewall.py`: DB-backed per-account/guest rate limits and daily token budgets, signed guest cookies, `screen_prompt` cheap checks, global kill switch (`kill_switch_on`), `usage_snapshot`. Good cost-control reference.
- **LLM usage points:** narrator briefing (`intelliplan/intelligence/narrator.py`), NBA explanation (`reasoning.py`), LLM schedule path in `App.py` (non-`planner_v2`), tutor (`chatbot_api.py`, `plani_agent.py`), tutor memory analysis (`adaptive_tutor/analysis.py`), insights (`insight_glue.py`, `intelliplan/insight/`), several `ai_chat_json` sites in `App.py` (e.g. L5327, L5436, L19059, L19570–19679).
- **Deterministic by design:** everything in `intelliplan/intelligence/` except `narrator.py` / `reasoning.py`, which are DI'd and have templated fallbacks.
- **Tool agent:** `plani_agent.py` exposes app actions to the model; `intelliplan_mcp.py` / `mcp/ollama_mcp.py` expose MCP servers. `OLLAMA.md` / `local_ai_server.py` for local models.

---

## 11. Retrieval / RAG

**Status: PARTIAL relative to HaUI requirements (implemented for personal notes, not for course material).**

- Scope: **per-user notes only** (`intelliplan/retrieval/__init__.py`: "Per-user semantic retrieval over the student's own notes"). No course-document ingestion, no lecturer-uploaded material, no authorization model beyond user id.
- Pipeline: `chunking.py` (sentence-aligned overlapping passages) → `embeddings.py` (local hashed lexical embedder + optional Gemini dense embeddings) → `models.py` (`memory_chunks`, vectors as float32 blobs) → `index.py` (content-hash incremental sync, hybrid `0.7·dense + 0.3·lexical`, MMR re-ranking) → `retrieve_context`.
- **No pgvector** — explicitly rejected as unnecessary at per-user scale (brute-force numpy).
- **Citations are prompt-level only**: `index.py:retrieve_context` numbers passages `[1]…` and *asks* the model to cite them. Nothing validates that returned citations exist, match, or support the claim; the answer is not structurally linked to sources. No abstention logic beyond the instruction.
- `retrieve_context` swallows all errors and returns `""`, so a retrieval failure silently yields an ungrounded answer.

---

## 12. Execution Tracking

**Status: IMPLEMENTED.**

- Active study sessions: `intelliplan/api/active.py`, `intelliplan/models/active_session.py`, `intelliplan/repositories/active_sessions.py`, `static/js/ip-active.js`; sittings mirror into `TaskFeedback` (App model) which feeds estimation.
- Plan checkbox progress: `SavedSchedule.progress_json` (App model); `followthrough.harvest_plan_outcomes` (L1169) labels every past block as done/not-done → follow-through training data.
- NBA acceptance/override logging: `schedule_decisions`.
- Per-student signals: `intelliplan/repositories/signals.py` (append-only `student_signals`), `intelliplan/insight/events.py`, `analytics.py` (PostHog).

This is a strong reference for the **Actual Execution** node of the HaUI loop.

---

## 13. Reflection

**Status: NOT_FOUND.**

`grep -i reflect` across non-test Python finds only the word "reflection" as an assignment-type keyword (`intelliplan/intelligence/sizing.py:115`, `decomposition.py:148`, `App.py:3407`) and one tutor prompt phrase (`adaptive_tutor/analysis.py:34`). There is no weekly reflection flow, no structured reflection schema, and no path by which a student's own account of *why* reality differed from the plan changes future planning.

The closest analogues are:

- `rescheduling.py` disruption intents (a student states a constraint, not a reflection);
- `adaptive_tutor/store.py` `adaptive_session_summary` / `adaptive_learner_memory` (LLM-written summaries of tutor chats — unstructured, not planning inputs);
- `followthrough.py` `Insight` objects (things the *model* learned, not things the student reported).

This is the single largest gap and HaUI Compass's clearest differentiator.

---

## 14. Academic Integrity

**Status: NOT_FOUND (and the tutor policy points the other way).**

- No integrity module, classifier, or guardrail tests were found.
- The tutor system prompt in `chatbot_api.py` explicitly instructs the model to produce final answers: L933 "box the final answer with **Answer:**"; L937 "'Just give me the answer' is not an off-ramp. Give the final answer in one line, then give the one-paragraph why."
- `chatbot_api.py:941` does forbid fabricating citations and facts — a useful honesty rule but not an integrity rule.
- `ai_firewall.py:screen_prompt` is cost/abuse screening, not integrity.

HaUI Compass must **not** inherit the tutor prompt policy.

---

## 15. Lecturer / Admin Capabilities

**Status: PARTIAL.**

- `intelliplan/api/roles.py`: `role` column (`student` | `teacher` | `parent`) on the user, `StudentLink` table, invite → student accepts → teacher/parent sees `api_student_overview`.
- The view is **per-student, not aggregated**: it returns the student's name, **email**, total/completed/overdue counts, **average grade percent**, and up to 10 upcoming assignment titles (`_summarize_for_view`).
- Consent-gated (good: link must be accepted), and it does not expose tutor conversations (good).
- No course-level aggregates, difficult-topic signals, risk distribution, intervention workflow, or minimum-cohort-size protection.
- Implementation reaches into `App.py` (`from App import _load_user_assignments`) inside a bare `except Exception` that silently returns empty data.
- Admin: scattered admin-only routes in `App.py` (e.g. IndexNow, email admin); no admin module.

---

## 16. Observability and Evaluation

**Observability — IMPLEMENTED (product-analytics oriented):** Sentry (`App.py:146`, `sentry_sdk.init`), PostHog (`analytics.py`), `ClientErrorLog` and `ProductEvent` models, `AIUsage` model and `ai_firewall.record_tokens`, `schedule_versions`/`schedule_decisions` audit tables, `intelliplan/repositories/schedule_audit.py`. No structured latency/p95 metrics or tracing found.

**Evaluation — PARTIAL:**

- `intelliplan/intelligence/followthrough.py:evaluate_holdout` performs out-of-time evaluation of the follow-through model against a baseline — a genuine model-evaluation primitive.
- `counterfactual.py:measure` scores plans on explicit axes independent of how they were built.
- No RAG evaluation (faithfulness, citation correctness), no guardrail evaluation set, no planning-quality benchmark dataset.

**Tests — IMPLEMENTED and substantial:** 140 files under `tests/` (+ `tests/intelliplan/` 38 files) and root `test_*.py`. CI: `.github/workflows/{main,security,desktop-release}.yml`; `.bandit` config. `docs/scheduler-audit.md` mentions "960 tests green at baseline" (2026-08-16).

**Verified locally for this audit:** the 15 pure-engine test files (`tests/intelliplan/test_{priority,nba,estimation,behavior,planner,risk_and_robust,followthrough,decomposition,constraints,rescheduling,workload,health,sizing,overrides,counterfactual}.py`) — **376 passed in 0.80 s** with `--noconftest`, using the system Python 3.13 and no extra packages. The shared `tests/intelliplan/conftest.py` imports `flask_sqlalchemy`, so these pure tests cannot run through the default conftest without installing the web stack. The full suite was not run (no dependencies installed, by design).

---

## 17. Technical Debt / Risks

| # | Issue | Evidence | Relevance to HaUI |
|---|---|---|---|
| 1 | God-file monolith | `App.py` 20.7k lines, 356 routes, ~60 models | Do not replicate; HaUI uses explicit modules |
| 2 | Glue modules reverse-import the app | `next_action_glue.py`, `followthrough_glue.py`, `command_center_glue.py`, `roles.py` → lazy `from App import …` | Dependencies must point toward domain in HaUI |
| 3 | Dual normalisation layers | `docs/scheduler-audit.md` §1 | HaUI must have one canonical Assignment/Task model |
| 4 | Dual scheduling paths | `planner_v2` flag vs LLM path vs `fallback_scheduler.py` | HaUI: deterministic planner only; LLM assists decomposition/explanation |
| 5 | Dual LMS styles | `canvas_helper.py` vs `intelliplan/integrations/lms/` | HaUI: one provider interface from day one |
| 6 | No migrations tool | `intelliplan/migrations.py` boot-time DDL; "will be replaced by Alembic" | HaUI: Alembic (or equivalent) from the first table |
| 7 | Tables created lazily on first use | `adaptive_tutor/store.py`, `chatbot_api._ensure_tutor_memory_table` | Avoid |
| 8 | Silent error swallowing | `retrieval.retrieve_context`, `roles._summarize_for_view` (`except Exception`) | Grounded answers must fail visibly/abstain |
| 9 | Duplicated behaviour models | `behavior.py` (Beta-Binomial) and `followthrough.py` (logistic) both answer P(done) | Pick one, later, with data |
| 10 | Duplicated mastery stores | `learning_graph` / `concept_mastery` vs `adaptive_tutor` tables | One StudentState owner |
| 11 | Duplicated tutors | `chatbot_api.py`, `plani_agent.py`, `adaptive_tutor/`, session chat | Out of HaUI MVP scope |
| 12 | Committed binaries | three extension zips, Play Store zip | Keep HaUI repo source-only |
| 13 | Unlicensed + ported code | §2 | Blocks Level C reuse |
| 14 | Statistical models tuned for US K-12/college data | population priors (e.g. `POPULATION_COMPLETION_RATE = 0.62`), US LMSs, GPA scale | Priors not transferable to HaUI without data |
| 15 | Integrity policy opposite to HaUI | `chatbot_api.py:937` | Must not be ported |

---

## 18. IntelliPlan vs HaUI Compass

Mapping IntelliPlan onto the HaUI Compass loop from PROJECT.md:

| HaUI loop node | IntelliPlan status | Where |
|---|---|---|
| Academic Data | IMPLEMENTED (many sources, two styles) | §9 |
| Student State | PARTIAL — several implicit models with provenance; no aggregate | §7 |
| Risk Engine | IMPLEMENTED — Monte Carlo on-time probability + health score | `risk.py`, `health.py`, `predictions.py:predict_completion_risk` |
| Next Best Action | IMPLEMENTED — explainable, deterministic | §8 |
| Plan / Execute | IMPLEMENTED — optimizer planner + active sessions | §5, §12 |
| Actual Execution | IMPLEMENTED | §12 |
| Structured Reflection | **NOT_FOUND** | §13 |
| Memory Update | PARTIAL — implicit model refits from execution; LLM tutor memory; nothing reflection-driven | §7 |
| Adaptive Replanning | IMPLEMENTED — from execution and intents, not reflection | §6 |
| Lecturer HITL | PARTIAL — per-student consent-gated view, no aggregates | §15 |
| Academic integrity | NOT_FOUND / contrary | §14 |
| Grounded course Q&A + citations | PARTIAL — personal notes, prompt-level citations only | §11 |
| Evaluation | PARTIAL — follow-through holdout only | §16 |

**Overlap:** roughly the left half of the loop (data → risk → action → plan → execute → replan). **Difference:** HaUI's reflection → memory → state loop, integrity, grounded course RAG, lecturer aggregates, and evaluation are absent or contrary in IntelliPlan.

**Risk-engine philosophy difference:** PROJECT.md asks for an initially *transparent rule-based* risk engine with explicit thresholds, and warns against predictive ML without data. IntelliPlan's risk is a Monte Carlo simulation over learned distributions — more powerful, but it depends on estimation and follow-through models HaUI will not have data for at launch. It is a strong **later** reference, not a starting point.

---

## 19. KEEP / ADAPT / REWRITE / DROP Matrix

Decision meanings for this document:

- **KEEP_AS_REFERENCE** — study the design/tests later; do not port now.
- **ADAPT** — take the concept/design and re-implement independently in HaUI's architecture (Level A/B).
- **REWRITE** — HaUI needs this capability, but IntelliPlan's approach is unsuitable; design from HaUI requirements.
- **DROP** — out of scope; do not inherit.

No row authorises direct source reuse (Level C); see §2.

| Area | IntelliPlan implementation | HaUI Compass requirement | Decision | Reason |
|---|---|---|---|---|
| Assignment ingestion | Legacy per-source helpers + typed `LMSAssignment`; two normalisation layers (`docs/scheduler-audit.md`) | Normalised courses/enrollments/assignments with source ids and sync provenance | REWRITE | Single canonical model from day one; avoid dual layers |
| LMS abstraction | `intelliplan/integrations/lms/base.py` OAuth-shaped `LMSProvider` + `StubProvider` + registry | Narrow provider interface; `MockLMSProvider` first | ADAPT | Good idea (normalised frozen records, namespaced ids); separate auth from read contract; add enrollments/submissions/provenance |
| Canvas integration | `canvas_helper.py`, `canvas_oauth.py`, outside the abstraction | Possible later `CanvasProvider` | KEEP_AS_REFERENCE | Not MVP; useful field mapping reference when Canvas is actually needed |
| Scheduling | `planner.py` optimizer + `scheduler_engine.place_day_blocks` two-stage | Feasible, inspectable weekly/daily plan | ADAPT | Adopt two-stage split and "overload reported, not hidden"; start with a much simpler greedy EDF + capacity planner; optimizer later if needed |
| Priority scoring | `priority.py`: capped components + `ReasonChip` | Transparent scoring feeding NBA | ADAPT | Pattern fits PROJECT.md exactly; HaUI must define its own components/thresholds for HaUI context |
| Student State | Implicit, spread across `behavior.py`, `estimation.py`, `followthrough.py`, mastery stores; `Evidence` provenance type | First-class, versioned, inspectable, correctable `StudentState` | REWRITE | Keep the `Evidence`/`EvidenceSource` *idea*; HaUI needs one aggregate with snapshots and update rules |
| Capacity model | `usable_minutes` discount; `DayCapacity`; availability windows | Weekly availability, remaining study time | ADAPT | Simple, deterministic, well-reasoned; re-derive own discount |
| Estimate calibration | `estimation.py` log-ratio, hierarchical shrinkage, half-life | Estimate calibration against actual duration | KEEP_AS_REFERENCE | Excellent later model; MVP should start with a simple actual/estimated ratio with sample count, then evolve |
| Risk Engine | `risk.py` Monte Carlo; `robust.py`; `health.py` capped components | Transparent deterministic rules with explicit, tested thresholds | REWRITE | Philosophy mismatch for MVP; `health.py`'s capped-component pattern is the closer model. Monte Carlo = later reference |
| Next Best Action | `nba.py` generate → score → rank, reason codes, dismissals, heterogeneous actions | One action + why now + deferral risk + auditable evidence | ADAPT | Closest match; add explicit `deferral_risk`, StudentState snapshot reference, and HaUI reason codes |
| Adaptive replanning | `rescheduling.py` anchors/stability cost, `autopilot.py`, `overrides.py` | Replan from execution **and reflection**; no silent churn; explain changes | ADAPT | Stability-cost and "literal vs rebalanced" ideas are directly aligned; add reflection inputs |
| Execution tracking | Active sessions, `TaskFeedback`, `harvest_plan_outcomes`, `schedule_decisions` | Study sessions and task progress | ADAPT | Good event model; implement as HaUI `StudySession` + progress events |
| Reflection | Not found | Structured weekly reflection → bounded, attributable signals | REWRITE (new) | HaUI differentiator; nothing to reuse |
| Long-term memory | `adaptive_tutor` LLM learner memory, session summaries | Bounded, attributable, confirmable memory updates | REWRITE | IntelliPlan memory is unstructured LLM text; HaUI requires provenance and validation |
| RAG | Per-user notes, hybrid lexical+dense, MMR, brute force | Course-material RAG, authz filters, pgvector initially | ADAPT | Lexical fallback, content-hash incremental indexing, MMR are worth learning; scope/authz/storage differ |
| Citations | Prompt asks for `[n]`; no validation | Traceable, verified citations; abstention | REWRITE | Must be structural and validated |
| Academic integrity | None; tutor gives final answers | Guide learning, never complete graded work; testable | REWRITE (new) | Contrary policy; do not port tutor prompts |
| Lecturer dashboard | Per-student consent view with email + grade average | Course-level privacy-conscious aggregates | REWRITE | Different data contract; consent idea worth keeping |
| Lecturer HITL | Invite/accept link only | Intervention signals, decision support | REWRITE (new) | Not present |
| Auth | Flask-Login + bcrypt + session cookies; desktop/extension token flows | Student auth; role-based access at data boundaries | REWRITE | Different stack (FastAPI); not a reusable component |
| LLM abstraction | `ai_provider.py` function-level model chain; `ai_firewall.py` budgets | Provider-independent interface; domain never depends on vendor | ADAPT | Adopt: typed errors, fallback chain, kill switch, token budgets, narrator-only boundary with validation; implement as an interface |
| Observability | Sentry, PostHog, audit tables, `AIUsage` | Latency, errors, model usage, cost, decision traces without sensitive content | ADAPT | Decision/version audit tables that avoid storing titles/grades are a strong pattern |
| Evaluation | `evaluate_holdout`, counterfactual `measure` | Planning, RAG, guardrail evaluation datasets and baselines | KEEP_AS_REFERENCE | Holdout-against-baseline idea is valuable; HaUI needs its own datasets |
| Frontend | Jinja + vanilla JS, GSAP, multiple native clients | Next.js + TypeScript | DROP | Incompatible stack and IntelliPlan-specific UI |
| Backend | Flask god-file + blueprints + glue | FastAPI modular monolith | REWRITE | Keep only the `intelligence/` purity discipline as a pattern |
| Database | SQLAlchemy, SQLite/Postgres, boot-time DDL, lazy tables | PostgreSQL + migrations; pgvector when justified | REWRITE | Schema is IntelliPlan-shaped; migrations approach is debt |
| Decomposition | `decomposition.py` templates with dependencies | Assignment → action-sized tasks; AI-assisted | ADAPT | Template-first, LLM-optional is a good default; HaUI templates must fit HaUI assignment types (Vietnamese, engineering labs, projects) |
| Constraint verification | `constraints.py:check_schedule` | Feasible plan guarantee | ADAPT | Independent verifier pattern is cheap and valuable |

---

## 20. Recommended Reuse Strategy

1. **Default to Level A (concept reuse).** Most value is in design principles and algorithms, which can be reimplemented from first principles and published methods.
2. **Use Level B (adapted implementation) for a small set of well-scoped engines** when HaUI reaches the corresponding slice: priority/NBA scoring structure, capacity discounting, stability-cost replanning, constraint verification, decomposition templates. Read the IntelliPlan module and its tests, write a HaUI spec in HaUI terms, implement fresh with HaUI tests.
3. **Level C (direct source reuse) is currently prohibited** by the missing license. Revisit only if the author adds a license and a specific function offers clear value over reimplementation (candidates would be small numeric helpers, not modules).
4. **Borrow test *scenarios*, not test code.** IntelliPlan's pure-engine tests encode useful edge cases (overload, due-date moves, dismissals, zero-history students). Re-express the scenarios in HaUI terms.
5. **Do not import IntelliPlan's statistical priors** (`POPULATION_COMPLETION_RATE`, sizing rates, half-lives) as facts. They were set for a different population. HaUI must label any prior as a starting assumption and replace it with measured data.

Detailed policy: §25 and the reuse levels summarised in the final report.

---

## 21. HaUI Compass Differentiation

HaUI Compass must stay distinct in the areas IntelliPlan does not cover or covers differently:

1. **Structured Reflection Engine** — weekly reflection producing typed, bounded signals (e.g. `planning_accuracy`, `procrastination_patterns`, `weak_topics`, `workload_feedback`, `preferred_session_length`), each with source, confidence, and student confirmation. IntelliPlan has no equivalent.
2. **First-class StudentState** — one versioned aggregate with per-field provenance/recency/confidence and correction; recommendations reference the snapshot they used. IntelliPlan's `Evidence` type is a good seed idea, but its state is implicit and duplicated.
3. **Explainable NBA with explicit deferral risk** — "why now" *and* "what happens if you skip it", reproducible from stored inputs.
4. **Transparent, testable Risk Engine** — explicit thresholds first; simulation only once calibrated data exists.
5. **Reflection-driven replanning** — reflection signals become planner constraints/parameters with visible explanations ("sessions capped at 45 min because you said long sessions don't work").
6. **Lecturer HITL with privacy by design** — course-level aggregates, minimum cohort thresholds, no private conversations or reflections by default.
7. **Academic integrity as an enforced, tested policy** — the opposite of IntelliPlan's tutor stance.
8. **Grounded course Q&A with verified citations and abstention** — course material with authorization filters, structural citation validation.
9. **Evaluation from the start** — defined metrics and baselines before claiming improvement.
10. **HaUI context** — Vietnamese-language UX, HaUI course/assessment structures, and an LMS that is not Canvas.

---

## 22. Recommended Initial Architecture

See [`docs/architecture/initial-architecture.md`](../architecture/initial-architecture.md). In short: a FastAPI modular monolith whose domain and decision engines are pure Python (IntelliPlan's `intelligence/` discipline, without its app shell), a single `StudentState` owner, deterministic Planning/Risk/NBA services, AI behind a provider interface used only for decomposition assistance, explanation phrasing, reflection summarisation, and grounded Q&A, and the LMS behind a narrow read interface with `MockLMSProvider` first.

---

## 23. Recommended Implementation Sequence

1. **Slice 1** — MockLMSProvider → Course/Assignment → StudentState (capacity + progress only) → deterministic Risk → NBA → API → Web. No LLM.
2. **Slice 2** — Weekly planning (greedy, capacity-aware, feasibility verifier).
3. **Slice 3** — Execution tracking (sessions, progress, plan-vs-actual).
4. **Slice 4** — Structured reflection (typed signals, confirmation).
5. **Slice 5** — Adaptive replanning (execution + reflection → next plan, with change explanations and stability).
6. **Slice 6** — Course RAG with verified citations and abstention; integrity guardrails.
7. **Slice 7** — Lecturer risk dashboard (aggregates, privacy thresholds).
8. **Slice 8** — Evaluation + observability hardening.

Details in `docs/architecture/initial-architecture.md` §11–12.

---

## 24. Files / Modules Worth Studying Later

Ordered by the slice where each becomes relevant.

| Slice | File | Why |
|---|---|---|
| 1 | `intelliplan/intelligence/__init__.py` | The purity rules HaUI engines should follow |
| 1 | `intelliplan/domain/student.py` | `Evidence`, `EvidenceSource`, `ActionKind`, `NextAction` shapes |
| 1 | `intelliplan/domain/plan.py` | `ReasonChip`, `PriorityScore`, capped explainable scores |
| 1 | `intelliplan/intelligence/priority.py` | Capped-component scoring with reasons |
| 1 | `intelliplan/intelligence/health.py` | Capped penalties — closest to HaUI's rule-based risk |
| 1 | `intelliplan/intelligence/nba.py` + `tests/intelliplan/test_nba.py` | Generate/score split, reason ranking, dismissals |
| 1 | `intelliplan/services/next_action.py` | Injected-provider composition root |
| 1 | `intelliplan/integrations/lms/base.py` | Normalised LMS records |
| 2 | `intelliplan/services/scheduling.py` (`usable_minutes`) | Honest capacity |
| 2 | `intelliplan/intelligence/constraints.py` | Independent feasibility verifier |
| 2 | `intelliplan/intelligence/decomposition.py` | Template-based stages with dependencies |
| 2 | `intelliplan/intelligence/planner.py` | Cost-function planner (study; do not start here) |
| 3 | `intelliplan/intelligence/followthrough.py:harvest_plan_outcomes` | Labelling plan outcomes |
| 3 | `intelliplan/models/scheduler_decisions.py` | Privacy-preserving decision/version audit |
| 3–5 | `intelliplan/intelligence/estimation.py` | Estimate calibration model (later) |
| 5 | `intelliplan/intelligence/rescheduling.py`, `overrides.py`, `autopilot.py` | Stability cost, literal-vs-rebalanced, consequence reports |
| 5+ | `intelliplan/intelligence/risk.py`, `robust.py` | Monte Carlo risk (only with data) |
| 6 | `intelliplan/retrieval/index.py`, `embeddings.py`, `chunking.py` | Hybrid ranking, MMR, content-hash sync |
| 6 | `intelliplan/intelligence/reasoning.py` | Validated LLM explanation with deterministic fallback |
| 6 | `ai_firewall.py` | Budgets, kill switch, guest identity |
| 8 | `followthrough.py:evaluate_holdout`, `counterfactual.py:measure` | Evaluation against baselines |
| — | `docs/scheduler-audit.md`, `docs/adaptive-scheduler/*.md` | IntelliPlan's own critique of its wiring |

---

## 25. License / Attribution Notes

- **Current status (2026-09-27):** no license granted. README claims MIT; the referenced `LICENSE` file does not exist; GitHub reports no license.
- **Permitted now:** reading, studying, running locally for research, describing designs, and independently implementing ideas and published algorithms (Level A/B).
- **Not permitted now:** copying code, tests, prompts, templates, or substantial structure into HaUI Compass (Level C).
- **If Level C is ever considered:**
  1. Confirm a license file exists upstream at a specific commit, or obtain written permission; record the commit hash.
  2. Check provenance of the specific file (e.g. `adaptive_tutor/` is itself a port; vendored JS has its own license).
  3. Preserve the original copyright and license notice in the copied file header and in a `THIRD_PARTY_NOTICES` file.
  4. Record in a reuse log: HaUI path, IntelliPlan path, upstream URL with commit hash, license, date, reason, modifications.
  5. Prefer a small function over a module; prefer reimplementation when equivalent effort.
- **Level B hygiene:** when implementing from an IntelliPlan reference, write the HaUI spec/tests first in HaUI terms, then implement without copying text; note "design informed by IntelliPlan `<path>`" in the PR description.
- `.references/` is git-ignored; IntelliPlan files are never staged, committed, vendored, or added as a submodule.

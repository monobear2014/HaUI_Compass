# IntelliPlan Risk Engine Reference

- **Status:** Research note (not a decision). Read-only study; no IntelliPlan code or constants were copied.
- **Date:** 2026-09-27
- **Reference:** `.references/IntelliPlan` at commit `78731438d0bd71524d99ec1bc32b3dfafe1cb75d` (git-ignored). Licence caveat: the repository has no LICENSE file, so only concepts may be reused. See [`intelliplan-audit.md`](intelliplan-audit.md) §2.
- **Purpose:** inform the design of HaUI Compass Risk Engine v0 (`domain/risk`, `engines/risk`, [ADR-0001](../decisions/0001-python-package-and-domain-boundaries.md)).

All paths are relative to the IntelliPlan repository root.

## Scope inspected

| Module | What it contains |
|---|---|
| `intelliplan/intelligence/risk.py` | Monte Carlo deadline-risk simulator: `simulate`, `RiskConfig`, `TaskRisk`, `RiskReport` |
| `intelliplan/intelligence/robust.py` | `plan_with_risk_control`: uses the simulator to add buffer days and re-plan |
| `intelliplan/services/scheduling.py` | `SchedulingService.assessor` (L278) builds the deterministic `assess(plan, tasks)` callable that wires `simulate` to the student's fitted models |
| `intelliplan/intelligence/predictions.py` | `predict_completion_risk` (L165): a hand-weighted logistic "completion risk" |
| `intelliplan/intelligence/health.py` | Academic Health Score with capped, named penalties (overdue count, etc.) |
| `intelliplan/intelligence/priority.py`, `nba.py` (`_deadline_pressure`) | Urgency curves as inputs to ranking, not to "risk" as such |
| `intelliplan/intelligence/behavior.py`, `followthrough.py`, `estimation.py` | Learned models that feed the simulator |
| `tests/intelliplan/test_risk_and_robust.py` | Behavioural tests for `simulate` and `plan_with_risk_control` |

## Actual implementation

IntelliPlan uses "risk" for at least three different things:

1. **Plan risk (the main one).** `risk.simulate` takes a *finished plan* (sessions placed on days, per-day capacity, deferred work) and estimates, per assignment, the probability that it finishes on time. Output: `RiskReport` with per-assignment `on_time_probability`, `expected_late_minutes`, a `status` (`on_track` / `watch` / `at_risk`) and a `main_risk` cause (`not_planned`, `follow_through`, `overrun`).
2. **Completion-risk predictor.** `predictions.predict_completion_risk` combines urgency, time-needed versus time-available, history and assignment kind through fixed coefficients and a logistic squash, returning a 0..1 "risk". A search of the repository finds **no callers outside its own module and no tests**, so it appears to be unwired.
3. **Health score.** `health.compute` starts at 100 and subtracts capped penalties (for example, per overdue assignment). Simple, additive, explainable.

## Inputs

`simulate(plan, tasks, today=…, follow_through=…, sigma_for=…, recovery_rate=…, capacity_by_day=…, config=…, seed=…)`:

- a **plan** (sessions by day, per-day `capacity_minutes` / `scheduled_minutes`, deferrals);
- the planner's task list (due dates, priorities);
- callbacks supplying the student's fitted **follow-through probability** per sitting and the **duration spread** (sigma) per task, both normally from learned models;
- a `RiskConfig` of population-level constants used when nothing better is supplied.

Time is represented in **days** (`date`), and capacity in **minutes per day**.

## Outputs

`RiskReport`: per-assignment probabilities and shortfalls, `expected_missed` (sum of P(late)), a priority-weighted on-time probability, and the sample count and seed. Undated work has no risk entry (`test_undated_work_cannot_be_late`).

## Risk calculation

For each of a few hundred seeded samples (`RiskConfig.samples`), the simulator draws:

- an actual duration for each task (log-normal around the estimate, with a shared "this week" factor so overruns correlate);
- which planned sittings actually happen (Bernoulli per sitting, with clustered "lost days");
- whether the student uses leftover free time to catch up, plus a limited last-days "crunch".

Work is then settled earliest-deadline-first against the remaining slack; late work is attributed a cause. The fraction of samples in which an assignment finishes on time becomes its probability, bucketed by fixed cut-offs into a status. Sampling is seeded from task ids and the date, so the same plan gives the same numbers.

**`robust.py` adds:** a closed loop. Simulate, give at-risk assignments one more buffer day (capped), re-plan, and keep the result only if measurably better on the same sampled futures (common random numbers). It does not "fix" work that does not fit at all (`main_risk == "not_planned"`), which it leaves for the student to see.

## Historical / behavioural dependencies

- **Deterministic:** the simulator is seeded and pure; its arithmetic (capacity, slack settling) is deterministic.
- **Depends on learned or assumed priors:** follow-through probability per sitting (`followthrough.py`, with population priors), duration spread (`estimation.py`), and `RiskConfig` constants (lost-day rate, week correlation, default follow-through, recovery rate, crunch minutes, duration band, the on-track/watch cut-offs). Without student history these fall back to population defaults tuned for IntelliPlan's users.
- The outputs are therefore **only as meaningful as those priors**, and the result is presented as a percentage (`TaskRisk.percent`).

## Relevant tests

`tests/intelliplan/test_risk_and_robust.py` defines the behaviours worth reproducing as scenarios (independently, in our own terms):

- same input, same output (determinism);
- a relaxed week is on track;
- a week that cannot fit is flagged, with "not planned" as the reason;
- lower follow-through increases risk; less reliable estimates increase risk (monotonic sensitivity);
- stages roll up to the assignment the student knows;
- undated work cannot be late;
- buffer is added only where it helps; changes that do not help are discarded; work that does not fit is not "hardened".

## Useful concepts

- **Answer "does this fit?" separately from "will this happen?"** Feasibility (capacity versus effort before the deadline) is deterministic and needs no history; behaviour is a separate, later layer.
- **Slack is the central quantity:** capacity available before the deadline minus effort remaining.
- **Name the main cause** of risk (`not_planned`, `follow_through`, `overrun`), so the explanation is structured, not prose.
- **Do not hide overload:** work that cannot fit is reported explicitly rather than absorbed.
- **Pure and seeded/deterministic**, with `today`/`now` injected, and behavioural tests that assert direction (more work or less capacity never lowers risk).
- **Undated work is handled explicitly** rather than defaulted.
- **Capped, named components** (`health.py`) as an explainability pattern.

## Concepts we will NOT reuse

- **Probabilities of lateness** (`on_time_probability`, "82% on time"). They require calibrated follow-through and duration models; HaUI has no dataset, and IntelliPlan's priors were tuned for other students.
- **Monte Carlo simulation, lost-day/correlation/crunch/recovery parameters** and every numeric constant in `RiskConfig`, `predictions.py`, `behavior.py`, `followthrough.py`. None are validated for HaUI students.
- **`predict_completion_risk`'s hand-set logistic weights and its `2.0` sentinel for "no time available".** It turns unvalidated weights into a confident-looking number and has no "unknown" state.
- **Risk as a property of a finished plan.** HaUI Risk v0 must work before any plan exists.
- **`robust.py` auto-buffering.** It presupposes a planner and a simulator; both are later slices.
- **Day-granular `date` arithmetic.** We use timezone-aware UTC instants so "deadline == now" and same-day deadlines are exact.
- **Status cut-offs (0.8 / 0.6) and the health-score penalty sizes.**

## Implications for HaUI Compass Risk v0

1. Risk v0 answers only: *given the work remaining and the capacity available before this deadline, how constrained is this assignment?* It is **feasibility, not prediction**.
2. Core quantity: `slack = available capacity until the deadline − remaining estimated effort`, plus one easily explained relative measure (spare capacity as a share of the work).
3. Output a **level with typed reason codes and typed evidence**, never a bare number and never a probability.
4. Make **unknown** a first-class outcome (missing effort estimate, missing capacity), distinct from low risk, and treat "nothing left to do" and "deadline passed" as explicit cases.
5. Make the **capacity horizon explicit** in the input: capacity until *this* deadline, not the student's general weekly capacity.
6. Keep thresholds in one small, **versioned policy** object and label them **unvalidated MVP heuristics** until evaluated.
7. Adopt the direction-of-change **invariants** from IntelliPlan's tests (more work or less capacity must never lower risk) as our own property tests.
8. Behaviour-aware risk (follow-through, estimate calibration) is a later version, gated on real HaUI execution data and an evaluation plan (PROJECT.md, *Risk Engine*).

## Source modules inspected

`intelliplan/intelligence/risk.py`, `intelliplan/intelligence/robust.py`, `intelliplan/intelligence/predictions.py`, `intelliplan/intelligence/health.py`, `intelliplan/intelligence/nba.py` (`_deadline_pressure`), `intelliplan/intelligence/priority.py`, `intelliplan/services/scheduling.py` (`assessor`), `intelliplan/intelligence/rescheduling.py` (consumption of `assess`), `tests/intelliplan/test_risk_and_robust.py`.

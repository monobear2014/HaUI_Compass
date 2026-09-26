# IntelliPlan Next Best Action Reference

- **Status:** Research note (not a decision). Read-only study; no IntelliPlan code, weights, or constants were copied.
- **Date:** 2026-09-27
- **Reference:** `.references/IntelliPlan` at commit `78731438d0bd71524d99ec1bc32b3dfafe1cb75d` (git-ignored). Licence caveat: the repository has no LICENSE file, so only concepts may be reused ([`intelliplan-audit.md`](intelliplan-audit.md) §2).
- **Purpose:** inform HaUI Compass NextBestActionEngine v0 (`domain/recommendations`, `engines/next_best_action`, [ADR-0001](../decisions/0001-python-package-and-domain-boundaries.md)).

All paths are relative to the IntelliPlan repository root.

## Scope inspected

| Module | Role |
|---|---|
| `intelliplan/intelligence/nba.py` | The engine: `NBAContext`, `NBAWeights`, `generate`, `score`, `decide`, dismissal and dedupe handling, reason ranking |
| `intelliplan/domain/student.py` | `ActionKind`, `ActionCandidate`, `NextAction`, `identity_key` |
| `intelliplan/services/next_action.py` | Composition root: loads data, builds `NBAContext`, calls `nba.decide`; also `_at_risk` |
| `intelliplan/intelligence/reasoning.py` | LLM phrasing of an already-made decision, with validation and fallback |
| `intelliplan/intelligence/priority.py` | 0..100 assignment priority with reason chips |
| `intelliplan/intelligence/risk.py`, `rescheduling.py` | Checked for any interaction with NBA (see below) |
| `tests/intelliplan/test_nba.py` | 37 behavioural tests for the engine |

## Actual implementation

`nba.decide(ctx, planned_today, assignments, mastery, limit=4)` runs three stages:

1. **Generate** (`nba.generate`, L218): build candidate actions from (a) today's planned blocks that are not done, (b) assignment rows that are overdue or due within a day but missing from the plan, (c) weak or decaying concepts near an assessment, and (d) a break when the student has worked 90+ continuous minutes.
2. **Score** (`nba.score`, L373): one linear objective over ten normalised components, described below.
3. **Rank, dedupe, and honour dismissals**: sort by score, collapse duplicate work, drop what the student already declined today (except overdue work), and return the winner plus runners-up.

The engine ranks **heterogeneous actions** (`ActionKind`: start/continue task, study/review concept, practice, exam prep, admin, break, defer), not only tasks.

## Inputs

- `NBAContext` (`nba.py` L141): `now`, `available_minutes` until the end of today's availability, an optional fitted `BehaviorModel`, `worked_today_minutes`, `continuous_minutes`, `current_course`, `in_progress_task_ids`, `dismissed_task_ids`, and `NBAWeights`.
- Loose **dict rows** for planned blocks and assignments (read defensively, with helpers such as `_int`, `_as_date`) and `MasteryEstimate` objects for concepts.
- The engine does not receive tasks with typed relationships to assignments, and it never receives a risk report.

## Ranking logic

- **Score-based, not lexicographic.** `score()` sums ten terms: deadline pressure, academic value, mastery gap, learning gain, completion probability, schedule fit and continuity as positives, and time cost, stress and context switch as negatives. Each term is a 0..1 quantity multiplied by a weight from `NBAWeights` (`nba.py` L71: for example `deadline` 1.60, `academic_value` 1.00, `stress` 0.75), then normalised to 0..1.
- **Deadline pressure** is a fixed step table (`_deadline_pressure`, L193): overdue or due today 1.0, tomorrow 0.85, then decreasing bands, undated 0.15.
- **Duration** enters only through *schedule fit* (does the block fit the available gap) and *time cost*, both of which depend on an `available_minutes` value that presumes a day schedule.
- **Priority** enters as `academic_value = priority / 100` from the loose row.
- **In-progress work** becomes an `ActionKind.CONTINUE_TASK` and adds the reason `already_started` (L253, L435). Reading `score()`, it adds **no term to the score**, so in-progress work receives no ranking preference beyond what its other components give it.

## Risk and urgency interaction

- **`nba.py` never consumes a `RiskReport`.** `risk.py` (the Monte Carlo simulator) is a separate concern used by planning and rescheduling. The only "risk" in `nba.py` is a concept's `est.risk` field, used as `academic_value` for concept candidates (L335).
- Urgency reaches the score solely through the step table above.
- `services/next_action.py::_at_risk` (L374) builds a separate "what is closest to going wrong" panel: assignments due within 2 days and weak concepts within 5 days of an assessment, sorted by days away. It is displayed next to the recommendation; it does not feed the ranking.

## Explanation logic

- `score()` collects **stable reason codes** (`overdue`, `due_today`, `low_mastery`, `already_started`, `fits_the_gap`, `over_capacity`, and others) and returns the per-component contributions in `NextAction.components`, so "why" is the arithmetic.
- **One label table** (`REASON_LABELS`, `nba.py` L117) maps codes to sentences, and **`_REASON_RANK`** orders the codes: deadline reasons first, then why it matters, then why now, and caveats last ("caveats never lead", tested).
- **LLM boundary:** `reasoning.py` sends only reason codes and rounded facts to a model, validates the response against them, drops unknown codes, and falls back to a deterministic sentence. The system prompt states the engine is authoritative.

## Tie breaking

`decide` sorts with `key=(score, deadline_pressure)` in descending order. Python's sort is stable, so candidates that tie on both keys keep their **generation order**, which follows the order of the input rows. As read, ties are therefore **not resolved by a semantic rule**; the outcome depends on input ordering. `_dedupe_actions` similarly keeps whichever duplicate ranked first.

## Historical dependencies

`BehaviorModel` (`intelliplan/intelligence/behavior.py`) supplies completion probability, best time slot, and workload tolerance; without it the engine falls back to `POPULATION_COMPLETION_RATE`. Confidence (`_confidence`) is a min/mean blend of behavioural evidence and how much is known about the work. These depend on IntelliPlan's fitted models and population priors.

## Relevant tests

`tests/intelliplan/test_nba.py` (37 tests) covers: empty input, completed work never offered, planned versus assignment duplicates, started work offered as "continue", overdue outranking later work, a weak concept outranking routine homework, break after a long stretch, work that fits the gap, same-subject continuity, over-capacity flag, every reason code having a label and a rank, reason ordering (deadline leads, caveats never lead, overdue beats every other reason), no crash on malformed input, deduplication of the same work from two sources (while keeping same-title work in different courses apart), and dismissal rules (declined work is not re-offered the same day, overdue work returns, due-today work can still be declined).

## Useful concepts

- **Separate candidate generation from ranking**, so each is testable alone.
- **Enumerable input:** everything the decision uses is in one explicit context, so a recommendation is reproducible from a log line.
- **Stable reason codes with a single label table**, plus a defined reason order in which deadline reasons lead and caveats never do.
- **Never recommend completed work.**
- **Deferral is an instruction:** honour "not now", except that overdue work must come back (a possible later feature).
- **Deduplicate the same work reaching the engine by two paths**, but keep different courses apart.
- **Return alternatives with the winner**, so a student can see past the recommendation.
- **The LLM only phrases a finished decision, validated against its inputs, with a deterministic fallback.**
- **A "nothing to do" outcome is a valid result**, not an error.

## Concepts intentionally not reused

- **The weighted linear score, `NBAWeights`, the deadline-pressure step table, the schedule-fit curve, and every numeric constant.** No HaUI data supports any of them, and a weighted sum obscures why one item beat another.
- **Behaviour, mastery, study-method, and completion-probability inputs** (`BehaviorModel`, `POPULATION_COMPLETION_RATE`, confidence blend). HaUI has no history or validated priors.
- **Break, defer, concept-review, and exam-prep candidates.** Out of scope for v0, which recommends tasks.
- **`available_minutes` / schedule-fit / stress / context-switch terms.** They presuppose today's schedule, which HaUI does not model yet.
- **Loose dict rows and title-plus-course identity hashing.** HaUI has typed entities with ids.
- **Order-dependent tie-breaking.** HaUI requires reproducible output regardless of input order.
- **Ranking without the risk engine's output.** HaUI's recommendation is meant to be driven by explicit assignment risk.

## Implications for HaUI Compass NBA v0

1. **Rank tasks, not heterogeneous actions.** Candidates are typed: task, its assignment, and the assignment's `RiskSignal`. The engine receives everything explicitly and fetches nothing.
2. **Use an ordered (lexicographic) policy, not a weighted score:** risk tier, then earlier deadline, then in-progress before not-started, then a deterministic id tie-break. Each step is explainable and no coefficient needs empirical justification.
3. **Treat `UNKNOWN` risk explicitly**: never as `LOW`; the tier it is mapped to is a named, versioned policy value.
4. **Fully deterministic tie-breaking**, so shuffled input gives the same answer.
5. **Reason codes and typed evidence** are the result; sentences are a later presentation concern (`ai/explanation`), which may never change the choice.
6. **Empty state as a typed result** (`NoRecommendation`).
7. **`risk_if_deferred` is not implemented in v0.** IntelliPlan gives no usable model for it, and HaUI's RiskEngine needs the capacity available *after* a deferral, which requires a scheduling model that does not exist yet. It will return with planning, via an explicit deferral scenario.
8. **Adopt the tests' behavioural checks as our own scenarios:** completed never chosen, higher risk never loses, earlier deadline wins, empty input handled.

## Source modules inspected

`intelliplan/intelligence/nba.py`, `intelliplan/domain/student.py`, `intelliplan/services/next_action.py`, `intelliplan/intelligence/reasoning.py`, `intelliplan/intelligence/priority.py`, `intelliplan/intelligence/risk.py`, `intelliplan/intelligence/rescheduling.py` (interaction check), `tests/intelliplan/test_nba.py`.

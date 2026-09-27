# IntelliPlan Execution Tracking Reference

- **Status:** Research note (not a decision). Read-only study; no IntelliPlan code, constants, or priors were copied.
- **Date:** 2026-09-27
- **Reference:** `.references/IntelliPlan` at commit `78731438d0bd71524d99ec1bc32b3dfafe1cb75d` (git-ignored). Licence caveat: the repository has no LICENSE file, so only concepts may be reused ([`intelliplan-audit.md`](intelliplan-audit.md) §2).
- **Purpose:** inform HaUI Compass Execution Tracking v0 ([ADR-0001](../decisions/0001-python-package-and-domain-boundaries.md)).

All paths are relative to the IntelliPlan repository root.

## Scope inspected

| Module | Role |
|---|---|
| `intelliplan/models/active_session.py` | `ActiveSession` ORM model — the actual-work fact table |
| `intelliplan/repositories/active_sessions.py` | Write/read side of that table |
| `App.py:1529` (`TaskFeedback`) | Estimated-vs-actual record, keyed by title/course, not a task id |
| `intelliplan/intelligence/followthrough.py` (`observations_from_sessions`, `harvest_plan_outcomes`, `FollowThroughObservation`) | Turns raw facts into training observations for the follow-through model |
| `intelliplan/intelligence/estimation.py` (referenced; not re-read line by line here) | Consumes estimated-vs-actual pairs for calibration |

## Actual execution model

IntelliPlan's fact table is `ActiveSession` (`active_sessions`), "one sitting: what was planned, what happened, what it taught us" (module docstring). One row per sitting the student actually starts, not per plan or per task. It carries **both halves side by side**: `block_id`/`task_id`, `title`, `planned_minutes`, `due_date` under "what was planned"; `state`, `started_at`, `ended_at`, `active_seconds`, `completed_work`, `progress_percent` under "what happened".

## Session / completion representation

- **States:** `SESSION_STATES = ("running", "paused", "completed", "abandoned", "expired")`. The docstring is explicit that `abandoned` "is not a failure state to hide — it is the single most informative signal the scheduler gets, because it measures real focus length rather than intended length."
- **Completion is separate from duration and from state.** `completed_work` is a boolean, "the student's own answer to 'did you finish?' — the ground truth the timer cannot observe." A session can end `abandoned` and still have `completed_work=True` if the student says so, or vice versa; the model does not infer completion from how the session ended.
- **Partial, ongoing work** is represented by `progress_percent` (0..100, self-reported) for work spanning several sittings, not by a third completion value.
- **Actual duration is timer time, not wall time.** `active_seconds` explicitly excludes `paused_seconds`: "Wall time spent with the timer running, excluding pauses. This is the number the estimator uses; elapsed clock time is not effort." There is no separate stored "duration" that could disagree with a start/end pair — it is a running counter, since a real timer can be paused and resumed.

## Planned vs actual effort

Two independent facts, on the same row, so they can be compared: `planned_minutes` and `active_minutes` (derived from `active_seconds`). Separately, `TaskFeedback` (`App.py:1529`) is a smaller, older fact record: `estimated_time` and `actual_time` per (title, course), feeding the estimation model directly. Both models agree on the same shape: an estimate and a later, independently recorded actual, never the same field overwritten.

## Follow-through data

`followthrough.observations_from_sessions` turns `ActiveSession`-shaped rows into training observations. Two points are notable:

1. **Order and grouping matter for one derived feature only.** Rows are sorted by start time and grouped by day purely to reconstruct `prior_load_minutes` (fatigue: how much the student had already done that day before this sitting). It is not needed to interpret any single row on its own.
2. **A deliberate anti-leakage rule:** *"Planned length is the feature. Actual is only a fallback for a finished sitting — an abandoned one's actual length is short because it was abandoned, and using it would leak the label."* i.e. don't let the length of an abandoned attempt masquerade as evidence about the task's true size.

`harvest_plan_outcomes` is a separate, simpler fact source: every plan block on a *past* day, labelled `done`/not from a checkbox-progress dict, bounded by `valid_from`/`valid_until` so blocks from a plan version that was replaced before its day arrived are not counted as missed. It intentionally carries **no assignment titles**, "the same privacy rule as the audit tables."

## Estimate calibration inputs

Not re-derived here in detail (see [`intelliplan-risk-reference.md`](intelliplan-risk-reference.md) for `estimation.py`); the relevant fact is simply that calibration consumes exactly the (estimated, actual) pairs described above, always keeping both sides rather than a single corrected number.

## Useful concepts

- **Record the fact, not a conclusion.** A session row states what happened (state, timer seconds, self-reported completion); labels like "risk" or "calibration" are computed later from many such facts, never stored on the fact itself.
- **Abandoned/partial is informative, not an error state.** It should be recorded plainly, not hidden or converted into a failure.
- **Keep planned and actual as two separate values, always.** Never overwrite an estimate with an actual; store both so any future comparison is honest.
- **Active time ≠ elapsed time.** A pause is not effort. (HaUI Compass v0 does not implement a timer with pauses; this is a concept to remember if one is added later.)
- **Anti-leakage discipline:** don't let an incomplete attempt's short actual duration be read as evidence about the task's real size.
- **Privacy discipline:** a training/history fact does not need to carry the task's title.
- **Completion is a first-class, separately recorded fact**, not inferred from how a session ended.

## Concepts intentionally not reused

- **The ORM tables, columns, and any numeric defaults** (e.g. `planned_minutes` default, camera/focus fields, sparks/gamification fields). Out of scope and unvalidated for HaUI.
- **Any statistical use of the facts** (follow-through fitting, prior-load features, day grouping for fatigue). HaUI Compass v0 records facts only; deriving a behavioural model from them is future, data-gated work (PROJECT.md, *Risk Engine* and *Evaluation Strategy*).
- **Camera-based focus tracking** and any productivity/engagement scoring — not part of HaUI's scope and privacy-sensitive.
- **Free-text `notes`, `perceived_difficulty`, gamification fields (`sparks_forfeited`)** — not needed for v0's factual record.
- **Keying facts by title/course** (as `TaskFeedback` does) rather than a typed task id — HaUI already has typed `TaskId`.

## Implications for HaUI Compass v0

1. **One immutable fact per observed sitting** (`TaskExecution`), separate from the `Task` it describes, mirroring "what was planned lives on the Task, what happened is its own record."
2. **A minimal, honest outcome**: `PARTIAL` (worked on it, not finished) or `COMPLETED` (finished this sitting), matching IntelliPlan's separation of completion from session state — without adopting IntelliPlan's five-state session lifecycle, which HaUI does not need without a live timer.
3. **Store observed start/end, derive duration** — never a duration field that could silently disagree with the timestamps, and never elapsed-time-as-effort without a reason to distinguish it (HaUI v0 has no pause concept, so start/end is sufficient).
4. **Never derive a behavioural signal or calibration coefficient from these facts yet.** Only their existence and a plain factual summary (counts, total duration, first/last activity, completion time) belong in this branch.
5. **Keep the fact private and small**: a task id and timestamps are enough; no titles are required in the execution record itself (the domain `Task` already has one).

## Source modules inspected

`intelliplan/models/active_session.py`, `intelliplan/repositories/active_sessions.py`, `App.py:1529` (`TaskFeedback`), `intelliplan/intelligence/followthrough.py` (`observations_from_sessions`, `harvest_plan_outcomes`, `_block_is_done`).

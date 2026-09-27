# IntelliPlan Structured Reflection Reference

- **Status:** Research note (not a decision). Read-only study; no IntelliPlan code, constants, or priors were copied.
- **Date:** 2026-09-27
- **Reference:** `.references/IntelliPlan` at commit `78731438d0bd71524d99ec1bc32b3dfafe1cb75d` (git-ignored). Licence caveat: the repository has no LICENSE file, so only concepts may be reused ([`intelliplan-audit.md`](intelliplan-audit.md) §2).
- **Purpose:** inform HaUI Compass Structured Reflection v0.

All paths are relative to the IntelliPlan repository root.

## Question asked

Does IntelliPlan have structured reflection, post-session reflection, self-report, execution
feedback, memory updates, or behaviour feedback?

## Finding: no structured reflection subsystem exists

A repository-wide search for reflection/self-report/check-in/feedback/survey/mood/journal
vocabulary (`grep -rn -i "self.report|checkin|post.session|feedback|survey|mood|journal"`) turns up
no post-session reflection prompt, no free-text or structured self-report form tied to a task or
study session, and nothing that asks the student "how did that feel?" or "was this too much?" after
work. What the search does find, and why each is out of scope for this branch:

| Hit | What it actually is |
|---|---|
| `TaskFeedback` (`App.py:1529`) | Not reflection: `estimated_time`/`actual_time`/`difficulty`/`priority` per (title, course). Already documented as the estimate/actual data source in [`intelliplan-execution-reference.md`](intelliplan-execution-reference.md) §"Planned vs actual effort". It is a byproduct of finishing a session, not a student-authored reflection. |
| `SiteFeedback` (`App.py:2085`) | A generic bug-report/feature-request/praise widget with an optional `mood` integer, available on every page. Product feedback about the app, unrelated to academic reflection on work just done. |
| `followthrough.py` (`prior_load_minutes`, day grouping) | Derived automatically from session timestamps, not self-reported. Already covered in the execution reference; explicitly a "concept not reused" there. |
| `pet_engine.py` "mood" | A gamification pet's mood, computed from days-since-last-visit. Not a student self-report. |
| `insight_glue.py` `"survey"` key | One line inside a larger analytics/report payload; not traced to an actual student-facing survey flow in the scope inspected. |
| Difficulty/topic words in `decomposition.py`, `sizing.py`, task-title keyword lists (e.g. `App.py:3407`) | Static keyword matching used to *estimate* a new task's effort from its title (e.g. spotting "essay"/"thesis" to size writing work), not a student reporting which topics were difficult after the fact. |

**Conclusion:** IntelliPlan has no post-session reflection workflow, no explicit self-report of
workload/difficulty/procrastination, and no "confirm before it becomes a fact" step for anything
resembling reflection. The only adjacent concept — estimated-vs-actual duration — is a plain fact
comparison already handled by HaUI Compass's execution tracking. IntelliPlan therefore offers no
concepts to draw on for the reflection *domain model* itself; the useful precedent it does offer,
reused below, is its general discipline about facts vs. derived signals (established in the
execution reference and applied here to reflection).

## Concepts carried over from the execution reference (not new)

- Keep the fact and the interpretation separate: an execution fact (estimated vs. actual duration)
  is not the same thing as what the student says about it.
- Record self-report as a plain, typed value — never an inferred score computed from behaviour.
- No behavioural profile, calibration coefficient, or psychological label belongs in this branch.

## Implications for HaUI Compass v0

1. Structured Reflection v0 is designed from HaUI Compass's own principles (ADR-0001 domain
   responsibilities, PROJECT.md's "confirm before it becomes a fact" pattern for reflection
   signals) rather than adapted from IntelliPlan, since IntelliPlan has nothing structurally
   equivalent to adapt.
2. The one reusable fact IntelliPlan does supply — an estimated/actual pair per unit of work — is
   already available from `TaskExecutionSummary` (Execution Tracking v0); reflection reuses it
   rather than re-deriving it (`docs/decisions/0001-python-package-and-domain-boundaries.md`,
   *StudentState Ownership*: "facts are persisted as their own records").
3. Because no prior art exists here, this branch keeps the candidate signal set intentionally
   small (estimation feedback, workload feedback, difficult topics, deferred tasks) rather than
   guessing at a larger surface a real reflection UI might need later.

## Source modules inspected

`App.py` (`TaskFeedback`, `SiteFeedback`, task-title keyword lists), `pet_engine.py`,
`followthrough_glue.py`, `next_action_glue.py`, `learning_graph_glue.py`, `insight_glue.py`,
`active_glue.py`, `intelliplan/intelligence/decomposition.py`, `intelliplan/intelligence/sizing.py`.

# DRYRUN-02 Report

**Identifier:** `DRYRUN-02`
**Date:** 2026-09-29
**Dataset status:** Internal operational run only; not participant data and excluded from `P01`–`P15`.

## Run scope and duration

The canonical fixture was reset, the pre-session checklist/script/scenario/answer-key/questionnaire materials were walked through, and the real HTTP learning-loop path was replayed for T1–T10-equivalent operations: task creation, recommendation, plan generation, partial execution, reflection candidates, explicit confirmation, window change, replan, and revision history. The automated fixture run took **0.771 seconds wall-clock** (`pytest` process time). This is an infrastructure duration, not a participant time-on-task measurement.

Human task durations were not fabricated: this scripted dry-run cannot establish whether a moderated participant session fits 30–45 minutes. A timed researcher-led rehearsal with a human operator remains required before recruitment.

## Task flow

| Task | Result | Operational observation |
| --- | --- | --- |
| T1 | PASS | Canonical four-course/five-assignment context reset and inspectable. |
| T2 | PASS | Normal task-creation path creates the fifth task at 45 minutes. |
| T3 | PASS | Weekly plan revision 1 generated from four StudyWindows. |
| T4 | PASS | Next Best Action selects `Solve graph exercises`. |
| T5 | PASS | Structured recommendation reasons/evidence are available for deterministic coding. |
| T6 | PASS | Partial execution transitions the task through the real endpoint. |
| T7 | PASS | Reflection candidate flow accepts the canonical response. |
| T8 | PASS | Explicit signal confirmation persists through the real endpoint. |
| T9 | PASS | Removing Tuesday's window produces revision 2 through Adaptive Replanning. |
| T10 | PASS | Revision comparison/history endpoint retains the baseline and revised plan. |

## Comprehension checks

Recommendation and replanning coding remains deterministic against actual structured reason codes and PlanChange records. The scripted run verified that the data needed by the moderator key is returned; it did not invent participant verbal responses.

## Questionnaire and reset

The unchanged SUS, separate custom Likert items, open questions, and interview prompts were walked through in the documented sequence. The fixture reset is deterministic and idempotent. `research-data/` was not used.

## Issues

### Execution-material issue A-01

The scripted run cannot measure human task durations or confirm 30–45-minute realism. No frozen semantics are affected. Before recruitment, run one timed researcher-led rehearsal using the same script and record per-task durations on the observation sheet.

### Fixture/operation issues

None observed.

### Protocol-level issues

None observed. Protocol v1.3 remains unchanged.

## Changes made

Added this report only. No product code, Protocol v1.3, questionnaire, task semantics, scoring rules, or primary metrics were changed.

## Readiness decision

**EXECUTION MATERIAL FIXES REQUIRED.** The fixture and scripted workflow pass, but recruitment should wait for the one timed researcher-led rehearsal needed to establish realistic 30–45-minute operation.

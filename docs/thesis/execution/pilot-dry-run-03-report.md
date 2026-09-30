# DRYRUN-03 Report

**Identifier:** `DRYRUN-03`
**Date:** 2026-09-29
**Status:** Internal researcher-led browser rehearsal; no participant data and no `P01` identifier used.

## Result

The canonical fixture was reset and a researcher-led browser rehearsal was
started with the real Chrome UI. The earlier `Invalid time value` rendering
blocker is fixed; Today rendered with the canonical recommendation and the
weekly-plan editor accepted the canonical four windows.

The original rehearsal stopped before a complete participant session because
two fixture/operation issues prevented a valid continuation. Both were
subsequently corrected and browser-validated, but the timed session itself has
not yet been resumed. The recorded timing remains partial, not a claimed
30–45-minute human-session result.

## Timing

| Phase | Observed duration |
| --- | --- |
| Orientation | 1 min 12 sec |
| T1 | 4 sec (failed: no imported data shown) |
| T2 | Not attempted (blocked by T1 fixture state) |
| T3 | Approx. 1 min 09 sec (generated revision 1 in browser) |
| T4 | Attempted; recommendation visible (`Solve graph exercises`) |
| T5 | Attempted verbally against displayed evidence |
| T6 | Approx. 30 sec; saved 45-minute partial execution after one timestamp correction |
| T7 | Approx. 15 sec; reflection submitted |
| T8 | Approx. 20 sec; “limited available study time” candidate selected and confirmed |
| T9 | Approx. 30 sec; blocked by repeated 400/domain-rule response |
| T10 | Approx. 10 sec; history showed revision 1 only |
| SUS/custom questionnaire | Not reached |
| Interview/debrief | Not reached |
| Partial elapsed time | 4 min 13 sec |

## Issues

**B-01 — Fixture/operation issue (fixed before this rehearsal):** the fixture
context initially omitted task metadata and `now` required by the real UI. It
now emits assignment title, course, deadline, fixed timezone-aware `now`, and
canonical capacities; Today renders cleanly with the expected recommendation.

**B-02 — Fixture/frontend composition issue (fixed):** the canonical fixture
now seeds the existing `manual/pilot-student` academic-data boundary that
`/academic` reads. The page loads that boundary on entry and displays exactly
four courses and five assignments. The Academic Skills Reading response is
visible before T2, and the normal browser task-creation flow creates
`Summarise two articles` with a 45-minute estimate.

**B-03 — Fixture/operation issue (fixed):** the replan form now uses the
fixture context's fixed `now` as `effective_at`, rather than the browser wall
clock. Study-window removal is identity-keyed so deleting Tuesday removes the
correct canonical window. The browser created revision 2, with revision 1
retained in History.

**A-01 — Execution timestamp ambiguity (fixed):** execution defaults now use
the fixture context `now`, so browser-generated timestamps are compatible with
the fixed fixture clock.

No Protocol v1.3 semantics, task definitions, questionnaire wording, SUS, scoring rules, or primary metrics were changed.

## Readiness

**READY TO RESUME TIMED DRYRUN-03.** The original partial timing result does
not establish the 30–45-minute target. Resume this same DRYRUN-03 report; do
not create DRYRUN-04 or recruit participants yet. Protocol v1.3 remains
unchanged.

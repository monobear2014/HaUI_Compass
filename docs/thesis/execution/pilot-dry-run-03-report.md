# DRYRUN-03 Report

**Identifier:** `DRYRUN-03`
**Date:** 2026-09-29
**Status:** Internal researcher-led browser rehearsal; no participant data and no `P01` identifier used.

## Result

The canonical fixture was reset and the actual browser UI was opened against the fixture API. The initial attempt failed during workspace rendering with `Invalid time value` in the frontend date formatter. Root cause: the fixture context omitted required `now` metadata consumed by `Shell` at `src/lib/api.ts:164`/`src/components/shell.tsx:111`; the originating value was `undefined` from the context response. The fixture was corrected to emit the fixed timezone-aware `now` value. A resumed browser check renders Today successfully and shows the canonical `Solve graph exercises` recommendation after capacity metadata was supplied.

The complete timed T1–T10 rehearsal was not completed in this run, so no human timing result can yet be claimed.

## Timing

| Phase | Duration |
| --- | --- |
| Orientation | Not reached |
| T1–T10 | Not reached |
| Comprehension | Not reached |
| SUS/custom questionnaire | Not reached |
| Interview/debrief | Not reached |
| Total | Not measurable |

## Issues

**B-01 — Fixture/operation issue (fixed):** the fixture context initially omitted task metadata and `now` required by the real UI. The fixture now emits assignment title, course, deadline, and fixed timezone-aware `now`; the resumed Today workspace renders cleanly with the canonical recommendation.

**B-02 — Fixture/frontend composition issue (fixed):** the UI sent no assignment capacities, producing UNKNOWN risk and the wrong recommendation. The fixture now exposes canonical capacities and the workspace passes them through without changing engine policy.

No Protocol v1.3 semantics, task definitions, questionnaire wording, SUS, scoring rules, or primary metrics were changed.

## Readiness

**EXECUTION MATERIAL FIXES REQUIRED.** The browser rendering blockers are fixed, but the complete timed researcher-led T1–T10 rehearsal still must be completed before assessing the 30–45-minute target. Do not recruit participants yet.

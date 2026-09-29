# Pilot Dry-Run Report — DRYRUN-01

**Date:** 2026-09-29
**Classification:** Internal operational dry-run; not participant data; excluded from `P01`–`P15` and all final-study datasets.
**Final decision:** **NOT READY FOR DRYRUN-02**

## Scope and execution point reached

The dry-run followed [pilot-dry-run-plan.md](pilot-dry-run-plan.md) and began with the pre-session checklist and canonical-fixture reset check. It stopped before consent, timing, or any participant task because a deterministic resettable fixture for the required Protocol v1 scenario is not yet available in the prototype. No participant-facing session was run and no research-data directory or participant record was created.

## Duration

| Measure | Result |
| --- | --- |
| Total participant-session duration | Not measured: stopped during pre-session fixture validation. |
| T1–T10 durations | Not measured: tasks were not started. |
| Fit within 30–45 minutes | Not assessable until the frozen fixture can be run end-to-end. |

## Fixture-validation evidence

The available explicit fictional frontend demo is the only documented resettable prototype route. Its implementation (`apps/api/src/haui_compass/api/demo.py`) seeds four tasks and three availability windows: 90, 60, and 60 minutes (3.5 hours total). Its documented boundary (`apps/web/README.md`) likewise states “Four fictional tasks and three editable availability windows.”

Protocol v1 requires a fixed scenario with three courses, five assignments, five listed study tasks, 6.5 hours of capacity, Algorithms configured high risk, Databases configured medium risk, and the specified controlled execution/reflection/capacity-change sequence. The existing demo fixture uses different tasks and assignment/course labels and does not establish the Protocol v1 risk fixture. It therefore cannot be truthfully represented as the canonical scenario, nor can its output support the frozen moderator answer key. This is a missing execution/environment fixture, not a defect in Protocol v1.

## T1–T10 operational result

| Task | Result | Reason |
| --- | --- | --- |
| T1 | ISSUE | Required canonical Academic Data fixture unavailable. |
| T2 | ISSUE | Cannot verify specified Academic Skills / Reading response task creation against the required fixture. |
| T3 | ISSUE | Weekly plan would use non-canonical tasks/windows. |
| T4 | ISSUE | Expected recommendation cannot be established from the required fixture. |
| T5 | ISSUE | Actual canonical recommendation reason codes unavailable for deterministic scoring. |
| T6 | ISSUE | Specified recommended/open task is not available under the canonical fixture. |
| T7 | ISSUE | The required scenario sequence cannot start from the frozen fixture. |
| T8 | ISSUE | Matching fixture-specific reflection signal cannot be verified. |
| T9 | ISSUE | Removed Tuesday window and revised plan cannot be compared against the required 6.5-hour baseline. |
| T10 | ISSUE | Canonical baseline/revised history and PlanChange codes cannot be generated. |

## Comprehension check

The coding labels (`correct`, `partially correct`, `incorrect`) and manual rules are operationally clear. However, deterministic scoring is **not viable for this dry-run** because the canonical backend recommendation and PlanChange outputs cannot be produced. The current demo's output must not be substituted for the frozen answer key.

## Questionnaire check

The standard 10-item SUS is unchanged and separate from the custom 5-point Likert items. The questionnaire sequence and form layout are operationally usable, but cannot be administered as part of a valid full dry-run until the canonical workflow is executable.

## Reset check

The current demo is resettable by restart, but resets the wrong fictional fixture. Reset mechanics therefore pass only for the existing demo and fail for Protocol v1 canonical-fixture readiness.

## Issue classification

| ID | Issue | Classification | Required action |
| --- | --- | --- | --- |
| E-01 | Canonical resettable pilot fixture unavailable: no prototype reset mechanism implements the frozen scenario and its expected evidence. | **A. Execution/environment issue** | Implement a deterministic resettable fixture for the existing frozen scenario, validate it automatically, then rerun the dry-run. |

No protocol-level issue was found. Protocol v1 remains frozen; no protocol version bump is required. The blocker is limited to execution/infrastructure availability.

## Changes made

None to Protocol v1, participant tasks, scenario semantics, questionnaire, SUS, comprehension scoring, metrics, or product code. This report was updated only to correct the issue classification.

## Readiness

**NOT READY FOR DRYRUN-02.** Do not recruit participants or run the participant study until E-01 is resolved through a deterministic resettable canonical fixture, automated validation, and a subsequent successful dry-run.

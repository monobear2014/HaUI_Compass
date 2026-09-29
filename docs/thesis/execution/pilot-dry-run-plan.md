# Pilot Dry-Run Plan — Protocol v1

Conduct exactly one internal dry-run before recruiting or collecting from real participants. The dry-run operator is not assigned `P01`–`P15`, and all dry-run observations remain outside the participant dataset.

## Purpose

Verify session timing, script clarity, canonical-fixture reset, metric capture, questionnaire flow, and operational ambiguity. Confirm the session can be run in 30–45 minutes without coaching.

## Procedure

1. Reset the canonical fixture and complete the pre-session checklist.
2. Run the complete session script, T1–T10, questionnaire flow, interview flow, and post-session reset as written.
3. Record timing, any ambiguity, technical issue, missing field, or reset problem in a dry-run log outside `research-data/`.
4. Verify the answer key captures actual structured recommendation and PlanChange outputs, and that the observation/data templates can capture all primary metrics.
5. Verify the dry-run data are not mixed with participant records, then delete or retain it only as an operational note with no participant identity.

## Decision rule

If the dry-run identifies a required change to participant tasks, canonical scenario, questionnaire, comprehension scoring, or primary metrics: stop. Bump the protocol version, document the change, update controlled materials, and rerun the dry-run. Do not silently alter Protocol v1 or mix datasets from different versions. Operational-only fixes that do not alter frozen elements must be documented in the dry-run log before participant recruitment.

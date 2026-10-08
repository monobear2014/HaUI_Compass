# ADR-0005: AI Task Decomposition Candidate Confirmation

- Status: Accepted
- Date: 2026-10-04

## Context

Demo Showcase v0.2 can explain a deterministic recommendation, but large assignments still enter
the learning loop only through manually authored tasks. Task decomposition is a suitable bounded
language capability, yet its output can change durable student-owned state if suggestions are
treated as tasks automatically. That would violate student agency, blur AI output with facts and
allow provider failures to alter risk and planning inputs.

The current LMS contract contains assignment identity, title, deadline, optional synthetic effort
and course identity/name/code. It has no assignment description. The current task creation use case
already validates assignment ownership and persists an explicit title and estimate.

## Decision

Task decomposition uses three distinct stages:

```text
LMS assignment facts
  → bounded provider output
  → validated, ephemeral candidate session
  → explicit user selection and edited values
  → existing CreateStudyTask boundary
  → deterministic risk, NBA and planning inputs
```

`TaskDecompositionProvider` is an application-owned asynchronous port. It receives only fields that
already exist: assignment external identity/title/deadline and course name/code. It returns typed
provider candidates, never domain `Task`, repository types or vendor responses.

Application validation permits one to five unique candidates. Titles contain 3–120 characters,
estimates are 15–480 minutes, and optional rationales are nonblank and at most 240 characters.
Malformed, empty, excessive, duplicate or out-of-range provider output is rejected as a complete
response and replaced by the deterministic fallback. Timeout and exception paths use the same
fallback. The fallback suggests research/design/implementation/testing steps and never produces a
graded submission artifact.

Generated candidates are stored in an in-memory, student-scoped session. Candidate IDs are derived
by the server from the requested session ID and candidate position. Confirmation accepts only
unique IDs issued in that session, validates all user-edited titles/estimates before any write, and
uses `CreateStudyTask.execute_many` so the existing ownership validation and transaction boundary
perform persistence. Deselected candidates never reach the task repository. Exact confirmation
retries are idempotent; conflicting reuse is rejected.

Candidate sessions are development/demo infrastructure and are replaced with the rest of the
in-memory container on scenario reset. PostgreSQL composition still uses ephemeral candidate
sessions; durable candidate review, expiry and distributed concurrency are not claimed.

## Alternatives considered

1. **Let the provider create tasks directly.** Rejected because provider output would mutate
   student-owned facts without confirmation.
2. **Trust a hidden candidate payload returned by the browser.** Rejected because a client could
   invent candidate IDs or bypass generation validation.
3. **Add assignment descriptions to the domain for prompting.** Rejected because no current source
   supplies that fact and v0.3 does not need it.
4. **Create a second task persistence path.** Rejected because it would duplicate assignment
   ownership, validation, transaction and task semantics.
5. **Require a live vendor LLM.** Rejected because the showcase must be reproducible offline.

## Consequences

- Generation and persistence are mechanically separate.
- The student controls selection, title and estimate before tasks become facts.
- Confirmed tasks immediately become ordinary inputs to Today and Weekly Planner.
- Vendor SDKs remain outside domain and engines; no vendor adapter is required for the demo.
- Candidate sessions do not survive process restart and are not production workflow storage.

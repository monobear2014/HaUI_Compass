# 0008: Per-account simulated workspaces behind the web session

- Status: Accepted
- Date: 2026-10-16

## Context

The weekly cycle (Plan → Do → Adapt → Reflect → next week) passed locally on the opt-in
`haui_compass.api.demo:app`, which holds one fictional student, one stepping clock and one
in-memory container for a single presenter. Staging runs `haui_compass.api.main:app` on
PostgreSQL. That entrypoint has no `demo/*` routes, and the web workspace loads its context only
from `demo/context`, so staging showed no context, assignments or deadlines.

Two other staging facts mattered:

- The learning API took the student identity from the request body or query (a trusted
  development field), and the web proxy forwarded requests without any account identity. On a
  shared staging URL every signed-in account could therefore name any student.
- Vercel Functions share no memory between instances, so global in-memory demo state (and the
  in-memory task-decomposition candidate store) is not reliable there.

## Decision

1. `HAUI_COMPASS_SIMULATED_WORKSPACES=1` selects a staging composition of the existing API. It
   is off by default; normal startup is unchanged.
2. The web backend authenticates the browser session and forwards the account id in
   `X-Compass-User` together with the existing shared `X-Compass-Service-Key`. In this mode the
   API rejects requests without the key (`403`) or account (`401`), and rejects any student
   reference in the query or JSON body that the account does not own (`403 forbidden_student`).
   The web proxy refuses `internal/*` paths because it now carries the key.
3. Each account has one `simulated_workspaces` row: a generation, the fixture anchor (Monday
   09:00 Hanoi of the real week when seeded) and its own virtual clock. The Canvas-like
   two-week fixture is rebuilt deterministically from the anchor; only the seeded tasks are
   stored. The account's student reference is `simulated-canvas-g<generation>/<account id>`.
4. The workspace is bound to the current request only (a context variable). A clock adapter and
   an LMS adapter read it, so planner, risk, replanner, weekly cycle and reflection run unchanged.
5. Reset starts a new generation (a new student namespace) instead of deleting rows. Earlier
   generations become unreachable through the API.
6. Task-decomposition candidate sessions are stored in PostgreSQL in every PostgreSQL
   composition, so generate and confirm may reach different instances.

## Alternatives considered

- **Deploy `demo:app` on staging.** Rejected: one shared presenter state, in-memory only, and a
  global reset/clock that every account would see.
- **Copy the fixture into the imported-academic tables.** Rejected: needs a new source kind in an
  existing check constraint and duplicates data that is a pure function of the anchor.
- **Rewrite student fields in the web proxy.** Rejected as the only control: the API is the
  authoritative owner of learning data and should enforce ownership itself.
- **Delete an account's rows on reset.** Rejected for now: repositories are append-only by design
  (ADR-0002) and per-table deletes would add destructive paths to every adapter.
- **Real time instead of a virtual clock.** Rejected for the demo: a week-long cycle could not be
  shown in one session. The virtual clock exists only in this opt-in mode and is labelled.

## Consequences

- Staging can show the full weekly cycle per account with durable, isolated data.
- The account id is trusted only with the shared service key; the key must stay server-side and
  must differ between environments.
- Old generations' rows remain in the database. Retention/deletion policy stays **PLANNED**.
- Simulated data is fictional and labelled in the UI; it is not an LMS integration.
- Migration `0004` (two additive tables) must be applied before this code is deployed.

## Follow-up

- Replace the `0001` live-model exclusion list with explicit DDL in a reviewed change.
- Define retention for retired generations and abandoned candidate sessions.
- Production identity/authorization for real student data remains **PLANNED**.

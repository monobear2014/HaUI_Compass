# Lecturer Dashboard & On-time Submission KPI

Author: Nguyen hoai nam

## Audit and scope

- Web authentication already uses scrypt passwords, opaque hashed session tokens,
  SQLite for local development and `web.users`/`web.sessions` in PostgreSQL for
  deployed environments. Registration previously had no lecturer role.
- `/compass-api/*` already authenticates browser sessions and forwards a server
  service key plus account ID. Simulated-workspace FastAPI authorization already
  isolates each student's data. These mechanisms are reused.
- `imported_courses`, `imported_assignments`, and `imported_submissions` belong to
  each student's imported source; they are not an authoritative class roster.
  An assignment's submission is unique within that student-owned import.
- Task execution/completion is separate from imported submission timestamps.
  The previous `/dashboard` remains the student statistics screen.
- Missing pieces were lecturer provisioning/class grants, aggregate submission
  metrics, cohort suppression and a lecturer screen. No student table, task or
  study-loop contract was rewritten.

## Vertical slice

1. An existing registered account signs in through the existing session flow.
2. `COMPASS_LECTURER_GRANTS` on **both web and API servers** provisions immutable
   account IDs and class IDs. Example (synthetic identifiers only):
   `{"teacher-account-id":["canvas-demo-ai","canvas-demo-small"]}`.
   Use an account ID obtained from the authenticated account/session, not a username.
   Public registration cannot set a role. Empty/malformed configuration grants no
   lecturer authority; an empty class list represents a lecturer with no classes.
3. Login returns a server-derived role and takes lecturers directly to `/lecturer`.
   `/demo` includes a lecturer login link; `/login?next=%2Flecturer` also works.
   Student default navigation remains unchanged.
4. The browser calls `/compass-api/lecturer/classes`; the existing proxy derives
   identity from its session and replaces identity/service headers. FastAPI verifies
   the service key and its own grants independently.
5. `GET /api/v1/lecturer/classes` returns only assigned fixture classes.
   `GET /api/v1/lecturer/classes/{class_id}/progress` returns 404 for both unassigned
   and unknown classes. Browser role claims do not grant authority.
6. The web learning proxy and simulated-workspace API reject lecturers entering
   student learning routes. The lecturer screen does not mount the student workspace
   provider, so it cannot accidentally initialize a student demo workspace.

No new dependency or AI framework is required. Existing PostgreSQL authentication
and student persistence remain supported without a migration. The **lecturer
fixture is intentionally static**, not a new durable LMS ingestion subsystem.
Server configuration is a deliberately small MVP provisioning mechanism, not a
role management UI. Keep web/API grants synchronized; API authorization is final.

## KPI contract

Observation time is explicit and fixed in the demo. One obligation is one enrolled
learner for one assignment, using that learner's effective deadline and latest
canonical submission timestamp. Study task completion is never an input.

- `on_time`: observed `submitted_at <= due_at`, including exact equality.
- `late`: observed `submitted_at > due_at`.
- `not_submitted`: no observed submission and `due_at <= as_of`.
- `not_yet_due`: no observed submission and `due_at > as_of`.
- `no_deadline`: excluded from the timed KPI; submission punctuality is unknown.
- A timestamp later than the observation time is not yet an observed submission.
- `due_obligations`: all obligations whose deadline has arrived, including missing
  submissions. `on_time_due` counts only their on-time submissions.
- `on_time_rate = 100 * on_time_due / due_obligations`, rounded to one decimal.
  With no matured obligations the rate is null, displayed as no due assignments.
  Early submissions for future assignments appear in counts but not the KPI yet.

Fixture `canvas-demo-ai` contains 12 fictional enrollments with two assignments:
12 matured obligations (6 on time, 3 late, 3 missing) and 12 future obligations.
Its KPI is 6/12 = 50%. This is a synthetic snapshot, not measured improvement.

## Provenance and privacy

`apps/api/src/haui_compass/api/lecturer_fixture.py` is hand-authored Canvas-shaped
synthetic fixture v1, dated 2026-10-18. It is not a Canvas export or live integration.
Observation time: 2026-10-18 05:00 UTC (12:00 UTC+7). No real names, emails, grades,
student IDs, submission bodies or individual histories are present or returned.
No before/after efficacy claim is made.

A cohort smaller than 5 is completely suppressed: no size, cell counts or KPI.
No grand total or arbitrary student/assignment filters are exposed, preventing
subtraction against suppressed cohorts in this slice. This threshold is an MVP
privacy measure, not a formal anonymity guarantee for future real datasets.
Responses are uncached at the web boundary; successful API responses use no-store.

## Local verification

Commands run from the appropriate app directory:

- API: `.venv/bin/python -m pytest -q`
- PostgreSQL: set `HAUI_COMPASS_TEST_DATABASE_URL` to the **local test database**
  from `docker-compose.postgres.yml`, then run
  `.venv/bin/python -m pytest tests/integration/postgres -q`.
- Web: `npm run typecheck`, `npm run lint`, `npm run test:config`, `npm run build`.
- Lecturer desktop/mobile:
  `PLAYWRIGHT_WEB_PORT=3124 PLAYWRIGHT_API_PORT=8124 npx playwright test --config playwright.lecturer.config.ts`
- Student regression:
  `PLAYWRIGHT_WEB_PORT=3125 PLAYWRIGHT_API_PORT=8125 npx playwright test tests/auth.spec.ts tests/weekly-cycle.spec.ts tests/documents.spec.ts tests/compass-chat.spec.ts --project desktop`

The dedicated lecturer Playwright configuration grants only the synthetic demo
account and does not alter roles in the normal Student Core Flow suite.
Integration/release preparation creates local commits only. No push, deployment, PR,
merge or production change is authorized without release approval.

### Results (2026-10-18, local)

| Check | Result |
| --- | --- |
| Complete backend suite | 1,645 passed; 20 PostgreSQL cases skipped in the unconfigured invocation |
| Separate local PostgreSQL suite | All 20 passed against the dedicated local test database |
| Lecturer Playwright | 20 passed (desktop/mobile login, authorization and KPI presentation cases) |
| Student regression Playwright | 32 passed (auth, documents, Compass Chat, weekly cycle) |
| Web config/security tests | 30 passed |
| TypeScript, ESLint, production build | Passed |
| Ruff for changed Python files; mypy for new Python modules/tests | Passed |
| Git whitespace check | Passed |

Existing deprecation warnings from Starlette/AnyIO and Alembic remain; no failed
checks remain. Browser tests use local synthetic data and local document storage,
not staging private Blob retrieval. This is not a fresh Vercel Preview certification.

## Integration release handoff

See `docs/deployment/lecturer-release-preflight.md` for the complete pending-file
inventory, Preview grants/account provisioning, migration compatibility and safe
user-run A/B/Lecturer acceptance procedure.

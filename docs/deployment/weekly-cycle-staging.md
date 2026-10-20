# Weekly cycle on staging — per-account simulated workspaces

Status: **CORE FLOW PREVIEW VERIFIED** as of 2026-10-18.

The weekly-cycle composition is deployed to the Vercel Preview for
`feat/vercel-staging-deployment` at commit `3377bbd07e1dc8f2f77f6db17585155adb2be488`:
<https://haui-compass-a5j8wfybi-nam-4b71.vercel.app/>. The API Neon database reports
`0004_simulated_workspaces`. This status applies to the simulated student Core Flow only;
it does not claim Production deployment or acceptance of unrelated document-storage work.
Decision record: [ADR-0008](../decisions/0008-per-account-simulated-workspaces.md).

## 1. Why staging had no context, assignments or deadlines

| | `haui_compass.api.demo:app` (local demo) | `haui_compass.api.main:app` (staging before) |
| --- | --- | --- |
| Data | One fictional student, seeded in memory at import | PostgreSQL, unseeded |
| `demo/context`, `demo/clock/advance`, `demo/scenarios/*` | Present | **Absent (404)** |
| LMS | Fixture `MockLMSProvider` | `MockLMSProvider.canonical` (fixed canonical students) |
| Clock | `SteppingDemoClock`, global | `SystemClock` |
| Student identity | Request body/query (trusted dev field) | Same; web proxy sent no account |
| Task-decomposition candidates | In memory | In memory (lost between Function instances) |

The web workspace loads its context only from `demo/context`, so on staging every page failed
before any plan, assignment or deadline could be shown. Deploying `demo:app` instead would have
given all accounts one shared, in-memory student, clock and reset.

## 2. What is implemented and deployed for Preview

- `HAUI_COMPASS_SIMULATED_WORKSPACES=1` composes `main:app` with per-account workspaces. Off by
  default; normal startup and the local demo are unchanged.
- The web `/compass-api/*` proxy sends `X-Compass-User` (session account id) and
  `X-Compass-Service-Key`, and refuses `internal/*` paths. It forwards only JSON bodies (any
  case or parameters, e.g. `application/JSON; charset=utf-8`), as `application/json`; any other
  body gets `415`.
- The API, in this mode, requires the key and account on every learning route, and returns
  `403 forbidden_student` for any query/body student the account does not own. Every value of a
  repeated query parameter and every `student`, `student_id`/`student_provider` and
  `student_external_id`/`source` at any depth of the body is checked. The check decodes the body
  exactly as FastAPI does; a non-empty body FastAPI would not decode as JSON (or one without a
  media type) is refused with `415` before any handler runs. Tasks, executions and candidate
  sessions are looked up under the request's (checked) student, so another account's task id is
  `404`. Fixed 2026-10-16: the check previously ran only when the media type contained the
  lowercase substring `json`, so `application/JSON` bypassed it.
- First visit seeds the account's own two-week Canvas-like fixture (5 assignments, 3 courses,
  5 tasks, no plan) anchored at Monday 09:00 (Hanoi) of the real current week. The account's
  virtual clock starts there and moves only with "Sang ngày mai" / "Sang tuần mới".
- "Đặt lại kịch bản" starts a new generation for that account only.
- The UI shows **"Dữ liệu Canvas giả lập"** next to the demo time and a staging-specific notice.
  Vietnamese is the default; no technical JSON is shown.
- Planner, risk, replanner, weekly cycle, reflection and next-week draft are reused unchanged.
- Academic imports on staging belong to the signed-in account (no shared `pilot-student`).
- Task-decomposition candidate sessions are durable in PostgreSQL.

**PLANNED / not included:** lecturer dashboard, multi-agent work, RAG changes, retention policy
for retired generations, production identity for real student data.

## 3. Configuration (names only)

FastAPI service, in addition to [vercel-staging.md](vercel-staging.md) §4:

- `HAUI_COMPASS_SIMULATED_WORKSPACES=1`
- `COMPASS_SERVICE_KEY` — required; startup fails without it in this mode.
- `HAUI_COMPASS_DATABASE_URL` — required on Vercel; startup fails without it.

Next.js service: `COMPASS_SERVICE_KEY` (same value) — already required for staging.

## 4. Migration readiness (API database)

Revisions: `0001_initial` → `0002_imported_academic_data` → `0003_weekly_goals` →
`0004_simulated_workspaces` (head). The web schema (`web`, revision 3) is unaffected.

Audit findings:

- `0003` previously built `weekly_goals` from the live ORM model. It now uses explicit DDL; a
  `pg_dump` of the resulting table is identical to before.
- `0001` creates all live-model tables except an exclusion list. The `0004` tables were added to
  that list after a fresh-database run failed with a duplicate table; a test now migrates from an
  empty database. Freezing `0001` itself is a recommended follow-up.
- `0003` and `0004` are additive: three new tables, no change to existing tables, columns,
  constraints or rows. Verified on a local database at `0002` with rows: pre-existing schema
  identical after upgrade, rows intact, `alembic check` reports no drift, downgrade to `0003`
  and to `base` succeed.
- Ownership: the API tables live in the connection's default schema (`public`); the web owns
  schema `web`. Both coexisted in one local database in the staging E2E.
- Permissions: the migration role needs `CREATE` on the API schema. The runtime role needs
  `SELECT, INSERT, UPDATE` on `simulated_workspaces` and `task_decomposition_sessions`
  (`UPDATE` is required for `SELECT … FOR UPDATE`) and `SELECT, INSERT, UPDATE` on
  `weekly_goals` plus `USAGE` on `weekly_goals_id_seq`. If one owner role is used for both, no
  grant is needed.
- Backward compatibility: the currently deployed code ignores the new tables, so migrating
  first is safe. **The new code requires `0004`**, so deploy only after the migration.
- Rollback: application rollback leaves the tables in place (harmless). Do not downgrade the
  cloud database; that would drop workspace data.

The exact SQL (`alembic upgrade 0002_imported_academic_data:head --sql`):

```sql
BEGIN;
CREATE TABLE weekly_goals (
    id SERIAL NOT NULL,
    student_id UUID NOT NULL,
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    goal_text VARCHAR(500) NOT NULL,
    target_minutes INTEGER NOT NULL,
    study_windows JSON NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_weekly_goal_scope UNIQUE (student_id, period_start, period_end),
    CONSTRAINT ck_weekly_goal_target CHECK (target_minutes >= 0)
);
CREATE INDEX ix_weekly_goals_student ON weekly_goals (student_id, period_start);
UPDATE alembic_version SET version_num='0003_weekly_goals'
  WHERE alembic_version.version_num = '0002_imported_academic_data';
CREATE TABLE simulated_workspaces (
    owner_id VARCHAR(64) NOT NULL,
    generation INTEGER NOT NULL,
    anchor TIMESTAMP WITH TIME ZONE NOT NULL,
    virtual_now TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (owner_id),
    CONSTRAINT ck_simulated_workspace_generation CHECK (generation >= 1),
    CONSTRAINT ck_simulated_workspace_clock CHECK (virtual_now >= anchor)
);
CREATE TABLE task_decomposition_sessions (
    session_id UUID NOT NULL,
    student_id UUID NOT NULL,
    session JSON NOT NULL,
    confirmation JSON,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (session_id)
);
CREATE INDEX ix_task_decomposition_sessions_student ON task_decomposition_sessions (student_id);
UPDATE alembic_version SET version_num='0004_simulated_workspaces'
  WHERE alembic_version.version_num = '0003_weekly_goals';
COMMIT;
```

The current revision of the Neon API database is **not recorded** in the repository. Confirm
it read-only before anything else (step 2 below).

## 5. Verification evidence (local, 2026-10-16)

| Check | Result |
| --- | --- |
| API `pytest` with PostgreSQL 16 (`haui_compass_test`) | 1,619 passed, 0 skipped |
| API Ruff / format / mypy (246 files) | Passed |
| Web typecheck, lint, `test:config` | Passed; 29 config tests |
| Web production build | Passed |
| Staging-equivalent Playwright (`playwright.staging.config.ts`), desktop + mobile | 2 passed |
| Existing Playwright suite (local demo API), desktop + mobile | 150 passed, 8 skipped (web-PostgreSQL-only specs), 0 failed |

Staging-equivalent stack: `next build` + `next start` (`NODE_ENV=production`), FastAPI
`main:app` with `HAUI_COMPASS_SIMULATED_WORKSPACES=1`, one PostgreSQL 16 database holding the
`web` schema (web migrations 1–3) and the API schema (Alembic head), real registration/login,
service key, no LLM credentials (offline fallbacks). Vercel Blob was **not** exercised: a
placeholder token satisfies the storage check because the weekly flow uploads nothing.

Covered by the staging E2E, per viewport:

- Student A: Plan (goal, AI breakdown + confirm, preview, approve) → Do (start, complete with
  80 minutes) → Adapt (missed sessions, busy day, preview, apply revision 2) → Reflect (review,
  confirm signals) → next week (carry-over and difficult-topic suggestions, approve).
- Student B, registered mid-week: no plan, own Monday clock, different task ids; reading A's
  history and forging A in a request body both return `403`; forging A's task execution with
  `application/json`, `application/JSON` or a charset returns `403`, `text/plain` returns `415`,
  and A's task id under B's own student returns `404`, with A's tasks unchanged; `internal/*`
  returns `403`; advancing B's clock does not move A's.
- Persistence: A signs in again and still sees the plan, reflection and next-week clock.
- Reset by B creates generation 2 for B only; A's history is unchanged.
- No raw JSON or internal identifiers in the main content.

API tests additionally cover: missing/wrong key, malformed account ids, A/B isolation in query
and body, retired-generation access, concurrent first visits (one workspace, five tasks),
candidate generation and confirmation on different instances, and fail-closed startup.

Reproduce:

```bash
docker compose -f docker-compose.postgres.yml up -d postgres-test
# create a disposable database, e.g. haui_compass_staging_e2e, then:
cd apps/web && HAUI_COMPASS_WEB_DATABASE_URL=$E2E_URL npm run db:migrate && npm run build
cd ../api && HAUI_COMPASS_DATABASE_URL=${E2E_URL/postgresql/postgresql+psycopg} .venv/bin/alembic upgrade head
cd ../web && STAGING_E2E_DATABASE_URL=$E2E_URL npx playwright test -c playwright.staging.config.ts
```

## 6. Preview acceptance evidence — 2026-10-18

The deployed Preview ran `playwright.preview.config.ts` against the immutable URL above:
**2/2 passed**, desktop in 3.7 minutes and mobile in 3.6 minutes (7.3 minutes total).

- Student A completed Plan → Do → Adapt → Reflect → next-week approval. The spec exercises
  breakdown confirmation, an 80-minute completed execution, replanning revision 2, reflection
  signals, difficult-topic carry-over, and next-week approval.
- A logout/login then showed the saved plan, reflection and virtual clock, proving persistence
  across the browser session.
- Student B began with an independent fixture and clock; cross-account history and forged body
  requests returned `403`, a borrowed task under B returned `404`, and B's reset moved only B to
  generation 2 while A's history remained available.
- A read-only Neon check reported Alembic revision `0004_simulated_workspaces`. The four newest
  workspaces (desktop and mobile A/B runs) were created within ten minutes. Their aggregate
  persisted-state fingerprints were two A workspaces with three plans, maximum revision 2, one
  completed execution, one reflection and two weekly goals, and two reset-B workspaces at
  generation 2 with no A learning records. These results confirm the Preview API used the
  migrated staging database and retained account-scoped state.

No Production deployment, migration downgrade, cloud-data reset, or document-access verification
was performed. The staging hardening report's separate API-key rotation/retention finding remains
open and is outside this Core Flow acceptance.

# Pilot validation runbook

This runbook validates user-provided fictional or authorized pilot data. It does
not imply an official HaUI integration and requires no HaUI credential.

## Disposable PostgreSQL

Docker Desktop must be running. Start only the repository's disposable services:

```bash
docker compose -f docker-compose.postgres.yml up -d postgres postgres-test
export HAUI_COMPASS_DATABASE_URL='postgresql+psycopg://haui:change-me@localhost:54329/haui_compass'
export HAUI_COMPASS_TEST_DATABASE_URL='postgresql+psycopg://haui:change-me@localhost:54330/haui_compass_test'
cd apps/api
uv run alembic upgrade head
uv run alembic current
uv run pytest tests/integration/postgres/test_postgres_academic_import.py -ra
```

The focused PostgreSQL suite covers migration constraints, normalized import,
idempotency, conflict handling, provenance, safe clear, rollback, rebuilt
composition, and the canonical HTTP learning loop. It must finish with zero
skips before a controlled thesis pilot is declared ready.

## Start the pilot composition

In one terminal, start the PostgreSQL-composed API with an explicit factory
wrapper appropriate to the host environment. The repository's ordinary API and
frontend demo remain in-memory by default, so PostgreSQL validation is performed
through the test composition above. In a second terminal:

```bash
cd apps/web
npm ci
npm run dev
```

For browser validation isolated from another local Next server, use:

```bash
CI=1 PLAYWRIGHT_WEB_PORT=3100 npm run test
```

## Canonical pilot walkthrough

1. Open **Academic Data**.
2. Import `examples/academic-import-v1.json` or `academic-import-v1.csv`, or
   enter one course and assignment manually. Deadlines entered manually are in
   the student's device timezone; the estimate is explicitly student-provided.
3. Verify the source label and imported records. They are pilot input, not
   official HaUI data.
4. Select **Create study task** for the intended assignment.
5. Use the existing learning-loop controls to create a weekly plan, receive a
   recommendation, record work, submit and confirm reflection, replan, and
   inspect history.
6. Do not clear a source that has study tasks: the API returns a typed conflict
   instead of deleting referenced academic data or learning history.

## Current validation boundary

Frontend dependency integrity, isolated Playwright, typecheck, lint, and
production build have been validated. PostgreSQL migration, durability, and
canonical HTTP validation remain pending until the local Docker daemon is
available; do not represent them as completed before the focused suite runs.

## Cleanup

After validation, remove only the disposable services created by this run:

```bash
docker compose -f docker-compose.postgres.yml down
```

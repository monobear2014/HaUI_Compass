# HaUI Compass — Vercel staging runbook

Status: `PREVIEW DEPLOYED — CORE FLOW VERIFIED` as of 2026-10-18.

The Vercel Services Preview for `feat/vercel-staging-deployment` is deployed at
<https://haui-compass-a5j8wfybi-nam-4b71.vercel.app/> from
`3377bbd07e1dc8f2f77f6db17585155adb2be488`. The simulated weekly Core Flow has passed cloud E2E
on desktop and mobile; its API database reports Alembic revision `0004_simulated_workspaces`.
This does not claim a Production deployment or acceptance of every documented storage workflow.
See [weekly-cycle-staging.md](weekly-cycle-staging.md) for the scoped acceptance evidence.

## 1. Actual architecture

```text
Browser
  └─ HTTPS staging URL
       └─ Next.js service (apps/web)
            ├─ /api/auth/*, /api/documents/*, /api/chat/*, /api/study-sets/*
            │    └─ web PostgreSQL + private Vercel Blob
            └─ /compass-api/*
                 └─ private Vercel service binding: COMPASS_API_URL
                      └─ FastAPI service (apps/api)
                           └─ API PostgreSQL + OpenAI Responses API
```

The repository uses one Vercel project with two Services:

| Service | Root | Framework | Public routing | Responsibility |
| --- | --- | --- | --- | --- |
| `web` | `apps/web` | Next.js | Catch-all frontend handled by Next.js | Auth, sessions, documents, uploads, ingestion, retrieval, chat and UI |
| `api` | `apps/api` | FastAPI | Only `/api/v1/health` is public | Learning-loop API and internal Compass generation/PDF extraction |

The `web` service declares a runtime binding to `api`, which Vercel injects as
`COMPASS_API_URL`. The Next.js routes retain ownership of their existing `/api/*` endpoints;
there is deliberately no catch-all `/api/*` rewrite to FastAPI. Internal generation and PDF
extraction use the binding plus `X-Compass-Service-Key`; the internal routes are not exposed by a
public rewrite.

Vercel Services are a Beta feature. The project Framework setting must be `Services` in addition
to having the `services` block in [`vercel.json`](../../vercel.json). See the current official
references:

- https://vercel.com/kb/guide/vercel-services
- https://vercel.com/docs/services/config-reference
- https://vercel.com/docs/functions/runtimes/python
- https://vercel.com/docs/vercel-blob/private-storage
- https://vercel.com/docs/vercel-blob/vercel-signed-urls

## 2. Configuration in the repository

`vercel.json` defines:

- `web` root `apps/web`, framework `nextjs`;
- `api` root `apps/api`, framework `fastapi`;
- FastAPI service entrypoint `src/haui_compass/api/main.py` (relative to the `apps/api` service
  root);
- web-to-api service binding in `COMPASS_API_URL`;
- a public API health rewrite followed by a catch-all web rewrite; and
- a 60-second function duration budget for the relevant web/API function patterns.

`apps/api/pyproject.toml` also declares the Python import entrypoint
`haui_compass.api.main:app`, while the Services-level entrypoint above is the concrete file path
required by the current Vercel CLI. `apps/api/.python-version` pins Python 3.12. The API package
declares its runtime dependencies in `pyproject.toml`; no `requirements.txt` is required for this
repository.

The 60-second duration is an upper request budget, not a performance claim. The web server-to-
server calls currently use a 60-second abort budget for Compass generation and the explicit LLM
timeout remains controlled by `HAUI_COMPASS_LLM_TIMEOUT_SECONDS`. Set that environment value
deliberately for staging; do not rely on a new hard-coded production default.

## 3. Vercel project setup

Use a dedicated staging/preview environment. Do not attach a custom domain, production database,
production Blob store, or real student data.

1. Authenticate the Vercel CLI or connect the Git repository from the Vercel dashboard.
2. Create or select the staging project; do not alter the current production site.
3. Set the project Framework to `Services`.
4. Confirm the project is allowed to use Vercel Services and that the account has access to the
   dedicated private Blob store.
5. Configure the environment variables below for Preview/Staging only.
6. Provision or identify the dedicated staging PostgreSQL instances before deployment.
7. Apply migrations once as a release operation; never run migrations during every Function cold
   start.
8. Deploy the current branch as a Preview/Staging deployment and record the real HTTPS URL.

If Services is unavailable to the account, stop before creating a fallback deployment. The
supported fallback is a separate Next.js Vercel project plus a separately authorized FastAPI host,
but it is not part of this repository change and must be explicitly approved and configured by the
operator.

## 4. Environment variables — names only

Set these in encrypted hosting configuration, never in committed files or browser-exposed
variables. None of the secrets below should use a `NEXT_PUBLIC_` prefix.

### Next.js service

Required for staging:

- `HAUI_COMPASS_WEB_DATABASE_URL` — dedicated web PostgreSQL URL.
- `BLOB_STORE_ID` and Vercel's runtime `VERCEL_OIDC_TOKEN`, or server-side
  `BLOB_READ_WRITE_TOKEN` for an explicitly approved synthetic verification path.
- `BLOB_WEBHOOK_PUBLIC_KEY` — Blob completion callback verification key.
- `COMPASS_API_URL` — generated by the `web` → `api` service binding; do not manually replace it
  with localhost in Vercel.
- `COMPASS_SERVICE_KEY` — same high-entropy value as the FastAPI service.
- `COMPASS_WEB_ORIGIN` — exact HTTPS staging origin when the deployment uses a trusted proxy/origin
  setup.

### FastAPI service

Required for staging:

- `HAUI_COMPASS_DATABASE_URL` — dedicated API PostgreSQL URL.
- `COMPASS_SERVICE_KEY` — same value as the web service.
- `HAUI_COMPASS_LLM_ENABLED=true`.
- `OPENAI_API_KEY`.
- `HAUI_COMPASS_LLM_MODEL`.
- `HAUI_COMPASS_LLM_BASE_URL` when using a compatible non-default endpoint.
- `HAUI_COMPASS_LLM_TIMEOUT_SECONDS` — explicit staging timeout, bounded below the Function
  duration budget.
- `HAUI_COMPASS_SIMULATED_WORKSPACES=1` — Preview/staging demo only: per-account simulated
  Canvas workspaces for the weekly cycle ([weekly-cycle-staging.md](weekly-cycle-staging.md)).

Do not set local-only `COMPASS_TEST_STORAGE`, SQLite paths, local evaluation trace paths, or demo
authentication settings in staging. The web and API database selectors fail closed when their
required PostgreSQL configuration is missing. The web service also fails closed when the Vercel
service URL is missing instead of using the local loopback default.

## 5. PostgreSQL ownership and migrations

The web and API schemas are separate and have separate migration owners:

- Web PostgreSQL: schema `web`, revisions `001_initial.sql`,
  `002_document_upload_lifecycle.sql`, and `003_document_storage_cleanup.sql`.
- FastAPI PostgreSQL: Alembic revisions currently present under
  `apps/api/alembic/versions/` are `0001_initial_persistence.py`,
  `0002_imported_academic_data.py`, `0003_weekly_goals.py` and
  `0004_simulated_workspaces.py`. `0003`/`0004` are additive and must be applied before the
  weekly-cycle code is deployed; see [weekly-cycle-staging.md](weekly-cycle-staging.md) §4.

Apply migrations from a controlled release environment with the staging URLs supplied through a
secret manager or shell environment that is not committed:

```bash
cd apps/web
HAUI_COMPASS_WEB_DATABASE_URL="$STAGING_WEB_DATABASE_URL" npm run db:migrate

cd ../api
HAUI_COMPASS_DATABASE_URL="$STAGING_API_DATABASE_URL" .venv/bin/alembic upgrade head
```

The web migration script acquires a PostgreSQL advisory lock and records applied revisions in
`web.schema_migrations`. The API Alembic environment reads `HAUI_COMPASS_DATABASE_URL` (or the
backward-compatible `DATABASE_URL`) and must be run once by the release operator. Neither
application runs migrations during Function startup.

Before applying migrations, verify TLS, database ownership/isolation, role permissions,
connection pooling, and that the target is not a production database. Use a pooled managed
connection endpoint where the provider recommends one. The web pool is intentionally limited to a
small per-instance footprint (`max: 2`).

## 6. Private Blob and document lifecycle

The cloud path is:

1. Authenticated browser sends file descriptors to `/api/documents/upload-intent`.
2. Next.js writes pending metadata and an upload intent to web PostgreSQL.
3. The server issues a pathname-scoped, PUT-only signed upload capability.
4. The browser uploads directly to the private Blob store, avoiding the Function body limit.
5. The completion callback is signature-verified and then checked against owner, intent, pathname,
   size and content type.
6. The application reads the expected private object, validates content, extracts text/PDF pages,
   creates deterministic chunks, and persists metadata/chunks/citations in PostgreSQL.
7. Authorized reads stream through the server or receive a short-lived, exact-path signed GET URL.

Supported files are `.txt`, `.md`, `.markdown`, and text-based `.pdf`, with the existing 5 MiB per-
file, three-file batch and owner quota limits. OCR is not supported. Blob deletion uses a PostgreSQL
cleanup record and bounded owner-scoped retry; database and Blob are not one atomic transaction.

Do not use public Blob access. Do not put signed URLs, Blob tokens, cookies, raw documents, or full
prompts in logs or test artifacts.

## 7. Build and deploy commands

Local repository checks:

```bash
cd apps/web
npm ci
npm run typecheck
npm run lint
npm run test:config
npm run build
```

The API service is built from `apps/api` using Python 3.12 and the dependencies in
`pyproject.toml`. With the local environment available:

```bash
cd apps/api
.venv/bin/pytest
.venv/bin/ruff check src tests
.venv/bin/mypy
```

From an authorized Vercel environment, use the installed CLI according to the project's Services
configuration. Prefer a preview/staging deploy command and verify the output URL before running
any browser smoke test. Do not use `--prod`, do not add a custom domain, and do not force-push a
branch to trigger deployment.

## 8. Cloud smoke test checklist

Run only with a synthetic staging account, synthetic TXT/Markdown/PDF fixtures, and dedicated
staging resources. Record status codes, request IDs, retrieval/generation/end-to-end timings, and
failure codes without recording private content or bearer capabilities.

### Positive flow

- [ ] Open the real HTTPS staging URL.
- [ ] Register/login with a synthetic account; confirm the session survives a refresh.
- [ ] Create a Study Set and upload a small TXT file.
- [ ] Confirm the browser uploads to the private Blob host, not through a multipart Next.js body.
- [ ] Confirm the document reaches `ready` and chunks are persisted in web PostgreSQL.
- [ ] Ask a factual question and verify a grounded answer with a citation.
- [ ] Click the citation and verify authorized source navigation.
- [ ] Upload Markdown and verify retrieval.
- [ ] Upload a text PDF with multiple pages and verify page-aware extraction and citations.
- [ ] Ask a PDF-grounded question and verify the cited page.
- [ ] Send a follow-up, refresh, logout/login, and verify chat history remains.
- [ ] Redeploy the same staging environment and verify users, documents, chunks, chats and progress
  remain present.
- [ ] Repeat the critical path at a mobile viewport.

### Negative/security flow

- [ ] Anonymous document request is rejected.
- [ ] Cross-user document, chunk, progress and chat requests are rejected without disclosure.
- [ ] Wrong/missing internal service key returns `403`.
- [ ] Forged upload completion, wrong pathname, wrong intent and repeated callback are rejected or
  handled idempotently.
- [ ] Unsupported, oversized and corrupt files are rejected without leaving an ingesting orphan.
- [ ] Expired signed GET URL is rejected; a newly authorized page receives a new URL.
- [ ] LLM timeout/provider failure returns an operational error or safe abstention, never a
  fabricated success.

Do not inject destructive failures into a shared staging resource. Cleanup synthetic objects and
rows after the evidence is captured.

## 9. Observability evidence

Capture only aggregate/safe metadata:

- HTTP status distribution;
- retrieval, generation and end-to-end latency with sample count;
- upload/ingestion/provider/database failure codes;
- request IDs; and
- deployment/build identifier.

The repository does not currently contain enough cloud samples to report p50/p95. Do not invent
latency values or call this load certification. Local evaluation traces are opt-in development
artifacts and are not a substitute for cloud observability.

## 10. Rollback

### Application rollback

Use Vercel's deployment rollback or redeploy the last known-good staging deployment. Verify the
web/API service pair and environment bindings after rollback.

### Database rollback

Application rollback does not roll back PostgreSQL schema or data. The migrations in this milestone
are intended to be forward-compatible with the application sequence; use a reviewed, explicit
forward migration for schema repair. Do not drop the staging database or manually delete tables as
an application rollback step.

### Blob rollback

Blob objects have their own lifecycle. Restore the application first, then inspect pending/failed
cleanup records and object ownership before any deletion. Never delete by an unverified storage key
and never use rollback as a reason to delete user documents.

## 11. Troubleshooting

| Symptom | Checks |
| --- | --- |
| Services are ignored | Project Framework is `Services`, `vercel.json` has `services`, and both service roots exist. |
| Web gets API unavailable | Inspect binding injection for `COMPASS_API_URL`, exact service name `api`, shared `COMPASS_SERVICE_KEY`, and FastAPI logs. |
| FastAPI fails at import | Confirm Python 3.12, `pyproject.toml` dependencies, and `tool.vercel.entrypoint = haui_compass.api.main:app`. |
| Web refuses to start | Confirm `HAUI_COMPASS_WEB_DATABASE_URL` and private Blob credentials are configured for the same environment. |
| API refuses to start | Confirm `HAUI_COMPASS_DATABASE_URL`; apply API Alembic migrations once. |
| Upload falls back/rejects | Confirm web PostgreSQL, private Blob, `BLOB_WEBHOOK_PUBLIC_KEY`, and direct-upload route configuration. |
| PDF ingestion fails | Confirm FastAPI internal route, service key, pypdf dependency, request duration and text-based PDF input. |
| Data disappears after redeploy | Stop the test and inspect environment/database identity; staging must not use SQLite, local files or an ephemeral database. |

## 12. Current evidence and remaining limitations

Verified locally in this repository:

- Vercel Services JSON contract tests: passed.
- Web TypeScript, ESLint and production build: passed.
- Web config/contract tests: 23 passed.
- Web PostgreSQL and private-storage contract implementation is present; the configured local
  PostgreSQL Docker evidence remains separate from a managed-cloud claim.
- API PostgreSQL composition and Alembic configuration are present.
- Local API runtime tests require the repository `.venv`; current code does not claim cloud API
  execution from this document.

Not verified in this workspace:

- Vercel CLI installation/authentication, project access, Services entitlement or project settings.
- Managed staging PostgreSQL connectivity, TLS, permissions or redeploy persistence.
- Real private Vercel Blob upload/read/signed-URL/expiry/delete behavior.
- Real OpenAI request through the staging deployment.
- Real HTTPS browser E2E, mobile E2E, cross-user security checks or latency percentiles.

The correct handoff state remains:

`DEPLOYMENT READY — EXTERNAL ACTION REQUIRED`

It must not be upgraded to `STAGING DEPLOYED — VERIFIED` until the real HTTPS, managed database,
private Blob, live OpenAI, persistence-after-redeploy and security smoke evidence are recorded.

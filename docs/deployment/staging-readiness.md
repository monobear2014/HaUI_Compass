# HaUI Compass staging readiness audit

Audit date: 2026-10-11

Base commit: `98f010e` (`main`)
Scope: read-only deployment readiness review; this document does not claim a deployment.

Historical note: this audit describes the pre-private-Blob implementation observed on 2026-10-11.
The repository-side gaps it records were subsequently addressed on this branch. The current
deployment configuration, architecture and external verification state are maintained in
[vercel-staging.md](vercel-staging.md); this file is retained as the historical baseline.

## Summary

The current repository is not ready for a persistence-backed public staging deployment. The application runs locally as separate Next.js and FastAPI processes, but the user-facing Compass workflow is not composed over the existing PostgreSQL persistence layer. Authentication, uploaded raw files, extracted chunks, study progress, and chat history use local Node SQLite files. The FastAPI default runtime uses in-memory repositories for the learning-loop APIs. Those stores are unsuitable as durable state across serverless instances or redeploys.

Vercel Services are currently documented as supporting separate services in one project, including Python/FastAPI and Next.js with shared-domain routing and generated service URLs. This makes the requested topology plausible in principle, subject to a real account/project build. Vercel's Python runtime is documented as Beta. Its functions impose a 4.5 MB request/response payload limit; the current upload limit is 5 MiB per file and the browser sends files through a Next.js route, so the existing upload path exceeds that limit even before multipart overhead. Direct-to-object-storage upload is required unless the configured limit is reduced below the function limit.

## Request and persistence traces

### Browser → Next.js → FastAPI → LLM

1. Browser requests are served by Next.js. Protected-page checks in `apps/web/src/proxy.ts` read the session from the local auth database.
2. Compass chat routes authorize the cookie and resolve the active document in Next.js, retrieve chunks through the local SQLite document store, then call FastAPI's internal `/api/v1/internal/compass/answer` endpoint.
3. PDF extraction similarly calls FastAPI's `/api/v1/internal/compass/extract-pdf` endpoint.
4. Both server-to-server calls use `COMPASS_SERVICE_KEY`; the key is read only in server-side modules and sent in `X-Compass-Service-Key`. The current default API URL is `http://127.0.0.1:8000`.
5. FastAPI's internal Compass endpoint checks `COMPASS_SERVICE_KEY`. The LLM is opt-in via `HAUI_COMPASS_LLM_ENABLED`, `OPENAI_API_KEY`, `HAUI_COMPASS_LLM_MODEL`, and `HAUI_COMPASS_LLM_TIMEOUT_SECONDS` (default 8 seconds in code; `.env.example` documents 30 seconds).

### Browser upload → raw file → extraction → chunks

1. The browser sends multipart uploads to `POST /api/documents` on Next.js.
2. Next.js checks the session, same-origin request, aggregate body bound, extension, size, and content. The current per-file limit is 5 MiB and a batch can contain 3 files.
3. TXT/Markdown and PDF bytes are stored in the `content` BLOB column of `.demo-auth/documents.sqlite` (or `COMPASS_STORAGE_DIR`). PDF bytes are sent to FastAPI for text extraction. Extracted content, chunks, document metadata/status, chat state, and progress are held in local SQLite tables.
4. Owner and document relationships are enforced in application SQL queries. No object-storage adapter or persistent remote storage path exists.

## Deployment dependencies and gaps

| Concern | Current state | Staging implication |
| --- | --- | --- |
| Web runtime | Next.js 16 app in `apps/web`; Node engine >=22.13; no Vercel config found | A Vercel web service is plausible; build/deployment has not been exercised. |
| API runtime | FastAPI app exported as `app` from `haui_compass.api.main`; Python >=3.12; dependencies in `apps/api/pyproject.toml` | Vercel can discover a Python ASGI app, but monorepo service root/entrypoint and package install need explicit configuration and a real build. |
| API default persistence | `build_runtime_container()` resolves in-memory task, plan, execution, and reflection repositories | State is per process and does not survive instance replacement/redeploy. |
| PostgreSQL | SQLAlchemy/psycopg PostgreSQL composition and Alembic migrations exist for academic/learning-loop persistence | This is not currently wired into the default runtime and does not store the Compass auth/doc/chat state. `DATABASE_URL` is fallback for `HAUI_COMPASS_DATABASE_URL`; production composition must be explicit. |
| Migration | Alembic config exists under `apps/api/alembic.ini` | A documented, single-run release migration command is needed; migration must not run on every cold start. |
| Authentication | Users, sessions, and failed-login counters in `accounts.sqlite`; demo account is enabled outside production and can be opted into production with `COMPASS_DEMO_AUTH=1` | SQLite state is not shared/durable. Production/staging must explicitly disable demo auth, and a shared persistent auth store is required. |
| Session cookie | `compass_session`; HttpOnly, SameSite=Lax, Path=/; Secure derives from HTTPS Origin | HTTPS staging is compatible, but secure behavior should be driven by deployment URL/proxy semantics and tested on actual HTTPS. No cookie Domain is set, which is appropriate for a single shared domain. |
| Document/chat storage | `documents.sqlite` stores bytes, chunks, study progress, sessions/messages | Not durable or shared across serverless instances. Must move metadata/chunks/auth/chat to PostgreSQL and raw bytes to private object storage, or use another durable shared backing store. |
| Upload size | `MAX_DOCUMENT_BYTES = 5 * 1024 * 1024`; route proxies the full multipart body through Next.js | Exceeds Vercel Function's documented 4.5 MB body limit. Requires authenticated direct upload to private Blob/object storage and a backend-verified document/key binding. |
| PDF extraction | FastAPI internal endpoint, 20-second web timeout; text PDFs only; local OCR absent | OCR remains unsupported. Current upload-to-web then extraction call can exceed platform body limits. |
| API URL | `COMPASS_API_URL` optional, defaults to loopback in PDF, chat, and API proxy routes | Must be configured to a service URL/path or supported Vercel binding; service routing and private communication should be verified in the project. |
| Service key | Required by internal FastAPI Compass routes; server-side env only | Keep only in server environment. Verify missing/wrong key behavior and ensure it is absent from client bundles after deployment. |
| CORS | No CORS middleware found; browser-facing API proxy routes through Next.js | Shared-domain routing can avoid browser CORS. If API is exposed on another origin, add a narrow explicit allowlist rather than wildcard credentialed CORS. |
| Health | FastAPI `/api/v1/health` returns `{"status":"ok"}` without checking database readiness; no web health route found | Add minimal web health and API readiness diagnostics; avoid exposing config/secrets and do not call OpenAI. |
| Logging | Compass provider failures log a stable code; optional evaluation traces append to a configured local file | Local trace files are not suitable for serverless persistence. Production logs must avoid prompts/private document content and include request-level timings only where supported. |
| Timeouts | Internal answer request has 60s timeout; PDF extraction 20s; LLM default is 8s in code but `.env.example` has 30s | Align explicit staging timeout and Vercel function duration. Do not treat local benchmark timeout as a universal optimum. |
| Local-only references | Playwright/local API use `127.0.0.1`; Compass API default also uses it; storage defaults to `.demo-auth` | Local defaults must remain local-only and staging must fail clearly if deployment URLs/required secrets are absent. |
| Deployment config | No `vercel.json`, Dockerfile, or Compose deployment stack found (only PostgreSQL test compose) | Need configuration validated against current Vercel schema; no deployment has been attempted. |

## Current official platform documentation checked

- [Vercel Services routing and communication](https://vercel.com/docs/services/routing): services use route prefixes and can receive generated server-side and relative client-side service URLs.
- [The Complete Guide to Vercel Services](https://vercel.com/kb/guide/vercel-services): describes a single project with independently built Next.js and FastAPI services, routing, bindings, and per-service configuration.
- [Vercel Python runtime](https://vercel.com/docs/functions/runtimes/python): Python runtime is Beta; Python 3.12–3.14 are documented; FastAPI/ASGI apps are supported.
- [Vercel Function limitations](https://vercel.com/docs/functions/limitations): maximum request and response body is 4.5 MB.
- [Vercel Blob server uploads](https://vercel.com/docs/vercel-blob/server-upload): larger uploads should use client uploads because of the same 4.5 MB function body limit.
- [Postgres on Vercel](https://vercel.com/docs/postgres) and [Marketplace storage](https://vercel.com/docs/marketplace-storage): Vercel Postgres is no longer a new product; providers such as Neon are offered through Marketplace integrations.

Documentation was checked on 2026-10-11. The exact account feature availability, service configuration, limits, billing, and storage integrations remain unverified until an authenticated Vercel project is available.

## Recommended sequence and blockers

1. Establish a server-side staging environment contract, including required service URL/key, database URL, auth secret/config, LLM settings, and private object storage credentials.
2. Wire a durable PostgreSQL composition for the Compass/auth/document/chat data while retaining existing transaction and ownership invariants. Do not silently route staging into the in-memory runtime.
3. Add an object-storage boundary for raw uploaded bytes and move upload to a secure direct-to-Blob flow because the current file-size allowance exceeds Vercel's request-body limit.
4. Add Vercel service entrypoints/configuration for `apps/web` and `apps/api`, route FastAPI under a stable prefix, and configure environment variables without exposing server secrets to the browser.
5. Add readiness diagnostics, staging security checks, and the deployment runbook before attempting a real deploy.
6. Deploy only after authenticated access and dedicated staging PostgreSQL/object storage are available. Run migrations once as a controlled release step.

At audit time, the Vercel account, managed staging database, and object-storage credentials were not verified. The current deployment status is therefore **not deployed**.

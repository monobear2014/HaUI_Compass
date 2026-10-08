# Trợ lý Compass

## Repository inspection and implementation boundary

- Web: Next.js App Router, React state, CSS modules, existing cream/white/pastel design.
- Authentication: existing opaque `compass_session` cookie; persistent users/sessions in Node SQLite. Mutation routes enforce the existing same-origin guard.
- Uploads: authenticated Next.js routes persist per-owner bytes/metadata in `documents.sqlite`. Each `/study-set/{documentId}` currently represents one document, not a multi-document study-set entity.
- Learning API: FastAPI modular monolith; SQLAlchemy/PostgreSQL/Alembic support the planning domain. Its demo endpoints are shared fixtures, not the source of authenticated private uploads.
- Existing knowledge: manifest ingestion, bounded lexical retrieval, `QueryKnowledge`, strict Responses API adapter, backend-issued citation handles and fail-closed citation validation. These remain available at `/api/v1/knowledge/query`.
- Tests: pytest/ruff/mypy; Playwright desktop/mobile, TypeScript, ESLint and Next build.

Private ingestion, retrieval and chat persistence therefore extend the existing Next.js backend/database. Generation reuses FastAPI's LLM adapter and the shared `GroundedAnswerService`/citation validator. No authentication replacement, second document store, vector database or new production service was added.

## Running with a real LLM

Use the existing backend LLM configuration:

```sh
# FastAPI process environment
HAUI_COMPASS_LLM_ENABLED=true
OPENAI_API_KEY=<your-server-only-key>
HAUI_COMPASS_LLM_MODEL=gpt-5-mini-2025-08-07
HAUI_COMPASS_LLM_TIMEOUT_SECONDS=30
COMPASS_SERVICE_KEY=<random-shared-server-secret>
```

Set `COMPASS_SERVICE_KEY` to the same value in the Next.js server environment, and set `COMPASS_API_URL` to that FastAPI server. Generate a secret with `python3 -c 'import secrets; print(secrets.token_urlsafe(32))'`. Restart both processes after changing their environments. No credentials are sent to the browser.

The internal generation endpoint rejects requests when the shared key is absent or wrong. The existing public proxy does not forward this key. An unconfigured/failed LLM returns an operational error with a retryable, persisted user turn; it never silently substitutes a mock AI answer. No-evidence questions produce a persisted refusal without calling the LLM.

## Storage and migrations

The existing `documents.sqlite` is extended automatically on first database access. This follows its current versioned SQLite initialization mechanism rather than applying the planning-domain Alembic migrations to a different database.

- Migration 001 adds `documents.ingestion_status`, `document_chunks`, `chat_sessions`, `chat_messages`, `message_citations`, indexes and real foreign keys; it backfills old TXT/Markdown uploads. Failed backfills retain `failed` status and emit an ID-only error log.
- Migration 002 adds the generation request ID, including for workspaces that already applied 001.
- Migration 003 adds a distinct token per lease acquisition; retrying the same request ID cannot allow an expired worker to commit or fail the replacement attempt.
- Each migration runs under `BEGIN IMMEDIATE`, records its version in `document_schema_migrations`, and is idempotent. Existing bytes, progress and authentication remain intact.
- New TXT, MD and `.markdown` uploads synchronously persist ordered, overlapping chunks (~3,000 characters). Markdown headings and original text offsets are retained; fenced-code headings are ignored. Unsupported PDF ingestion is explicit while the existing PDF reader still works. Invalid/empty/unsupported uploads return clear errors.
- A session's `study_set_id` references its source document. This matches the repository's current one-document study set. Retrieval can later implement another `DocumentRetriever` without changing the chat routes.
- The session lease plus `(session_id, request_id, role)` uniqueness makes concurrent sends and retry-after-lost-response safe. A 120-second lease allows recovery after a crashed worker; a stale worker cannot commit over a newer turn.

## API

Public routes use the existing authenticated web session:

| Route | Behavior |
| --- | --- |
| `POST /api/study-sets/{id}/chat/sessions` | Create session; existing sessions are retained |
| `GET /api/study-sets/{id}/chat/sessions` | Most recent 100 sessions for this owner/set |
| `GET /api/chat/sessions/{id}/messages` | Restore messages with persisted citations |
| `POST /api/chat/sessions/{id}/messages` | `{message, active_document_id?, request_id}`; returns messages, assistant message and citations |
| `GET /api/documents/{id}/chunks/{chunkId}` | Authorized exact source excerpt for citation navigation |

`request_id` is a UUID generated once by the client and reused for retry. The default active document is the session's source. Unknown, cross-owner and cross-set IDs return 404 without metadata or message writes. Session/document ownership is enforced in retrieval and citation persistence, independently of the prompt.

`POST /api/v1/internal/compass/answer` is server-to-server only, protected by `X-Compass-Service-Key`. It accepts at most six authorized chunks and eight recent conversation turns. Document content and chat history are serialized as untrusted input, separately from system instructions. History helps resolve follow-ups but does not count as evidence. Citation IDs come from the backend and are validated against exactly the supplied chunks.

## Retrieval and UX

Lexical ranking scopes the SQL query by owner/document before reading chunks, rejects absent named anchors and excludes low-overlap results. Summary/explanation/quiz quick actions sample bounded chunks across the document; summaries of long files cover those excerpts, not every page. General Q&A has no web search or shared demo-corpus fallback. This lexical MVP does not guarantee semantic recall for synonyms.

Desktop shows a 350px right panel; mobile uses the native modal dialog with focus trapping and Escape support. History selection is stored in the page's `chat` query parameter and checked on the server when refreshing. Citation buttons fetch and display the exact persisted chunk, scroll/focus its highlighted source card, and select its matching topic where available. The source card retains precise offsets for a future richer reader.

## Verification

The quantitative retrieval and grounded-generation benchmark is documented in
[Compass Assistant RAG Evaluation Harness v1](../evaluation/compass-rag-eval-v1.md).
Its offline mode uses the production chunking/ranking core; live mode exercises the
complete upload-to-persisted-answer path without changing product behavior.

```sh
cd apps/api
uv run --extra dev pytest
uv run --extra dev ruff check src tests
uv run --extra dev mypy

cd ../web
npm run typecheck
npm run lint
npm run build
PLAYWRIGHT_USE_BUILD=1 PLAYWRIGHT_WEB_PORT=3300 npm test
```

Playwright starts the real Next.js server and FastAPI fixture on port 8005 (override with `PLAYWRIGHT_API_PORT`). Only the external LLM transport is deterministic; routes, adapter serialization, validation, auth, ingestion, retrieval and persistence are real. Browser tests use `.playwright-data`, separate from user `.demo-auth` data. Real-provider quality requires manual checking with a configured API key.

Manual acceptance: login → upload TXT/MD → open Study Set → summarize/ask/follow up → click source → reload → create new conversation → switch back. Ask an absent topic and verify no citations. Try another account's document/session IDs and verify 404.

## Intentionally deferred

PDF text extraction/OCR, embeddings/hybrid retrieval, multi-document study-set mode, full flashcard workflows, voice, agents and web search.

## Production-readiness verification

The original implementation-only results have been superseded by the verification in
[compass-assistant-verification.md](compass-assistant-verification.md), which includes
real OpenAI requests, PostgreSQL, migrations, attack tests and browser regression tests.

The well-known `demo` account is disabled by default in production, including existing
sessions. For an explicitly local presentation using `npm run start`, set
`COMPASS_DEMO_AUTH=1` in the web process. Playwright opts into this explicitly. Do not
set this variable on a public deployment. Ordinary registered accounts remain enabled.

Repeat the real-provider smoke test after building the web app:

```sh
apps/api/.venv/bin/python scripts/verify_compass_live.py --env-file .env
```

This command reads credentials without printing them, uses the production web build,
starts the existing API on loopback, and stores test accounts/documents separately in
`apps/web/.playwright-data`. It temporarily enables the provider, creates an ephemeral
shared service key, and stops its processes when done. The production `.env` is not changed.
Results are written to `artifacts/compass-verification/live-results.json`.

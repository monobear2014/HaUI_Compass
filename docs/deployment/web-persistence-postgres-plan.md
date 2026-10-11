# Web persistence migration plan

Current inventory for `apps/web` (verified on 2026-10-11). This is a migration map, not a claim that the web workflow is PostgreSQL-backed yet.

## Data map

| Data model | Current table / fields | Repository or service | Affected routes / pages | PostgreSQL target |
| --- | --- | --- | --- | --- |
| User account | `users(id, username, name, salt, password_hash)` | `demo-auth.ts`: registration, lookup, password verification | `/api/auth/[action]`, `proxy.ts`, authenticated server pages | `web.users`; unique normalized `username`; preserve scrypt hash and opaque UUID ID. |
| Login throttling | `failed_logins(username, attempted_at)` | `demo-auth.ts`: count and expiry cleanup | `/api/auth/[action]` login | `web.failed_logins`; timestamp with index; use a transaction/advisory row strategy so concurrent login attempts cannot bypass the threshold. |
| Session | `sessions(token_hash, user_id, expires_at)` | `demo-auth.ts`: create, lookup, revoke, expiry cleanup | `/api/auth/[action]`, `proxy.ts`, server pages | `web.sessions`; FK to users, expiry index; continue storing only SHA-256 token digest. |
| Study Set / document | There is no Study Set table. Each uploaded document row is also the Study Set ID: `documents(id, owner, name, kind, size, created_at, headings, content, hash, ingestion_status)` | `document-store.ts`: save/list/find/delete; `document-retriever.ts` | `/api/documents`, `/api/documents/[id]`, `/api/study-sets/[id]/chat/sessions`, `/study-set/[id]`, `/documents/[id]`, `/learn`, `/onboarding/ready` | `web.documents`; FK `owner → web.users`; unique `(owner, content_hash)`; replace embedded raw `content` bytes with an opaque `storage_key` and retain metadata/ingestion state. Do not invent multi-document Study Sets as part of this migration. |
| Document chunks | `document_chunks(id, document_id, content, chunk_index, heading, start_offset, end_offset, created_at, page_number)` | `migrations/001-compass-chat.ts:ingestDocument`; `document-retriever.ts` | upload ingestion, Compass chat, chunk citation route, document page | `web.document_chunks`; FK document; unique `(document_id, chunk_index)`; preserve offsets and nullable page number. Keep the current lexical retrieval strategy. |
| Study progress | `document_study_progress(owner, document_id, covered, mastered, updated_at)` | `document-store.ts` | `/api/documents/[id]/progress`, `/learn`, `/study-set/[id]` | `web.document_study_progress`; FK to owner/document; JSONB or normalized topic rows after evaluating current API shape; preserve owner and document checks. |
| Chat session and generation lease | `chat_sessions(id, study_set_id, owner, title, created_at, updated_at, generating_until, generating_request, generating_token)` | `compass-chat-store.ts`: create/list/authorize/begin/fail/finish | `/api/study-sets/[id]/chat/sessions`, `/api/chat/sessions/[id]/messages`, Compass UI | `web.chat_sessions`; FK owner/document; `timestamptz` lease deadline; keep request ID and random lease token for fencing. |
| Chat message | `chat_messages(id, session_id, role, content, created_at, request_id, status)` | `compass-chat-store.ts`; `compass-chat.ts` | message GET/POST and study-set server page | `web.chat_messages`; FK session; unique `(session_id, request_id, role)`; retain pending/failed/answered lifecycle and add an identity sequence for stable insertion order. |
| Citation | `message_citations(id, message_id, chunk_id, citation_index)` | `compass-chat-store.ts:finishTurn/getChatMessages` | message GET, `/api/documents/[id]/chunks/[chunkId]`, citation navigation | `web.message_citations`; FKs to message and chunk; unique `(message_id, citation_index)`; transactionally validate chunk ownership/document before insertion. |
| Schema version | `document_schema_migrations(version)` | `migrations/001` through `004` | database initialization in `documentDatabase()` | Dedicated Alembic-independent web migration history in schema `web` (or a web migration table); migrations run once as a controlled command, never during a serverless cold start. |

The FastAPI PostgreSQL tables live in the existing default schema and belong to that service's learning-loop composition. The web migration should use a separate `web` schema and its own migration history so table names, ownership, and migration cadence cannot silently collide with API migrations.

## SQLite-specific behavior to replace

- `?` bind markers become PostgreSQL `$1`, `$2`, … (or the chosen driver's parameter convention).
- `INSERT OR IGNORE` in demo seeding becomes `INSERT … ON CONFLICT DO NOTHING`.
- `ON CONFLICT … DO UPDATE` for progress is portable in shape; parameter syntax and returned row shape still change.
- `.run().changes` becomes PostgreSQL `rowCount` / `RETURNING`; no current call uses `last_insert_rowid()`.
- `rowid` ordering in session/message lists must become explicit stable order. Add an identity sequence for insertion order; UUIDs alone do not preserve chronological order.
- `BEGIN IMMEDIATE` is SQLite's database-wide write serialization. PostgreSQL must use explicit transactions and row locks/conditional `UPDATE … RETURNING` for per-session generation leases, not a process mutex.
- `db.isTransaction` becomes explicit transaction state in the adapter. Each concurrent operation must use one checked-out Pool client from BEGIN through COMMIT/ROLLBACK.
- `PRAGMA foreign_keys`, `busy_timeout`, and filesystem permissions have no PostgreSQL equivalent; use database FK constraints, bounded connection-pool settings/timeouts, and managed-secret controls.
- Dates are currently ISO strings or millisecond epoch integers. Use `timestamptz` consistently; compare lease deadlines in SQL or convert using one documented UTC convention.
- `substr(content, 1, 500)` can become `left(content, 500)`. JSON is currently serialized text; either keep validated text or migrate deliberately to JSONB and normalize driver-decoded values at the adapter boundary.
- `BEGIN/COMMIT/ROLLBACK` boundaries currently wrap upload batches, schema backfills, and chat turn completion. Keep each corresponding PostgreSQL operation atomic; do not hold a DB transaction open while calling object storage, PDF extraction, or the LLM.

## Safe migration sequence

1. Add a web-specific schema and versioned, forward-only migrations for the current metadata/chunk/chat/auth tables. Keep FastAPI/Alembic ownership unchanged.
2. Add a PostgreSQL Pool adapter and make repository/service operations async while preserving their return contracts and owner checks. Local SQLite remains a development/test adapter; set a strict production selector that errors if `HAUI_COMPASS_WEB_DATABASE_URL` is absent.
3. Add the object-storage abstraction and `storage_key`; for a new staging DB, create the schema empty and use synthetic documents. Do not copy or delete local databases.
4. Verify migration from an empty PostgreSQL DB, uniqueness/FKs, chat lease fencing, citation ownership, retries, and persistence after a fresh process. Run migrations only from the documented release command.
5. Keep the existing SQLite suite as a regression suite and add PostgreSQL integration coverage against an isolated test DB. Passing SQLite tests alone does not establish PostgreSQL correctness.

## Scope observations

- The current `/study-set/{documentId}` contract represents one uploaded document as one study set; no independent `study_sets` entity exists.
- Raw uploaded bytes are in SQLite `documents.content` today. The local `.demo-auth` directory is not durable serverless storage.
- Current repository functions are synchronous because `node:sqlite` is synchronous. A PostgreSQL driver is asynchronous, so the conversion must propagate `async`/`await` through route handlers, server-rendered pages, proxy/session lookups, and tests. A fake synchronous PostgreSQL facade would compromise concurrency and is not appropriate.
- User ownership is mostly enforced by repository predicates and service checks; current schema lacks a direct `users` foreign key on `documents.owner`. The web PostgreSQL schema should enforce the relationship without weakening 404 behavior for cross-user access.

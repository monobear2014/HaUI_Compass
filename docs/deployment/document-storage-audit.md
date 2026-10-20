# HaUI Compass document storage audit

Status: IMPLEMENTED audit for the cloud-storage milestone (2026-10-12).

## Executive summary

The browser currently sends a `multipart/form-data` request to `POST /api/documents`.
The route authenticates the session, checks same-origin, bounds the request body, and hands
`File` objects to `saveDocuments`. Text is decoded and chunked in the Next.js process. PDFs are
sent to the internal FastAPI extraction endpoint; the returned page metadata is chunked locally.
PostgreSQL stores document metadata, chunks, citations, progress, and a `storage_key`, but the
current PostgreSQL implementation writes and reads the raw bytes through
`src/lib/document-file-storage.ts`, which is a local filesystem adapter. That adapter is not
persistent across serverless instances.

The local SQLite path is intentionally different: it stores the legacy raw bytes in the
`documents.content` BLOB and uses the same process-local database directory for metadata and
chunks. SQLite is development-only and is fail-closed when PostgreSQL is selected.

## Current trace

```text
DocumentUpload
  -> POST /api/documents (same-origin session cookie, multipart body)
  -> saveDocuments(owner, File[])
  -> validate extension/size/UTF-8 or PDF signature
  -> PDF: FastAPI /internal/compass/extract-pdf
  -> text/PDF pages: deterministic chunking
  -> SQLite content BLOB + chunks
     or PostgreSQL metadata/storage_key + local document-content file + chunks
  -> document reader / Compass chat / citation endpoints
```

The reader authorizes the current owner before rendering text or returning
`GET /api/documents/:id`. PDF citations retain `page_number`; citation clicks navigate to
`/documents/:id?page=N`, while the embedded PDF currently uses the same authenticated API route.
Document deletion removes owner-scoped chat/progress/chunks and then attempts local content
cleanup. PostgreSQL and the local storage delete are not one atomic transaction.

## Boundary inventory

| Boundary | Current behavior | Persistence/security risk | Milestone action |
| --- | --- | --- | --- |
| Raw bytes | SQLite BLOB locally; PostgreSQL `storage_key` plus local file | Local files disappear or diverge across instances | Storage adapter with local and private Vercel Blob implementations |
| Object identity | `documents/<document UUID>` | Predictable keys and replacement semantics are coupled to the document row | Opaque document/upload UUID path; never use the original filename as identity |
| Upload | Entire multipart body reaches the Next.js function | Function bandwidth/body limits; no direct browser upload | Authenticated upload intent and scoped presigned private Blob PUT |
| Completion | `saveDocuments` performs persistence and ingestion in one request | Browser cannot safely prove an uploaded object; incomplete cloud upload has no durable state | Pending upload record and trusted/idempotent Blob completion callback plus reconciliation |
| Content validation | Extension, declared file metadata, PDF magic, UTF-8 and FastAPI extraction | Direct uploads must validate actual object bytes before ingestion | Read/head the expected object server-side, then reuse existing validators |
| Ingestion | Chunking in web process; PDF extraction through FastAPI | Must not assume a persistent local path or `/tmp` survives | Read a bounded private stream and ingest in the same durable workflow |
| PostgreSQL | Stores metadata/chunks/citations and `storage_key`; schema has no upload-attempt table | Cross-system DB/blob updates cannot be atomic | Add explicit upload lifecycle and cleanup/retry state |
| Delivery | Owner check, then function returns bytes from local file/SQLite | Private cloud object cannot be exposed as permanent public URL; large response may hit function limits | Authorized short-lived signed GET for cloud PDF delivery; local route remains for dev |
| Deletion | DB transaction followed by best-effort filesystem delete | Delete failure is only logged; cloud orphan is not recoverable | Record cleanup failure/retry policy and never cross owner boundaries |
| Retry | Same content hash is idempotent; failed ingestion can be retried | Direct-upload attempt identity and stale callbacks are not represented | Fence attempts with an intent ID and compare the expected object pathname |

## Existing limits and compatibility constraints

- `MAX_DOCUMENT_BYTES` is 5 MiB per file and `MAX_DOCUMENT_FILES` is 3.
- Per-owner demo storage is bounded at 100 documents or 50 MiB.
- Supported names are `.pdf`, `.txt`, `.md`, and `.markdown`.
- Text is strict UTF-8 and rejects control characters. Markdown headings are explicit source
  headings; no semantic headings are generated.
- PDF extraction is bounded by the FastAPI worker to 200 pages and 1,000,000 extracted
  characters. Image-only, empty, or encrypted PDFs remain explicitly unsupported; OCR is out of
  scope.
- Existing chat retrieval, citation validation, page metadata, ownership checks, and refusal
  behavior must remain unchanged.

## Vercel Blob decisions

The repository uses `@vercel/blob` 2.8.1. The current Vercel documentation describes private
storage as authenticated on reads and recommends `get(..., { access: 'private' })` for server
delivery. It also provides signed URLs through `issueSignedToken` + `presignUrl`, and a
presigned-browser-upload flow through `handleUploadPresigned` and `uploadPresigned`.

The implementation will use:

1. a private store only;
2. server-side authorization before issuing an upload delegation;
3. a pathname scoped to one pending upload, with `put` only, allowed MIME types, the existing
   5 MiB limit, and overwrite disabled;
4. the SDK-verified completion callback, with an authenticated status/reconciliation path for
   callback failure; and
5. a short-lived, object-scoped signed GET URL for browser PDF delivery. The URL is a bearer
   capability and will not be stored as document identity or logged.

Vercel OIDC (`BLOB_STORE_ID` plus the runtime OIDC token) is preferred on Vercel; a
`BLOB_READ_WRITE_TOKEN` is supported for non-Vercel/server-side operations and local synthetic
verification. Staging/production will fail closed if the private Blob configuration is absent.

## Legacy and non-goals

The SQLite `documents.content` BLOB path remains for local development compatibility. This
milestone does not migrate existing local databases, introduce a queue, OCR, embeddings, hybrid
retrieval, or a new study-plan feature. Real private-Blob verification requires user-provided
credentials and is reported separately from mock/contract verification.

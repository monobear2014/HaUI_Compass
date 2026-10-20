# Cloud document storage handoff

Status: IMPLEMENTED — CLOUD VERIFICATION PENDING (2026-10-12).

This milestone is implemented on `feat/vercel-staging-deployment`. It does not deploy Vercel
services or staging. A real private Blob store and managed-cloud verification credentials were
not available in this workspace, so the cloud claim remains pending.

## Architecture

```text
Browser
  ├─ local/dev: multipart POST /api/documents
  │              -> local SQLite metadata + local file adapter
  └─ PostgreSQL + private Blob:
       POST /api/documents/upload-intent
       -> pending document + upload intent in PostgreSQL
       -> scoped presigned private Blob PUT
       -> verified Blob completion callback / status reconciliation
       -> private object read, validation, PDF extraction, deterministic chunking
       -> PostgreSQL chunks and citations

Authorized reader
  ├─ text: server-rendered validated text
  └─ PDF/cloud object: short-lived object-scoped signed GET URL
                     (API stream remains as an authorized fallback)
```

`apps/web/src/lib/document-file-storage.ts` owns the storage interface. The local adapter uses
mode-0600 files below `COMPASS_STORAGE_DIR` (or the test/demo directory). The Vercel adapter uses
`@vercel/blob` with `access: "private"` for every write and read. Application code does not pass
browser auth state to the storage adapter.

PostgreSQL stores document metadata, `storage_key`, chunks, citations, progress, upload intents,
and cleanup tasks. It never stores raw document bytes. SQLite retains its legacy `content` BLOB
only for local development compatibility.

## Required environment

`apps/web/.env.example` is the source of the variable names.

Required in staging/production:

- `HAUI_COMPASS_WEB_DATABASE_URL`: managed PostgreSQL connection string.
- `BLOB_STORE_ID`: the connected private Vercel Blob store identifier when using Vercel OIDC.
- Vercel's short-lived `VERCEL_OIDC_TOKEN`, supplied by the connected project; do not copy it
  into source control or expose it to the browser.
- `BLOB_WEBHOOK_PUBLIC_KEY`: public key used by `handleUploadPresigned` to verify completion
  callbacks.

`BLOB_READ_WRITE_TOKEN` can be used for non-Vercel/server-side synthetic verification. It is
server-only and must never be prefixed with `NEXT_PUBLIC_`. The SDK supports OIDC first when the
Vercel connection is present.

The storage and database configuration is fail-closed when `NODE_ENV=production` or `VERCEL=1`
and the corresponding configuration is absent. `COMPASS_TEST_STORAGE=1` is an explicit local
test-harness exception used by Playwright's production-auth test; it is not a staging setting.

## Upload authorization and limits

The browser first posts only file descriptors to `/api/documents/upload-intent`. The server checks
the session, same-origin, extension, declared content type, file size, file count, owner quota,
and PostgreSQL mode. It creates a pending document and a pending upload intent.

The returned pathname is generated from UUIDs:

```text
documents/<document-uuid>/<upload-uuid>.<extension>
```

The original filename is metadata only. `POST /api/documents/upload` uses
`handleUploadPresigned`. Before issuing a token, it verifies the authenticated owner, intent,
pathname, expiry, and pending state. The token is restricted to:

- the one expected pathname;
- `put` only;
- the expected MIME type;
- the existing 5 MiB maximum size;
- no overwrite; and
- a short validity window (at most 10 minutes, bounded by the 15-minute intent TTL).

The existing limits remain unchanged: at most three files per batch, 5 MiB per file, and 100
documents or 50 MiB per owner. Supported extensions are `.pdf`, `.txt`, `.md`, and
`.markdown`.

## Durable lifecycle

PostgreSQL migration revisions:

1. Existing metadata/chunk/chat persistence.
2. `document_upload_intents` and upload states.
3. `document_storage_cleanup` retry records.

An upload moves through:

```text
pending -> uploaded -> ingesting -> ready
                         └───────> failed
pending -> expired
```

The Vercel Blob callback is signature-verified by the SDK. Application completion additionally
checks the trusted token payload, expected pathname, owner/document binding, object size, object
content type, and intent expiry. Duplicate callbacks are idempotent; a second worker cannot claim
an `ingesting` intent. If the callback cannot reach the application, the authenticated status
route checks only the pathname already stored in PostgreSQL and reconciles it. Failed ingestion
can be retried with the owner-scoped retry endpoint while the intent is still valid.

Actual bytes are read from the expected private object before extraction. Text is strict UTF-8
with control-character checks. PDFs retain the existing FastAPI/pypdf extraction behavior,
including page numbers, the 200-page/1,000,000-character bounds, and explicit no-OCR behavior.

## Delivery and citations

`GET /api/documents/:id` authenticates the session and owner before streaming. In PostgreSQL mode,
the stream comes from the private storage adapter; it is not buffered into a response body first.
For the browser PDF viewer, the server component performs the same owner/document lookup and
issues a signed GET URL scoped to the exact private pathname for five minutes. The signed URL is
not stored as document identity, is not logged, and is regenerated on page reload.

The signed URL is a bearer capability during its short validity period. It is therefore passed
only to the authorized page's PDF iframe/link. It is never returned from the upload-intent route.

Citation clicks continue to use the existing chunk authorization and page navigation. PDF
`page_number`, heading metadata, chunk ordering, document IDs, and refusal behavior are unchanged.

## Deletion and cleanup

PostgreSQL deletion first records a cleanup task in the same transaction as the metadata delete,
then attempts Blob deletion. A Blob failure marks the task `failed` with an attempt count and
does not pretend cleanup completed. The owner-scoped cleanup retry route can retry a pending or
failed task. No cleanup query accepts a storage key without also checking the owner/task ID.

PostgreSQL and Blob do not participate in one atomic transaction. The cleanup table and bounded
retry path are the reconciliation policy for this milestone; no distributed queue is introduced.

## Manual private-cloud verification

Run this only with a synthetic account/file and a dedicated private test store/database:

1. Connect a private Blob store to the Vercel project and configure the variables above.
2. Apply migrations with `HAUI_COMPASS_WEB_DATABASE_URL=... npm run db:migrate` from `apps/web`.
3. Start the web app with the PostgreSQL URL and server-only Blob variables.
4. Register a synthetic user and upload a small `.txt`, `.md`, and text PDF through the browser.
5. Confirm the browser's upload request goes to the Blob host, not through the Next.js multipart route.
6. Confirm `web.documents` contains metadata and `storage_key`, while no raw byte column exists.
7. Confirm the intent reaches `ready`, chunks have correct order, and PDF chunks retain page
   numbers.
8. Open the document in a fresh browser context, click a citation, and verify owner isolation.
9. Request the signed URL after its expiry and verify it is rejected; reload the page to obtain a
   new URL.
10. Delete the document, verify the private object is gone, and verify the cleanup task is
    `deleted`. Simulate or observe a delete failure, then exercise the owner-scoped retry.
11. Remove all test rows/objects after verification.

Do not use a real student document or a shared production store. Do not claim `CLOUD VERIFIED`
from mocks or the PostgreSQL-only suite.

## Verification recorded for this handoff

- Storage/config/security contract tests: passed locally.
- PostgreSQL Docker web suite: passed against the test database after revisions 1–3.
- API pytest: 1,577 passed, 14 PostgreSQL API tests skipped because the API PostgreSQL URL was
  not configured.
- Web TypeScript, ESLint, production build, and full local Playwright regression: passed; the full
  regression was 154 tests with 146 passed and 8 skipped. The focused production-auth test passed
  on desktop/mobile, and the focused mobile rapid-citation test also passed.
- Real Vercel Blob upload/read/delete: NOT VERIFIED; no Blob credentials were present.

## Known limitations

- Existing local SQLite databases are not automatically migrated to cloud objects.
- Callback reconciliation is request-driven; a permanently unreachable callback needs an
  operator/client retry or a future scheduled reconciler.
- The current 5 MiB application limit remains intentionally conservative. Larger files and
  multipart uploads are not enabled by this milestone.
- OCR, embeddings, hybrid retrieval, distributed queues, and staging deployment remain out of
  scope.

References: [Vercel Blob](https://vercel.com/docs/vercel-blob), [private storage](https://vercel.com/docs/vercel-blob/private-storage), [presigned client uploads](https://vercel.com/docs/vercel-blob/client-upload), and [Vercel signed URLs](https://vercel.com/docs/vercel-blob/vercel-signed-urls).

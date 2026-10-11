# Web PostgreSQL persistence verification

The Next.js persistence selector uses SQLite only for local development. Setting
`HAUI_COMPASS_WEB_DATABASE_URL` routes auth, documents/study sets, chunks, Compass
chat/citations and study progress to the `web` PostgreSQL schema. Production and
Vercel fail closed when this URL is absent.

Raw document bytes are not stored in PostgreSQL. `web.documents.storage_key` is an
opaque reference; the current file adapter is intentionally local until the
separate object-storage milestone. This means the PostgreSQL records are ready for
a later storage adapter, but a serverless staging upload is not durable across
instances yet.

## Isolated integration check

Do not run this procedure against a user, staging or production database.

```bash
docker compose -f docker-compose.postgres.yml up -d postgres-test
cd apps/web
HAUI_COMPASS_WEB_DATABASE_URL=postgresql://haui:change-me@127.0.0.1:54330/haui_compass_test npm run test:postgres
```

The command applies `migrations/postgres/001_initial.sql` transactionally and runs
`tests/postgres-persistence.spec.ts`. It verifies:

- owner-scoped document/study-set list and lookup;
- metadata, ordered chunks, headings and PDF page numbers;
- persistence through a new PostgreSQL connection;
- concurrent progress updates;
- whole-transaction rollback and ingestion failure status without orphan chunks;
- deletion cascades for chunks and progress;
- persisted chat history and citation-to-chunk linkage;
- cross-user denial; and
- concurrent generation, expired lease and old-worker attempt fencing.

The normal `npm test` remains the SQLite parity and desktop/mobile regression suite.
If Docker/PostgreSQL is unavailable, report PostgreSQL as **NOT VERIFIED** even when
all static, SQLite and build checks pass.

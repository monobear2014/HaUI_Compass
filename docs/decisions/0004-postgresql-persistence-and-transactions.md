# ADR-0004: PostgreSQL Persistence and Transactions

## Status

Accepted (2026-09-27) on `feat/postgres-persistence`.

## Decision

PostgreSQL is the durable store because the application needs relational ownership,
append-only facts, revision constraints, indexes, and real transactions. SQLite is not
used as a compatibility substitute: its locking, type, and concurrency semantics would
not validate the production adapter.

The existing synchronous application contracts use synchronous SQLAlchemy 2.x with the
`psycopg` driver. Infrastructure owns SQLAlchemy models, sessions, mappings, and Alembic;
domain, engines, application ports, and API DTOs remain library-independent. Models are
relational and map explicitly to immutable domain/application records. Durations are exact
integer seconds; timestamps are `TIMESTAMP WITH TIME ZONE` and normalized to UTC; stable
enum values are strings with database check constraints.

Alembic owns schema evolution. Application startup never creates or migrates tables. A
small application transaction port wraps the execution append plus task snapshot update;
the PostgreSQL implementation uses one session transaction and the in-memory implementation
uses rollback snapshots for equivalent tests.

Plan revisions are append-only. A scope/revision unique constraint, unique non-root parent,
and row locking of the latest revision make two writers from one baseline race-safe. The
loser receives `STALE_PLAN_REVISION`. Execution record IDs are unique; on a uniqueness race,
the adapter reloads and compares semantic content before returning idempotently or raising
`RECORD_CONFLICT`.

Repository contract tests are shared by memory and PostgreSQL adapters. LMS-owned courses,
assignments, and submission status are not persisted here. Destructive deletes and production
backup/retention policy remain out of scope.

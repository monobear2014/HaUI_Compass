# ADR-0002: Persistence Ownership and Plan Revisions

- Status: Accepted
- Date: 2026-09-27

## Context

HaUI Compass now has a deterministic PLAN → DO → REFLECT → ADAPT core, but its use cases still
receive and return all state explicitly. The next boundary must preserve student-owned facts and
plan history without making domain entities aware of databases or making LMS-owned academic data
a second source of truth.

Introducing PostgreSQL, an ORM, migrations, or a generic repository framework before repository
semantics are proven would couple storage choices to contracts that are still being discovered.
Adaptive replanning also makes overwrite-oriented plan storage unsafe: the baseline, revised plan,
and typed reason for each revision must remain auditable.

## Decision

### Ownership

The LMS remains authoritative for courses, assignments, deadlines, and submission status. HaUI
Compass does not create `CourseRepository` or `AssignmentRepository` in v0 and does not persist
LMS records as a second authoritative copy. A later sync/cache design must preserve provider
identity and freshness explicitly.

HaUI Compass owns and persists only state created by its learning loop:

- tasks, associated explicitly with a student at the application boundary;
- task-execution facts;
- generated study plans and their revision history;
- typed adaptive-replanning audit results; and
- confirmed reflection signals.

Candidate reflection signals are proposals, not confirmed facts, and are not persisted by this
foundation. Replanning audit is stored with the resulting plan revision rather than through a
separate repository, because both share one lifecycle and must not become inconsistent.

### Ports and adapters

Narrow, use-case-oriented repository protocols live in `application/ports`, the consuming layer.
They do not inherit from a generic repository and expose no generic CRUD, query language, session,
or ORM type. Implementations live in `infrastructure/persistence`.

The first implementations are deterministic in-memory adapters. They hold typed immutable
objects, perform no serialization, filesystem access, database access, randomness, or clock read,
and expose deterministic ordering. Timestamps and typed record identifiers are supplied by the
application/caller.

### Explicit ownership envelopes

`Task` and `TaskExecution` do not contain `student_id`. Persistence therefore uses immutable
application-level records carrying explicit student ownership. Ownership is never inferred from
an assignment, course, or UUID. Record identifiers remain persistence/application concepts and do
not modify the pure domain entities.

Execution records receive an explicit typed identity. Retrying the same identity with identical
content is idempotent; reusing it for different content is rejected. This prevents an accidental
duplicate from becoming indistinguishable from a genuinely repeated sitting while leaving the
domain execution fact unchanged.

Only `ConfirmedReflectionSignals` are stored. Their existing student, period, confirmation time,
and typed signals provide provenance; the persistence envelope adds only record identity and save
time.

### Append-only study-plan revisions

`StudyPlan` remains a pure planning result without persistence identity. `StoredStudyPlan` is an
application-level envelope containing a typed record id, the plan, a monotonically increasing
revision number, an optional parent record id, save time, and an optional typed
`ReplanningResult`.

- Revision 1 is an initial plan with no parent or replanning audit.
- A later revision points to the exact baseline record and carries the complete typed replanning
  result whose `revised_plan` equals the stored plan.
- Saving never overwrites or deletes an earlier revision.
- Latest and history lookups are scoped by exact student and `PlanPeriod`.
- Exact retries by record id are idempotent; conflicting reuse is rejected.

`save_revision(baseline_record_id=...)` rejects a baseline that is no longer the latest revision
for its student and period. This is a small sequential stale-write guard and deliberately shapes
the future PostgreSQL contract around an expected baseline. It is not full optimistic locking.

### Time and errors

Repositories never read wall-clock time. Application use cases obtain `saved_at` from `Clock`
exactly once, or callers supply an explicit timestamp to a port operation.

One typed persistence error with a small error-code enum represents not-found, record-conflict,
ownership-conflict, plan-scope-mismatch, and stale-plan-revision conditions. Database-specific
exceptions must not cross the adapter boundary later.

## Alternatives considered

1. **Add repositories for every domain type.** Rejected: it duplicates LMS ownership and invents
   storage needs not required by current workflows.
2. **Put `save`/`load` on domain entities.** Rejected: it reverses ADR-0001 dependencies and makes
   pure domain types persistence-aware.
3. **Store plan snapshots or audits as JSON/pickle.** Rejected: it discards typed contracts and
   makes future migrations opaque.
4. **Add plan identity directly to `StudyPlan`.** Rejected: revision identity belongs to storage;
   identical pure plans may be produced and stored in different histories.
5. **Overwrite the current plan.** Rejected: it loses the baseline and cannot explain adaptive
   changes later.
6. **Introduce SQLAlchemy/PostgreSQL now.** Rejected: repository semantics can be proven without
   committing to schema and transaction design.
7. **Add a generic `BaseRepository[T]` or unit-of-work abstraction.** Rejected for v0: the ports
   have different append, revision, ownership, and idempotency semantics. A unit of work should be
   introduced only with a real multi-repository transaction requirement.

## Consequences

Positive:

- Domain and engines remain persistence-free.
- Current workflow state has explicit ownership and durable-contract semantics.
- Baseline and revised plans remain auditable and independently retrievable.
- Contract tests can be reused by a later PostgreSQL adapter.
- A stale-baseline condition is visible instead of silently creating a forked latest plan.

Negative:

- Application-level envelope types and mapping code are added.
- In-memory state disappears on process restart and is not production persistence.
- Exact-period lookup requires callers to retain the same `PlanPeriod` value.
- There is no transaction spanning task, execution, reflection, and plan repositories.
- The in-memory stale check is not thread-safe and provides no cross-process concurrency safety.

## Follow-up

- A later PostgreSQL adapter will implement the same ports and run the same repository contracts.
- PostgreSQL schema, migrations, transaction boundaries, retention, deletion, and authorization
  require separate design work.
- LMS caching/synchronization, if introduced, must remain distinct from authoritative
  student-owned persistence.

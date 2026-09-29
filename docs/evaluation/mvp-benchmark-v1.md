# MVP Benchmark v1

## Purpose

MVP Benchmark v1 is a deterministic engineering benchmark for the implemented
HaUI Compass learning loop. It measures contract behaviour, not educational
outcomes or model quality. Every case uses fictional data, explicit UTC time,
stable identifiers, and exact structured expectations.

## Scope

The benchmark covers the implemented weekly planner, rule-based risk assessment,
next-best-action ordering, execution transitions/idempotency, structured
reflection confirmation, adaptive replanning, append-only plan history and the
in-memory HTTP boundary. It also measures local process latency for the HTTP
operations under a fixed fixture.

The frontend acceptance set is the existing Playwright suite: Today loads,
recommendation renders, execution records, weekly plan renders, reflection
candidates/confirmation work, replan renders and history retains revisions.

## Dataset and golden expectations

`evals/datasets/mvp-v1.json` is the versioned case manifest. It contains only
fictional scenario metadata and exact expected fields such as risk level,
recommended task id, unplanned reason, plan revision and change reason. Typed
Python fixtures in `evals/mvp_benchmark_v1.py` supply the actual domain objects;
JSON is deliberately not used to reconstruct domain entities.

## Metrics

- **Work conservation:** for every applicable plan/replan case, scheduled
  effort plus explicitly unplanned effort equals explicit remaining work. Target
  0 violations.
- **Deadline safety:** StudyBlocks ending after their assignment deadline.
  Target 0.
- **Window safety:** StudyBlocks outside declared study windows. Target 0.
- **Block overlap:** overlapping StudyBlocks. Target 0.
- **Determinism:** repeated and shuffled-equivalent inputs with structurally
  equal output. Target 100% of eligible cases.
- **Churn:** the factual replanning summary fields preserved/removed/added
  future blocks, moved duration and newly unplanned duration. No weighted
  stability score is derived.
- **Reflection safety:** candidates confirmed without explicit selection, or
  persisted signals not in the generated candidate set. Target 0.
- **Unknown-data safety:** cases where missing capacity/effort becomes a known
  value or fabricated certainty. Target 0.
- **HTTP E2E success rate:** successful complete loops / attempts from fresh,
  isolated in-memory state. The report gives the exact small sample size rather
  than inferring production reliability.

## Local latency method

The runner creates a fresh, isolated in-process FastAPI application for every
full loop, calls representative endpoints through `TestClient`, and records
elapsed monotonic time for each named operation. It first performs three
isolated warmup loops; warmup measurements are discarded. The default local run
then collects 100 samples per required endpoint (the CLI rejects a sample count
below 50). In-memory and PostgreSQL samples are never mixed.

For every endpoint, the report contains `n`, min, p50, p95, p99 and max. The
single percentile definition is **nearest rank**: for sorted `n` samples and
percentile `p`, select the one-indexed rank `ceil(p * n)` (with p50 = 0.50,
p95 = 0.95 and p99 = 0.99). The runner validates empty/out-of-range inputs so
the calculation cannot silently fall back to a library default.

Results are labeled **LOCAL DEVELOPMENT BENCHMARK**; they include no network,
authentication, production server or production-reliability claim.

## PostgreSQL configuration

When `HAUI_COMPASS_TEST_DATABASE_URL` points at a real disposable PostgreSQL
test database, the runner runs Alembic to `head` and truncates only the known
benchmark tables before every loop. It then executes the same corpus and full
HTTP PLAN → RECOMMEND → EXECUTE → REFLECT → CONFIRM → REPLAN → HISTORY loop
against PostgreSQL. It verifies append-only revision 1/2 history, execution and
confirmed-reflection survival through a newly composed PostgreSQL session,
completed-task recommendation safety, conservation, deadline, overlap and
unconfirmed-signal invariants, plus three isolated deterministic repeats.

It never substitutes SQLite. If PostgreSQL/Docker is unavailable, the report
records `NOT_RUN` with the blocking reason; in-memory numbers remain separate.

## Recorded baseline

The completed local PostgreSQL baseline is recorded in the ignored generated
report for commit `4dbf3fd`:

- structured corpus: **36/36** passed;
- isolated in-memory HTTP loops: **5/5** passed;
- isolated PostgreSQL HTTP loops: **5/5** passed after Alembic reached `head`;
- PostgreSQL work-conservation, deadline, overlap, reflection, revision,
  completed-task and restart-persistence invariant violations: **0**;
- PostgreSQL deterministic isolated outcomes: **3/3** stable; and
- frontend Playwright acceptance: **12/12** passed.

These are local engineering-validation results using fictional data and a
disposable real PostgreSQL service. They do not establish production
reliability, production-scale performance, or student-outcome effectiveness.

## Not evaluated

This benchmark does not validate real HaUI LMS data quality, real student
outcomes, production-scale latency, long-term behavioural adaptation, real LLM
or RAG quality, authentication/authorization, lecturer effectiveness, browser
visual quality, or backup/retention operations.

## Reproduction

```bash
cd apps/api
uv run --extra dev python ../../evals/mvp_benchmark_v1.py \
  --output ../../artifacts/evals/mvp-v1
```

For the real PostgreSQL section, first start the disposable `postgres-test`
service from the repository root and export its URL:

```bash
docker compose -f docker-compose.postgres.yml up -d postgres-test
export HAUI_COMPASS_TEST_DATABASE_URL='postgresql+psycopg://haui:change-me@localhost:54330/haui_compass_test'
cd apps/api
uv run --extra dev python ../../evals/mvp_benchmark_v1.py \
  --output ../../artifacts/evals/mvp-v1
```

The generated `summary.json` and `report.md` include dataset version, Git commit,
environment, pass/fail accounting, invariant totals, determinism, latency,
failure details and the exact command. Generated artifacts are intentionally
ignored by Git because latency and execution duration are measurements, not a
source baseline.

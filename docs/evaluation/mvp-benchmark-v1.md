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

The runner creates a fresh in-process FastAPI application for every measured
loop, calls representative endpoints through `TestClient`, and records elapsed
monotonic time for each operation. p50, p95 and p99 use a nearest-rank percentile
over the recorded local samples. Results are labeled **LOCAL DEVELOPMENT
BENCHMARK**; they include no network, authentication, production server or real
database claim. In-memory and PostgreSQL configurations are kept separate.

## PostgreSQL configuration

When `HAUI_COMPASS_TEST_DATABASE_URL` points at a real PostgreSQL test database,
the runner may emit a separate PostgreSQL section after Alembic migration and
isolation. It never substitutes SQLite. If PostgreSQL is unavailable, the report
records `NOT_RUN` with the blocking reason; in-memory numbers remain separate.

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

The generated `summary.json` and `report.md` include dataset version, Git commit,
environment, pass/fail accounting, invariant totals, determinism, latency,
failure details and the exact command. Generated artifacts are intentionally
ignored by Git because latency and execution duration are measurements, not a
source baseline.

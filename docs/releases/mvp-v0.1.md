# HaUI Compass MVP v0.1

## Product flow

Plan → Do → Reflect → Adapt

## Implemented

- StudentState v0
- RiskEngine v0
- NextBestAction v0
- LMS boundary / Mock LMS
- Daily Recommendation
- Execution Tracking
- Structured Reflection
- Weekly Planner
- Adaptive Replanning
- Persistence Foundation
- PostgreSQL persistence
- FastAPI API
- Complete Learning Loop API
- Frontend MVP
- MVP Benchmark v1

## Evidence

MVP Benchmark v1 uses fictional data and a real disposable PostgreSQL service.
The ignored generated report records the following local baseline for commit
`4dbf3fd`:

- 36/36 structured benchmark cases passed.
- In-memory E2E: 5/5 isolated loops passed.
- PostgreSQL E2E: 5/5 isolated loops passed.
- Frontend acceptance: 12/12 Playwright tests passed.
- PostgreSQL invariant violations: 0.
- PostgreSQL determinism: 3/3 isolated equivalent outcomes were stable.
- Final backend gate: 1451 passed, 10 PostgreSQL-dependent tests skipped after
  the disposable database was removed.
- The real PostgreSQL benchmark migrated Alembic to `head`; no SQLite
  substitution was used.

These results are local development evidence only. They do not establish
production reliability or real student learning outcomes.

## Known limitations

- Mock LMS only.
- Development demo/trusted request identity only.
- No real authentication or authorization.
- No real HaUI LMS integration.
- No RAG or course-material Q&A.
- No lecturer dashboard.
- No real student outcome validation.
- No production-scale load evidence.
- No production deployment hardening.

## Next milestone

Pilot-readiness.

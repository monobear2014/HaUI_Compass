# Council Technical Evidence — v0.5

**Status:** IMPLEMENTED, development-only evidence.
**Verification date:** 2026-10-05 (working tree before milestone commit).

## Architecture

HaUI Compass is a modular monolith: a Next.js workspace calls FastAPI adapters, which compose
application use cases and pure deterministic engines. Application-owned ports isolate adapters.

```text
Web workspace → FastAPI routes → application use cases → deterministic engines
                                      │
                                      ├─ candidate session + explicit confirmation
                                      └─ OpenAI Responses adapter / template fallback
```

Risk, Next Best Action ordering, Weekly Planner, Adaptive Replanner and the 25% slack heuristic
remain deterministic. The optional OpenAI adapter only receives bounded factual inputs and returns
strict-schema language output; it cannot mutate a decision payload. Provider candidates are
untrusted and ephemeral until server validation and a user selection pass the existing
task-creation use case. See ADR-0005 and ADR-0006.

## Automated checks

Final verification record: **2026-10-05, working tree immediately before the v0.5 commit**.
Counts are evidence for that run, not a permanent reliability metric.

| Boundary | Command | Evidence |
| --- | --- | --- |
| Backend | `cd apps/api && uv run --extra dev pytest` | **1532 passed, 14 skipped** (all skips require a real PostgreSQL test URL); domain, API, provider and reset behavior. |
| Python quality | `ruff check .`, `ruff format --check .`, `mypy` | PASS; 203 Python files formatted and 200 source files type-checked. |
| Offline LLM capabilities | `uv run --extra dev python ../../evals/llm_capabilities_v1.py` | **28/28 passed**, 20 fictional decomposition plus 8 fictional explanation cases; 28 deterministic-fallback executions; no network. |
| Frontend | `cd apps/web && npm run typecheck && npm run lint && npm run build && CI=1 PLAYWRIGHT_WEB_PORT=3100 npm test` | PASS; production build and **20/20** Playwright cases. Port 3100 avoided an occupied 3000 without terminating another process. |
| Repository hygiene | `git diff --check` and secret scan | PASS in the final verification pass. |

## AI safeguards

- Strict JSON Schema is requested at the provider boundary, followed by authoritative application
  validation.
- Timeout, provider failure and invalid output fall back to deterministic templates.
- Provider keys stay at the server composition boundary and never enter browser configuration.
- Candidate confirmation is the only candidate-to-task transition.
- AI has no mutation path into Risk, NBA ordering, Planner or Replanner.
- Decision evidence stays separately visible from natural-language text.
- `evals/llm_capabilities_v1.py` records only fictional case metadata: capability, model ID,
  case ID, provider/fallback status, validation result, latency and failure category—never keys.

## Limitations

- All demo and evaluation data are fictional; no real student input is used.
- There is no authentication, real LMS, production telemetry/retry policy or durable demo store.
- No predictive-ML, student-outcome or general model-quality claim is made.
- The 25% slack heuristic is transparent MVP policy, not an outcome-validated threshold.
- PostgreSQL evidence is **NOT RUN** unless a real `HAUI_COMPASS_TEST_DATABASE_URL` is supplied;
  no SQLite substitute is used.
- Live evaluation is only run with explicit `--live` and valid credentials. Otherwise report it as
  **NOT RUN**, never as mocked live evidence.

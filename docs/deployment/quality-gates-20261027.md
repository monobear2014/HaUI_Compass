# Local quality gates — 2026-10-27

Scope: strict Python typing, GitHub Actions CI, isolated PostgreSQL validation,
web regression/build checks, and cleanup of two empty nested repositories.
The work starts from `72f017f` on `fix/quality-gates-ci`.

## Changes

- Restore strict mypy checks for persisted ticket details, document conversation
  turns/citations, OCR test fixtures, and API/PostgreSQL test helper signatures.
- Update authentication, account menu, course selection and companion handoff
  assertions to match the current unified assistant. Handoff and memory-use facts
  are checked through the persisted response instead of retired UI diagnostics.
- Generate Next.js route types before standalone TypeScript checks. A clean
  GitHub runner initially failed on missing `RouteContext` because local builds
  had already generated these types; `next typegen && tsc --noEmit` fixes that
  checkout-order dependency.
- Add `.github/workflows/ci.yml` for pushes and pull requests. The API job runs
  Ruff, formatting, mypy and pytest with an isolated PostgreSQL 16 service. The web
  job runs config tests, ESLint, TypeScript, production build, PostgreSQL browser
  tests and the full desktop/mobile Playwright suite. No cloud credentials are used.
- Move the empty `HaUI_Compass/` and `HaUI_Compass 00-33-30-648/` nested repositories
  into macOS Trash. They contained no source, commits or Git objects; they can be
  restored through Finder.

## Verified results

| Check | Result |
| --- | --- |
| API pytest including real PostgreSQL | 1,745 passed, zero skipped |
| Strict mypy | Passed, 294 files |
| Ruff / format | Passed, 304 files formatted |
| Web config/security tests | 43 passed |
| Web PostgreSQL browser tests | 4 passed |
| Production-build PostgreSQL account/preferences, desktop + mobile | 4 passed |
| Web ESLint / TypeScript | Passed |
| Next.js optimized production build | Passed |
| Python lockfile check | Passed |
| GitHub Actions workflow syntax (actionlint) | Passed |
| Full E2E suite on GitHub Actions | Failed; all preceding web checks passed |

## E2E outcome and release boundary

The full CI command completed on code commit `29dac20`:
[GitHub Actions run 40453741704](https://github.com/monobear2014/HaUI_Compass/actions/runs/40453741704).
The API job succeeded. The web job passed dependency installation, config tests,
ESLint, standalone type checking, optimized build and PostgreSQL tests, then failed
at `npm test`. This branch does **not** establish a green E2E release gate and has
not been merged into `main`.

The local full-suite attempt used the repository's normal 45-second timeout, not
the earlier exploratory 15-second override. Before it was stopped after unusually
long browser/teardown delays, its reporter recorded **131 passed, 82 failed,
12 skipped, 1 interrupted and 8 not run** out of 234 cases. The attempt is incomplete;
the completed CI run is the authoritative full-suite outcome. Its detailed counts
were not available through the unauthenticated GitHub logs API, so no CI pass/fail
counts are inferred from the local attempt.

Confirmed stale expectations include the retired document-only chat panel and its
session picker, the old ready-page heading, the old course selector and showcase
copy. Other local failures include API expectations and browser timeouts; they
have not all been diagnosed and must not all be labeled stale selectors or
confirmed product defects. Existing API authorization/persistence successes do not
replace the failing browser workflows.

Remaining work to make the release gate green: migrate retired UI assertions to
the unified assistant/roadmap, investigate the remaining API and browser failures,
then rerun the unchanged full suite and the complete staging workflow. The bounded
account/preferences production-stack checks above passed; the earlier complete
staging-workflow attempt was interrupted after failures and is not counted as a
full staging pass.

All implementation commits were pushed to `fix/quality-gates-ci`. The disposable
local PostgreSQL container was stopped and removed after validation; its synthetic
test database was discarded. The two empty nested repositories remain recoverable
from macOS Trash.

PostgreSQL runs use a newly created local container with synthetic credentials
and a disposable test database. API migration, rollback and truncation tests run
against that database only. Web migrations reached revision 6 and web persistence,
failed-ingestion rollback and chat attempt fencing passed.

The production build is a local optimized build, not a cloud deployment or a
validation of live Production environment variables. Tests use fictional users,
documents and provider fixtures; no live model-quality claim is made.

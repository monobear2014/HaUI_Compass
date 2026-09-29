# Frontend MVP validation

Validation date: 2026-09-29. Branch: `feat/frontend-mvp`.

## Scope

Independently written development workspace inspired by the product structure
audited in [IntelliPlan UI Reference](intelliplan-ui-reference.md). No reference
HTML, CSS, JavaScript, icon paths, images, fonts or branding were copied. The
read-only `.references/` tree was not edited or staged.

## Executed checks

- TypeScript strict checking, ESLint and Next.js production build: passed.
- Twelve Chromium tests: passed at desktop 1280×900 and mobile 390×844.
- Real browser → Next.js proxy → FastAPI → existing use-case loop: partial
  execution, factual/self-reported reflection candidates, unchecked selection,
  confirmation of only one selected ID, explicit remaining-effort replan and
  revision-history expansion.
- Execution failure retains input; exact retry sends identical body/record ID.
- Editing reflection while a request is pending discards stale candidate results.
- Loading, API failure/retry, no recommendation, no plan/history and horizontal
  overflow checks: passed on both viewport sizes. Empty/error test cases use
  explicit browser response fixtures; the primary learning loop uses the real API.
- Backend regression: 1,447 passed; 10 PostgreSQL tests skipped because no real
  PostgreSQL test URL was configured for this frontend validation. This report
  does **not** claim renewed PostgreSQL validation or SQLite substitution.
- Backend Ruff lint/format and strict mypy: passed.
- npm production dependency audit: zero reported vulnerabilities at check time.

## Visual inspection

Ran the frontend locally against the opt-in demo on port 8001; port 8000 was
already occupied and its service was left untouched. Viewed full-page screenshots
of Today, Weekly Plan, Reflect and History at both required viewport sizes.
Screenshots are reproducible under ignored `apps/web/test-results/` using `npm test`.

The review resulted in two presentation fixes: day-card status badges now occupy
a separate row so task titles remain readable; sub-minute study blocks display
`<1 min` and second-precision times instead of misleading `0 min`/identical clocks.
The development indicator is disabled so it does not cover workspace content.

Desktop keeps a persistent narrow sidebar and prominent next action with secondary
context. Mobile uses four visible top destinations and one-column panels/forms.
No drag/drop, invented risk, autonomous reflection confirmation or chat UI was added.
Accessibility checks are limited to implemented semantic labels, native dialog,
keyboard focus styles and observed layout; no certified audit is claimed.

## Limitations and handoff

See [web README](../../apps/web/README.md) for commands and precise data boundaries.
This is a fictional in-memory development composition, not authenticated LMS or
PostgreSQL-backed frontend deployment. Demo data resets on API restart. Reflection
is informational in v0; change-review detail is session-local while plan snapshots
remain in the API's memory. Safari/Firefox are not validated in this report.

The API feature was locally integrated into `dev` with authorized merge `ebb8015`
before this frontend branch was created. The frontend branch has not been merged
or pushed.

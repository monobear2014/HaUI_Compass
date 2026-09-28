# HaUI Compass web MVP

**IMPLEMENTED, development-only:** Next.js/React/TypeScript workspace with Today,
Weekly Plan, Reflect, and History. All learning-loop operations call real
FastAPI/application use cases; the browser does not reproduce ranking or scheduling.

## Run locally

Requires Node.js 20.9+ and Python 3.12+. Start the explicit fictional demo:

```bash
cd apps/api
uv run --extra dev uvicorn haui_compass.api.demo:app --host 127.0.0.1 --port 8001
```

In another terminal:

```bash
cd apps/web
npm ci
COMPASS_API_URL=http://127.0.0.1:8001 npm run dev
```

Open http://127.0.0.1:3000. Next.js forwards `/compass-api/*` to `/api/v1/*`.
`COMPASS_API_URL` is server-side configuration, not a browser credential; its
default targets port 8000. Restart Next.js after changing it. For production
builds, supply it at build time as well.

## Checks

```bash
npm run typecheck
npm run lint
npm run build
npx playwright install chromium
npm test
```

Playwright starts the demo on 8001 and web on 3000 if absent. Locally it may reuse
existing servers: ensure the frontend points at this demo, not an unrelated API.
CI requires free ports. Tests run sequentially against the same fictional workspace
and intentionally append revisions. Twelve Chromium cases cover desktop (1280×900)
and mobile (390×844), the real HTTP learning loop, explicit candidate selection,
error/retry (including identical execution payloads/IDs), loading, empty states and
overflow. Screenshots go to ignored `test-results/`.

## Data and behavior boundaries

- Four fictional tasks and three editable availability windows are seeded only
  by `haui_compass.api.demo`. Restarting that API discards all data. The default
  API remains unseeded and does not expose `/api/v1/demo/context`.
- Demo context supplies academic labels, status, period and authored availability;
  it is not a general LMS or task-management API.
- Risk can be **UNKNOWN** because per-assignment capacity is not supplied. The UI
  displays the backend result, never fabricated urgency/probabilities. There is
  no standalone `risk_if_deferred` contract yet.
- Record work converts device-local inputs to aware ISO timestamps; plan/deadline
  displays use Hanoi time. Exact execution retries reuse the record ID while the
  dialog stays open. No mutation is automatically retried.
- Remaining effort is explicit student input, initialized from original estimates
  for review, never estimate minus actual time. Window defaults come from demo
  context, not inferred from prior plans.
- Candidate signals are unchecked by default. Only selected IDs are confirmed;
  editing answers clears proposals. Factual and self-reported sources are distinct.
- Replan review uses baseline/revised blocks and backend change reasons. That
  comparison is session-local; revision schedules survive browser reload while
  the API runs. Confirmed reflection does not change placement in v0.
- Authentication, real LMS import, arbitrary task/window CRUD, PostgreSQL-backed
  demo seeding, durable reflection browsing and deployment are **PLANNED**.

## Independent visual design

Own CSS tokens, system fonts, handwritten SVG icons and restrained green accent.
Desktop sidebar becomes four-destination top navigation on mobile. Native dialog
focus, keyboard outlines, text badges, semantic labels and skip link are present;
this is not a certified accessibility audit.

See [IntelliPlan UI Reference](../../docs/research/intelliplan-ui-reference.md).
No IntelliPlan HTML, CSS, JS, icons, images, fonts or branding is reused.

ESLint tooling is pinned to 16.1.6 with TypeScript-ESLint 8.46 overrides because
the initially resolved newer transitive plugin was unavailable in the configured
npm registry. Runtime Next.js remains 16.3.6; `package-lock.json` pins the graph.

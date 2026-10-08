# HaUI Compass web MVP

**IMPLEMENTED, development-only:** Next.js/React/TypeScript workspace with Today,
Weekly Plan, Reflect, History, Academic Data and a resettable three-scenario showcase.
All learning-loop operations call real FastAPI/application use cases; the browser
does not reproduce risk, ranking, scheduling or replanning decisions.

The student workspace has a typed, product-wide English/Vietnamese translation layer covering
navigation, Today, execution recording, Weekly Plan, reflection, history, Academic Data, status
badges, deterministic reason labels, empty states and demo controls. Language changes only
presentation; learning-loop data and deterministic decisions remain unchanged.

## Run locally

The workspace opens at `/learn`, the material-first learning home. Its bright
cream/white shell, Inter/Bitter type, black pill actions and pastel study tools
match login/upload. Today, Weekly Plan, Assignments and Ask documents remain
available; Overview, After studying and Plan history sit in a collapsed
“Review my learning” group. Logo and home breadcrumbs return to `/learn`,
not the public landing. Each screen has one primary purpose: choose work, schedule it, manage
assignments, ask a sourced question, review a session, or compare saved plans.
Demo controls and technical evidence start collapsed. Reflection uses two steps
and never selects proposed signals automatically. Assignment imports are optional,
with one entry method visible at a time; document questions start blank with an
explicit example button. These changes affect presentation, not planning/API contracts.

`/dashboard` is the existing **Overview / Tổng quan** destination in the secondary
navigation, not a second dashboard. Its cream, serif/card layout combines the two
requested Lovable references, prioritizing “Where am I now?”, today's saved
sessions/next action, upcoming deadlines, and current courses. The weekly chart
and plan revision timeline are under a collapsed “View statistics & plan history”
section. Today's preview clips the latest plan to midnight boundaries in Hanoi,
omits stale task references, and displays completion from actual task status;
these are read-only indicators, not fake interactive checkboxes. No saved plan
shows a planning entry point, never invented sessions. The four primary daily
destinations are accessible in the new shared frame.
It reads the same API context, recommendation
and saved plans: task/course completion, open assignment deadlines and server risk
labels, plan revisions and scheduled weekly hours. Cross-midnight blocks are split
in Hanoi time; week-boundary blocks are clipped to Monday–Sunday. These hours are
explicitly planned, not actual execution time. Taskless assignments remain visible;
empty progress is unknown, not 100%. No GPA, credits, grades or academic-year
roadmap are fabricated. The page is session-protected and supports EN/VI/dark mode.

The public `/` route introduces HaUI Compass: next action and deadline risk,
weekly planning, reflection/replanning, AI assignment breakdown and cited Q&A.
Primary actions open the functional student workspace at `/today`; `/demo`
offers student-oriented entry points rather than teacher/admin roles.
The legacy `/demo/select-role` route redirects to `/demo`. Public pages need no
demo API. `/login` and `/register` provide local demo authentication. Anonymous
workspace visits redirect to login and return to the requested screen after login.
Successful login/registration first opens `/onboarding`, a protected, shell-free
role-selection screen. Student continues to `/onboarding/upload`, then
`/onboarding/ready` after a successful upload. “I'll do this later” skips uploading
and opens the intended workspace destination (default `/learn`). After upload,
Continue always opens the first uploaded document's `/study-set/[id]`, not an
unrelated dashboard. Reader Back opens that same study set; All study sets
returns to `/learn`. Adding materials returns through the same upload/ready flow.
Teacher, Professor and Parent are visibly disabled “Coming soon” previews, not
implemented permissions or account roles. This choice screen appears after each
form login; returning sessions can still open their workspace directly.
Learning-loop APIs and data contracts are unchanged.

The upload screen accepts PDF, UTF-8 TXT and Markdown (1–3 files, at most 5 MB
each), with drag-and-drop, removal of selected files, errors/retry and a fictional
sample. `/api/documents` stores files in local, gitignored
`.demo-auth/documents.sqlite`, isolated by authenticated owner. Both metadata and
content reads require that owner; writes require the same Origin. Validation is
server-side too, batches are atomic, duplicate content reuses its record, request
streams are bounded, and each account is limited to 100 files / 50 MB.
The cream, serif ready screen follows the supplied three-column reference, with
original Compass/book line art and pastel tool illustrations. It shows saved
files, a suggested reading order from explicit Markdown headings (or filenames),
and an enabled Read tile at `/documents/[id]`. PDF viewing uses the browser's native
viewer; PDF signature checks are not full parsing or malware scanning. TXT/Markdown
is displayed safely with plain headings/paragraphs, never executed HTML. The existing Knowledge screen
also lists uploads and provides an Add documents entry point.
**Boundaries:** TXT/Markdown uploads are ingested for the Compass Assistant in
each Study Set; no PDF extraction, OCR, automatic study-plan generation or
note-taking is claimed. TXT/Markdown supports topic
reading, source-based flashcards and ungraded active recall at `/study-set/[id]`.
Covered/mastered progress is self-reported and persisted per authenticated owner.
Failed progress writes keep the current topic selected. PDF remains readable, with
text-dependent study tools disabled. Ready's planning tile opens the existing
assignment planner; it does not claim to plan automatically from uploads.
The separate Knowledge screen continues to search the registered corpus.
Compass Assistant retrieves only the authenticated owner's current uploaded
document. When the backend LLM is enabled, bounded relevant excerpts are sent to
the configured provider. Storage still uses the existing local SQLite files.
See [Compass Assistant setup, APIs and migrations](../../docs/features/compass-assistant.md).
The original project illustration and generation prompt are documented in
[public/compass/README.md](public/compass/README.md).

Requires Node.js 22.13+ (24 LTS recommended) and Python 3.12+. Start the explicit fictional demo:

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

Open http://127.0.0.1:3000. Next.js authenticates and forwards `/compass-api/*` to `/api/v1/*`.
`COMPASS_API_URL` is server-side configuration, not a browser credential; its
default targets port 8000. Restart Next.js after changing it. For production
builds, supply it at build time as well.

If port 3000 is occupied, leave the other process running and use the documented fallback:

```bash
COMPASS_API_URL=http://127.0.0.1:8001 npm run dev:3100
```

Open http://127.0.0.1:3100. To run Playwright against this port, use
`PLAYWRIGHT_WEB_PORT=3100 npm test` with no other web server on that port.
Playwright starts its isolated API fixture on port 8005 and uses separate test storage.
If a dev server is already running, use `npm run build` followed by
`PLAYWRIGHT_USE_BUILD=1 PLAYWRIGHT_WEB_PORT=3300 npm test`.

The demo starts on **Deadline Crunch**. Open **Settings → Demo scenario** to use the selector
to load Normal Week, Deadline Crunch or Disrupted Week. See the complete
[canonical council runbook](../../docs/demo/council-demo-v0.5.md).
Normal Week also contains a taskless Database Mini Project for the
[AI decomposition v0.3 flow](../../docs/demo/ai-task-decomposition-v0.3.md).
The backend can optionally use an online model without changing the web configuration; see the
[Real LLM Integration v0.4 runbook](../../docs/demo/real-llm-integration-v0.4.md). Provider keys
must exist only in the API process.

## Local demo accounts

- Ready-to-use account: **`demo` / `haui123`**, display name **Sinh viên HaUI**.
  It is seeded automatically on the first login/registration request. Login offers
  a “Fill demo account” button; no real email or HaUI credentials are needed.
- `/register` creates a test account with a unique username, display name and
  password (minimum six characters). Password confirmation happens in the form.
  The first step asks only for a username; Continue reveals the name/password fields.
  Going back preserves the entered details without creating an account.
  Duplicate usernames are rejected rather than overwriting existing accounts.
- Accounts, salted scrypt password hashes and hashed opaque sessions persist in
  `apps/web/.demo-auth/accounts.sqlite` (gitignored; local file permissions restricted).
  Passwords/tokens are not stored in browser localStorage. Sessions last seven days;
  logout revokes the server-side session and clears its HttpOnly/SameSite cookie.
- Workspace routes check sessions server-side. The Next.js API forwarding route
  independently checks authorization and rejects cross-origin mutations. After five
  failed logins for a username in one minute, further attempts are temporarily limited.
- **Local demo, not production identity management:** all accounts share the same
  fictional learning workspace. There is no email verification, password recovery,
  or per-student learning-data isolation. The direct FastAPI port is still a local
  demo API without these web-session checks: keep both services bound to loopback.
  Public hosting requires an auth/deployment review and persistent storage.
- If running behind a trusted HTTPS reverse proxy, set `COMPASS_WEB_ORIGIN` in the
  web process to the exact public origin (no trailing slash). Never allow arbitrary
  request-supplied origins. Keep the demo password out of any real deployment.

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
and intentionally append revisions. Chromium cases cover desktop (1280×900)
and mobile (390×844), the real HTTP learning loop, explicit candidate selection,
error/retry (including identical execution payloads/IDs), loading, empty states and
overflow. The showcase spec also covers scenario reset plus the end-to-end disrupted
flow. Screenshots go to ignored `test-results/`.

## Data and behavior boundaries

- Three reproducible fictional scenarios are seeded only by
  `haui_compass.api.demo`. Selecting/resetting a scenario atomically swaps its
  isolated in-memory container. Restarting the API discards all data. The default
  API remains unseeded and exposes no demo routes.
- Task decomposition stores validated candidates in an ephemeral server-side session.
  Editing/selecting candidates does not create tasks; **Add selected tasks** calls the
  existing task-creation use case for the confirmed subset. The showcase provider is a
  deterministic offline fallback, and its estimates remain editable suggestions. When configured,
  the online adapter is labelled **AI · online**; fallback is labelled **Template · offline**.
- Demo context supplies academic labels, status, period and authored availability;
  it is not a general LMS or task-management API.
- Risk/NBA remain deterministic and use explicit per-assignment capacity supplied
  by the scenario context. Natural-language recommendation text is presentation
  output from an optional online adapter or offline template; raw reason codes/evidence remain
  visible and authoritative.
  There is no standalone `risk_if_deferred` contract yet.
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
- Production identity management, real LMS import, arbitrary task/window CRUD, PostgreSQL-backed
  demo seeding, durable reflection browsing and deployment are **PLANNED**.

## Independent visual design

Login and registration use the requested StudyFetch signup layout as a visual
reference: cream split panels, serif headings, rounded actions and a quiet study
illustration. The text, compass identity and handwritten SVG are HaUI Compass's
own. Mobile hides the illustration panel to focus on the form. The primary
alternative is the working local demo account, not an unimplemented Google login.
Local Bitter and Inter fonts include their OFL licenses in `public/fonts`.

The public pages adapt the requested reference's visual structure to HaUI Compass,
with a project-native compass mark, an original student illustration, student-first
copy and a restrained green accent. No reference branding, contact information,
school regulations, commercial claims or teacher/admin previews are displayed.
Scoped CSS and local Manrope/Be Vietnam Pro fonts (OFL licenses included) keep the
landing independent from workspace styles. Landing tests cover identity, student
flows, source expansion, FAQ, preferences, the demo guide and legacy entry routes
on desktop and mobile. Sample previews are explicitly labelled illustrative.

Own CSS tokens, system fonts, handwritten SVG icons and restrained green accent.
Desktop sidebar becomes four-destination top navigation on mobile. Native dialog
focus, keyboard outlines, text badges, semantic labels and skip link are present;
this is not a certified accessibility audit.

See [IntelliPlan UI Reference](../../docs/research/intelliplan-ui-reference.md).
No IntelliPlan HTML, CSS, JS, icons, images, fonts or branding is reused.

ESLint tooling is pinned to 16.1.6 with TypeScript-ESLint 8.46 overrides because
the initially resolved newer transitive plugin was unavailable in the configured
npm registry. Runtime Next.js remains 16.3.6; `package-lock.json` pins the graph.

### Production demo-account guard

The known `demo` / `haui123` account and its old cookies are rejected when running
`npm run start`. For an explicitly local presentation, set `COMPASS_DEMO_AUTH=1` in
the web process. Registered private accounts do not require this setting. Keep the
flag unset for public deployments. See [Compass verification](../../docs/features/compass-assistant-verification.md).

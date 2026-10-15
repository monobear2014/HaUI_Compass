# HaUI Compass staging hardening v1 — evidence report

**Status: PARTIAL**

Latest closure, 2026-10-15: **PARTIAL**. The final cloud functionality/security matrix is recorded
in the final section. Code Preview `3f3b8bb` is Ready, MD/TXT/PDF upload and grounded PDF RAG pass,
and no raw API/Blob master credential was retrieved. A temporary bearer-URL tool-output exception
prevents describing this as a strictly zero-token-exposure acceptance run. Earlier dated sections
below are historical evidence, not the latest status.

Run date: 2026-10-12 (Asia/Ho_Chi_Minh)
Scope: branch `feat/vercel-staging-deployment`; baseline `b5fbba014b5635a471dab0e4c4a7f2702082ba31`.

This run reproduced and fixed the broken landing hero on the protected Preview. The repository
already contained isolated Playwright, API, upload, ownership, citation, persistence, and UI tests,
so no duplicate test framework or unrelated product changes were added. Full local verification
and a small Preview smoke passed as described below. The task remains partial because the full
Playwright run had four mobile timeouts (all four passed when rerun alone), PostgreSQL integration
tests had no test database, and no staging account was created for a live upload/RAG/Blob workflow.

## Git and change

- Branch: `feat/vercel-staging-deployment`.
- Base: `b5fbba014b5635a471dab0e4c4a7f2702082ba31`.
- Code fix: `a1d630a5546fe4094320fd82a295d53900237d96` — `fix(web): load protected landing hero without image optimizer`.
- Commit author: `Nguyen hoai nam <namnh.audit@gmail.com>`.
- The code commit has no `Co-authored-by` trailer or AI attribution.
- Code change: 2 files, 7 insertions, 1 deletion. Production code: +1 line; regression test: +6/−1 lines.
- The working tree was clean after the code commit was pushed. No `.env` file was staged or committed.
- No PR, merge, force push, or cloud database migration was performed.

## Reproduced UI issue and fix

The supplied Preview displayed an empty black hero area. In the authenticated Chrome session,
`study-hero.png` had `naturalWidth=0`; the optimized `/_next/image` request failed. The file exists
at `apps/web/public/compass/study-hero.png`. The direct asset URL loaded in the same authorized
session at 1672×941, while the optimizer request could not access the protected asset because the
optimizer's source fetch does not forward the browser's Vercel Authentication cookie.

The landing hero now sets `unoptimized`, sending the browser directly to the same-origin static
asset so the authorized browser session can fetch it. The landing regression now asserts the
direct `src` and waits for `naturalWidth > 0`, instead of checking only that an `<img>` exists.

## Local verification

| Check | Result |
|---|---|
| `apps/api`: `uv run --offline pytest -q` | 1,577 passed, 14 skipped; skips require a configured real PostgreSQL test database. |
| API Ruff | Passed. |
| API mypy | Passed, 223 source files. |
| Web `npm run typecheck` | Passed. |
| Web `npm run lint` | Passed. |
| Web `npm run test:config` | 25 passed. |
| Web `npm run build` | Passed with Next.js 16.3.6. |
| Focused Playwright landing spec, desktop and mobile | 6 passed. |
| Four mobile cases that timed out in the full run, rerun alone | 4 passed. |
| `git diff --check` | Passed. |

The full Playwright run reported **142 passed, 4 failed, 8 skipped**. The four failures were timeouts
in mobile cases for Vietnamese entry, plain-text study navigation, the functional-page sweep, and
PDF citation navigation. The snapshots showed rendered UI for two timeouts; isolated reruns of all
four passed. The full suite therefore remains recorded as not green rather than treating the
isolated reruns as a full-suite pass. The 8 skipped tests require PostgreSQL integration services.

Existing passing E2E coverage includes authentication and logout/session persistence; document
upload validation and retry; TXT/Markdown/PDF ingestion; Study Set and progress persistence;
cross-user document/chat/chunk denial; chat history, citation validation, PDF page citations,
abstention, duplicate-request behavior, and Vietnamese UI flows. These tests ran against local
isolated web/API fixtures, not against staging data.

## Authorization evidence and limits

The following outcomes were observed in local isolated Playwright contexts. They are regression
evidence for the application routes, not a penetration test and not a live cloud authorization run.

| Resource | Owner | Other user | Anonymous | Evidence |
|---|---|---|---|---|
| Study Set | Allowed | 404 | Not directly tested at the specific Study Set URL; general protected navigation is covered | `apps/web/tests/persistence.spec.ts:83`, `apps/web/tests/auth.spec.ts:3` |
| Document metadata/content route | Allowed | 404 | Document listing returns 401; per-ID anonymous fetch not separately asserted | `apps/web/tests/persistence.spec.ts:83`, `apps/web/tests/documents.spec.ts:186` |
| PDF bytes/private-file route | Allowed in local storage fixture | 404 | Per-ID anonymous fetch not separately asserted | `apps/web/tests/pdf-rag.spec.ts:79` |
| Chat sessions/history | Allowed | 404 | Not directly asserted for each chat route | `apps/web/tests/compass-chat.spec.ts:203` |
| Citation chunks | Allowed | 404 for foreign owner/mismatched document | Not directly asserted for each citation route | `apps/web/tests/compass-chat.spec.ts:572`, `apps/web/tests/pdf-rag.spec.ts:79` |

Local source/config tests cover private Blob credential requirements, scoped upload intents,
owner-scoped storage keys, and authorization before streaming. This run did not upload a file to
staging or attempt direct cross-user access to live Vercel Blob objects. The staging authorization
matrix therefore remains unverified in cloud.

## RAG, localization, and responsive checks

- Offline RAG E2E coverage passed within the 142 full-run passes: grounded answer structure,
  document scope, validated citation targets, PDF page citation, persisted history, duplicate retry,
  and abstention for missing evidence. No exact LLM prose was asserted.
- Live LLM requests in this run: **0**.
- Existing Vietnamese/English workflow tests passed in focused landing runs. The full run's one
  mobile Vietnamese-flow timeout passed in isolation.
- Existing desktop/mobile layout tests cover 1280×900 and 390×844 presets. The specifically
  requested 375×812, 768×1024, and 1440×900 sizes were not all exercised as exact viewports.
- Keyboard tab navigation and semantic controls have existing focused coverage; no formal WCAG
  audit or contrast measurement was performed.

## Preview deployment

- Commit `a1d630a` deployed as a **Preview** from `feat/vercel-staging-deployment`.
- Preview URL: https://haui-compass-n6srk98s0-nam-4b71.vercel.app/
- Vercel deployment status: **Ready**, build duration 51 seconds; deployment detail displayed
  2026-10-12 14:54:44 Asia/Ho_Chi_Minh.
- Vercel settings showed Production tracking `main`, Preview tracking all unassigned Git branches,
  and Vercel Authentication enabled for All Deployments. The new deployment was Preview; the
  existing Production deployment at `e1c2bd4` remained current and unchanged.
- Authenticated browser smoke: landing rendered; hero loaded directly with `naturalWidth=1672`;
  browser console had no errors; `/api/v1/health` returned `{"status":"ok"}`.
- Vercel service graph listed `web` (Next.js) and `api` (FastAPI); deployment was Ready. This run
  did not perform a signed-in student workflow against staging.
- No staging account or uploaded document was created. Therefore Neon persistence, live private
  Blob access, live ingestion, and live RAG/citation behavior were not revalidated. No cloud SQL
  migration was run. No Production setting, environment variable, domain, or deployment was
  modified.

## Remaining work before production readiness

- Make the full Playwright suite stable in one end-to-end run, then rerun it green.
- Run the PostgreSQL persistence suite against an explicitly isolated PostgreSQL test database.
- Run a bounded staging workflow with owned synthetic accounts and a supported cleanup path:
  auth, upload/ingestion, ownership isolation, private file access, citation/abstain, and refresh
  persistence. Keep live model calls within the 1–3 request budget if the live LLM is enabled.
- Exercise exact requested tablet/mobile/desktop viewports and capture sanitized before/after
  evidence.
- Do not promote this Preview to Production. The API key shown in the IDE context should be
  rotated by its owner; no secret was copied into this report or commit.

## Staging hardening v1.1 acceptance closure

**Status: PARTIAL**
Run date: 2026-10-12 (Asia/Ho_Chi_Minh). Baseline: `48700ba080afdf895ba85bf945049b1964fee60e`.

### Playwright stability investigation

The requested full suite was run twice from the baseline, using `apps/web` and the checked-in
Playwright configuration:

| Run | Command | Result | Runtime / worker evidence |
|---|---|---|---|
| 1 | `npm run test -- --reporter=line` | 146 passed, 8 skipped, 0 failed | 3.5 minutes; config has `fullyParallel: false`, `workers: 1` |
| 2 | `./node_modules/.bin/playwright test --reporter=json` | 146 passed, 8 skipped, 0 failed, 0 flaky | 197.9 seconds; all tests used worker 1, `parallelIndex=0` |

The eight default-run skips are the four `tests/postgres-persistence.spec.ts` tests in each of
the desktop and mobile projects. They were run separately against the isolated local PostgreSQL
test database (see below).

The four formerly timing out mobile cases passed in run 2. Their individual durations were:

| Case | Duration |
|---|---:|
| Vietnamese preferences and student-first entry | 1.8 s |
| Plain-text study set and navigation | 1.3 s |
| Eight-page functional-page sweep | 3.9 s |
| PDF citation and page-2 navigation | 2.2 s |

To collect trace evidence without masking a failure, the four cases were then repeated twice with
`--trace=on`. All 8 repetitions passed in 32.5 seconds. Eight trace archives are in the local,
uncommitted `/tmp/haui-flake-traces/` directory. No failed-run trace from the earlier 142/4/8 run
was present in the workspace, so its exact timed-out action and stack cannot be reconstructed.

Findings by suspected cause:

- **Parallel workers:** ruled out for these runs. The suite is configured for one worker and the
  structured report records `parallelIndex=0` for all tests.
- **Browser/context lifecycle:** each Playwright test receives its own browser context; neither
  complete run showed a lifecycle failure.
- **Cross-test/shared fixture data:** the SQLite test store at `.playwright-data` persists across
  tests and some cases reuse the seeded `demo` owner. That is a real shared-state surface, but the
  repeated cases passed against that store; it is not established as the trigger.
- **Navigation races/async transitions:** the four current trace-backed repetitions completed
  their URL, heading and citation assertions. No such race reproduced.
- **Resource contention:** a transient stall remains plausible given the 45-second per-test
  timeout and the long dev-mode suite, but no CPU/memory sample or original failed trace was
  available to prove it.

**Root cause remains undetermined.** Current evidence shows the timeouts were transient and not
caused by concurrent Playwright workers, but it does not justify attributing them to a specific
navigation, fixture, browser or resource defect. No timeout was hidden by raising the global
timeout, and no code change was justified by these runs.

### PostgreSQL integration validation

Both PostgreSQL stacks targeted the compose-provisioned `haui_compass_test` database on local port
54330. No Neon or cloud database URL was used.

| Suite | Command | Result | Coverage evidence |
|---|---|---:|---|
| API PostgreSQL integration | `HAUI_COMPASS_TEST_DATABASE_URL=postgresql+psycopg://haui:…@127.0.0.1:54330/haui_compass_test uv run --offline pytest -q tests/integration/postgres` | 14 passed, 0 failed, 0 skipped | Alembic schema migration, persistence/API contracts, ownership, academic import and transaction cases |
| Web PostgreSQL integration | `HAUI_COMPASS_WEB_DATABASE_URL=postgresql://haui:…@127.0.0.1:54330/haui_compass_test npm run test:postgres` | 4 passed, 0 failed, 0 skipped | Cross-connection persistence, failed-ingestion state, rollback boundary, chat history/citations and attempt fencing; web schema revision 3 |

The web tests used generated synthetic users and left test rows in this isolated local database
(observed after the run: 46 users, 24 documents, 8 chat sessions). They were not staging data.
Those rows were not removed with direct SQL. The local test service and volume remain available for
later inspection or normal disposable-environment teardown.

### Live Preview evidence and security matrix

Target supplied for this closure: https://haui-compass-3udu92iyx-nam-4b71.vercel.app/

An unauthenticated request to both `/` and `/api/v1/health` returned HTTP 302 to Vercel SSO. In the
authorized Chrome profile, `/api/v1/health` returned HTTP 200 with `{"status":"ok"}`. The user
confirmed the Preview page is visible in their signed-in Chrome tab, and the attached Preview tab's
accessibility tree contained the HaUI Compass homepage content. An earlier white screenshot came
from the wrong/stale browser capture context and is not evidence of a rendering failure.

Registration is currently at the username step. The page states “By continuing, you agree to our
Terms and Data & privacy.” The source confirms the first Continue button only reveals the remaining
registration fields, while Create account submits registration. Because the user must accept the
linked terms for account creation, test-account creation is handed off to the user before any
agreement action is taken. No staging account, document, or Blob object has been created.

| Staging resource/check | Student A | Student B | Anonymous | Result |
|---|---|---|---|---|
| Registration/login | Not run | Not run | SSO redirects at the deployment edge | Awaiting user-created synthetic accounts after terms acceptance |
| Study Set creation | Not run | Not run | — | Blocked |
| TXT/MD/PDF upload and ready ingestion | Not run | Not run | — | Blocked |
| Grounded response and citation | Not run | Not run | — | Blocked; 0 live model requests |
| Out-of-document abstention | Not run | Not run | — | Blocked |
| History after refresh/relogin | Not run | Not run | — | Blocked |
| Foreign document/conversation access | Not run | Not run | — | No student accounts or resources created |
| Private Blob retrieval | Not run | Not run | Not run | No staging Blob object created; access policy not exercised |

Local E2E coverage did pass PDF page citation to page 2, source-chunk resolution, abstention,
history persistence and cross-user route denial within the two full-suite runs. This is local
fixture evidence only and does not fill the staging matrix. No synthetic staging account or object
was created, so there is no cloud test data to clean up.

### Deployment and Git closure

- Preview health endpoint: HTTP 200 in the authorized Chrome session.
- Vercel's deployment list identifies the supplied `3udu92iyx` URL as a **Ready Preview** from
  `feat/vercel-staging-deployment`, deployed at `2026-10-12 14:58:36 Asia/Ho_Chi_Minh` from
  commit `48700ba080afdf895ba85bf945049b1964fee60e`. This matches the requested baseline SHA.
  The deployment detail page did not expose service-level data during this check, so separate
  `web` and `api` Ready states remain unverified.
- Production Branch `main`, Preview Branch `feat/vercel-staging-deployment`, and project-level
  Deployment Protection: **not re-verified** in project settings. SSO redirects confirm protection
  at the tested host, but not its full Vercel configuration.
- No Production deployment, Vercel setting, cloud migration, account, document, or Blob object was
  changed or created during this closure.
- Report-only commits made during this closure are `f8a2349a378c831723a4d382405f79bd62791820`,
  `56a679ed07f8103663d72eb9df567781e1b611c6`, and
  `538c040561deba4bb4e21d15a4b711fe5d157a5b`. All three are authored by `Nguyen hoai nam`
  (`namnh.audit@gmail.com`), with no co-author or AI attribution. They have not been pushed because
  the required live acceptance and project-settings verification are incomplete.

### Remaining blockers

1. Have the user create two synthetic student accounts in the supplied Preview and leave Student A
   signed in after accepting the displayed Terms and Data & privacy. Then complete the student
   workflows, ownership matrix, and private Blob tests.
2. Reopen Vercel project settings to verify Production Branch `main`, Preview Branch
   `feat/vercel-staging-deployment`, and project-level Deployment Protection; separately verify
   service-level readiness for `web` and `api`. No Production deployment should be triggered.
3. The original four timeout traces were unavailable. If they recur, retain their failed traces
   and browser/server timing logs to identify the stalled action.
4. The API key displayed in the IDE context is exposed in this conversation. Its owner should
   revoke/rotate it and replace the local value; no key value is copied into this report.

Acceptance remains **PARTIAL** because the full local Playwright and PostgreSQL suites are green,
but essential live Preview acceptance and the target deployment/settings verification remain
incomplete. The Preview page itself is visible; the current live-test handoff is the user-controlled
terms acceptance needed to create the two synthetic accounts.

## Staging hardening v1.2 — live student workflow

**Status: PARTIAL**
Run date: 2026-10-12 (Asia/Ho_Chi_Minh). Deployed baseline: `48700ba080afdf895ba85bf945049b1964fee60e`.

### Computer Use and accounts

- Native Computer Use was available through the CUA browser/app interface. The Preview was tested
  in Chrome and Safari; Student A and Student B used separate browser storage sessions.
- Both existing synthetic accounts authenticated successfully. The user completed the Vercel
  sign-in step when prompted. No new accounts were registered.
- Refreshing Student B's assistant page restored the existing conversation and prior messages.
- The deployed Preview remained the supplied URL and baseline commit throughout this run.

### Live cloud results

| Scenario | Result |
|---|---|
| Student A and B sign-in | Passed; separate sessions, each showed its own identity. |
| Student B TXT upload | Passed; reached ready and appeared in Study Set. |
| Student B Markdown upload | Failed on deployed build with `invalid_content_type`. |
| Student B text PDF upload | Passed; two-page PDF rendered and extracted page-2 text. |
| Grounded PDF question | Passed on second query: answer stated 17 days and cited `student-b-manual.pdf`, page 2. |
| First PDF question | Assistant abstained on a valid, but more indirect, question about page and interval. |
| Chat history after refresh | Passed; earlier question and response remained visible. |
| Student A opening Student B Study Set URL | 404 page in Student A session. |
| Anonymous access to `/`, `/learn`, `/api/v1/health` | HTTP 302 from Vercel Deployment Protection. This is edge behavior, not the app's anonymous API status. |

Live model requests: **2**. No more than three were made. The successful citation identified page 2;
the source page visibly contained the interval statement. The chat conversation was restored after
refresh. Logout/re-login persistence, an out-of-document abstention, and cross-user chat/citation
access were not tested.

Synthetic test files created for Student B remain in staging; no deletion or direct database edits
were made. Student A had no test materials. Sanitized resource IDs observed: TXT
`1aea0167-14b8-4476-bc77-025d2d688452`; PDF `b0bd9340-8a6d-46bb-b02d-120987dbca19`; chat
`c732dd50-d5c4-4819-8f9a-fea1cd55dc79`.

### Security and ownership evidence

| Resource | Owner (Student B) | Other student (Student A) | Anonymous |
|---|---|---|---|
| Study Set | Opened in B session | 404 page at known B Study Set URL | Vercel edge 302; app contract not reached |
| Document metadata | PDF ready/viewer opened | Per-document route is not a valid app route; no conclusion | Vercel edge 302 |
| Private bytes | PDF page viewer rendered extracted contents | Direct unauthorized Blob retrieval not attempted | Direct Blob retrieval not attempted |
| Chat | B conversation and history visible | Not tested | Not tested |
| Citation | Page-2 source citation opened in B session | Not tested | Not tested |

The UI's PDF viewer used the application's private-document flow, but the live unauthorized Blob
retrieval and expiry contract were not independently exercised. The Vercel page redirect blocked
anonymous app requests; these results do not establish API-level anonymous 401/403 statuses.

### Infrastructure

- Vercel listed the supplied deployment as **Ready Preview**, branch
  `feat/vercel-staging-deployment`, SHA `48700ba080afdf895ba85bf945049b1964fee60e`.
- Settings showed Production branch `main`; Preview branch setting was **All unassigned Git
  branches**. Deployment Protection's **Require Log In** was enabled for **All Deployments**;
  password protection was off.
- Deployment detail showed the `web` Next.js and `api` FastAPI services and `/api/v1/health` route,
  but separate service readiness was not exposed. Anonymous health request returned 302 at the
  protection edge; an authenticated health response was not independently captured in this run.
- Student B's successful persistent upload and PDF ingestion demonstrate that the application
  storage/ingestion path operated for this workflow. Neon connectivity and Blob authorization
  boundaries were not independently inspected.
- No Production deployment or Vercel setting was changed.

### Targeted Markdown fix and local verification

On the deployed build, `.md` and `.markdown` files failed with `invalid_content_type`, while TXT and
PDF succeeded. The upload UI had forwarded browser-provided `File.type` unchanged when present;
Safari supplied a type rejected by the server's supported Markdown MIME list. The working tree now
chooses canonical MIME types by the already-validated filename extension. A regression test supplies
an `.md` file with `application/octet-stream` and asserts that the upload intent sends
`text/markdown`.

Focused local Playwright check: **1 passed**. The first invocation used a nonexistent `chromium`
project selector and exited before running tests; rerun with the configured `desktop` project passed.
This local fix has not been deployed to Preview and therefore does not change the live failure.

### Git and remaining acceptance gates

- Branch remains `feat/vercel-staging-deployment`; remote HEAD remains `48700ba`; the local fix/report
  commit is HEAD (five commits ahead of remote, including four documentation commits).
- Commit subject: `fix(web): canonicalize document upload MIME types`, authored by
  `Nguyen hoai nam <namnh.audit@gmail.com>` with no co-author trailer.
- No push was made because the live acceptance gates remain incomplete; there is no Preview
  containing the fix.
- No full fresh Playwright or PostgreSQL suite was run during this live workflow. The earlier
  v1.1 local results above remain separate evidence.

Remaining risks: **P2** Markdown upload is broken on the deployed Preview and needs a new Preview
plus live retest; **P2** the first supported PDF question abstained despite relevant content;
cross-user tests for document bytes, chat, citations, and private Blob are incomplete; anonymous
app authorization statuses are masked by Vercel's 302; logout/re-login persistence and out-of-scope
abstention remain unverified. Acceptance remains **PARTIAL**. Do not promote to Production.

## Staging acceptance v1.2 — final closure attempt

**Status: PARTIAL — cloud gates not completed.**
Run date: 2026-10-13 (Asia/Ho_Chi_Minh). Branch: `feat/vercel-staging-deployment`.
Starting HEAD: `71b9d7d916face296285942c5f2563dd19b2e31f`.

### Credential safety gate

The exposed key value was not read from `.env`, fetched from Vercel, or copied into this report.
The user explicitly confirmed that the exposed key was revoked and a replacement staging key was
saved as `OPENAI_API_KEY` in Vercel Preview scoped to this branch. No live LLM calls were made.

### Review of commit `71b9d7d`

The upload component now selects the canonical MIME type from the already-validated filename
extension: PDF → `application/pdf`, Markdown → `text/markdown`, and TXT → `text/plain`. This
removes dependence on browser-provided MIME metadata for these supported formats. The server
remains authoritative: it validates extension, size, and an extension-specific allowlist before
creating intents; unsupported extensions and MIME mismatches still fail. TXT and PDF continue to
use their existing canonical types and extraction paths.

The new Playwright regression uses `notes.md` with browser MIME `application/octet-stream`, the
value that caused the original `invalid_content_type` failure, and observes `text/markdown` in the
upload-intent request. The server-side validation/owner-isolation test also passed. The fix is
adequate; implementation was not changed.

### Local verification

| Check | Result |
|---|---|
| Focused upload regression and upload API owner/validation test | 2 passed |
| Web config/security tests | 25 passed |
| Full Playwright suite | 148 passed, 8 skipped, 0 failed (156 total; skips require PostgreSQL integration setup) |
| Web typecheck | Passed as part of the chained verification command |
| Web lint | Passed as part of the chained verification command |
| Web production build | Passed with Next.js 16.3.6 |
| API suite: `uv run --offline pytest -q` | 1,577 passed, 14 skipped; PostgreSQL test database not configured |
| `git diff --check` for the pending branch diff | Passed before this report update |

No live model call was made. No cloud migration or destructive database cleanup was run.

### Cloud acceptance and deployment

- Code deployment: **Ready**, environment **Preview**, branch
  `feat/vercel-staging-deployment`, SHA `796a6a6133dab639129375c4f30e0e4faf721c03` (`796a6a6`),
  URL <https://haui-compass-d04ko9hre-nam-4b71.vercel.app/>.
- Latest report-only deployment: **Ready**, SHA
  `3da54c8241b36893d76e85bbf20d8b9eec5d5bc3` (`3da54c8`), URL
  <https://haui-compass-j8ef9dlfn-nam-4b71.vercel.app/>. The stable branch alias
  <https://haui-compass-git-feat-vercel-staging-deployment-nam-4b71.vercel.app/> resolves to this
  latest deployment. Deployment details listed the `web` Next.js and `api` FastAPI services.
- Vercel settings confirmed Production branch tracking `main`; Preview tracking is enabled for
  all unassigned branches, which includes this feature branch. The Preview variable list contains
  `OPENAI_API_KEY` scoped to `feat/vercel-staging-deployment`; its value was not revealed. The
  user confirmed the exposed key was revoked and the rotated staging key was saved.
- Direct Preview request to `/api/v1/health` on the branch alias returned `{"status":"ok"}`.
  The landing page rendered in Safari.
- Anonymous navigation to the known Student B Study Set path was redirected by the application
  to `/login?next=%2Fstudy-set%2Fb0bd9340-8a6d-46bb-b02d-120987dbca19`. The login page rendered,
  rather than a Vercel SSO page, so this is evidence of the application authentication boundary.
- Anonymous `GET /api/documents/b0bd9340-8a6d-46bb-b02d-120987dbca19` and
  `GET /api/chat/sessions/c732dd50-d5c4-4819-8f9a-fea1cd55dc79/messages` both returned
  `{"error":"unauthorized"}` from the application. The document route also serves the private
  document byte stream after authorization, so its 401 covers anonymous byte access through that
  route. No chunk ID or direct Blob URL was available anonymously to test those routes directly.
- Direct unauthenticated `curl` requests to the Preview returned Vercel Authentication HTTP 302
  for `/`, `/api/v1/health`, the known Study Set, document, and chat routes. Those edge redirects
  are recorded separately and are not treated as application authorization evidence. The
  application 401 results above came from the existing signed-in Vercel browser profile without a
  HaUI Compass student session.
- TXT/MD/PDF cloud uploads, metadata refresh, Student A/B isolation for metadata/bytes/chunks/chat/
  citations, private Blob authorization, PDF page citation, and chat history after refresh/re-login
  have not yet been tested on this build. The earlier v1.1 observations above are not evidence for
  this commit. Student B must authenticate to the new hostname; the old Preview session cookie did
  not transfer to the branch alias. Although the user indicated both sessions were ready, direct
  inspection after the user said both Study Set pages were open still showed Safari at the login
  page and Chrome at a blocked/error page. No student identity or signed-in Study Set was visible;
  the student-session-dependent cases below therefore remain unverified. No credentials were
  entered or recovered by the agent.

| Staging check | Student A | Student B | Anonymous |
|---|---|---|---|
| Markdown upload on new Preview | Not run | Not run | — |
| TXT/PDF ingestion and metadata refresh | Not run | Not run | — |
| Document metadata, bytes, chat history | Not run | Not run | API returned 401 `unauthorized` |
| Chunks and citations | Not run | Not run | No chunk ID available anonymously |
| Owner access | Not run | Not run | — |
| Private Blob through application authorization | Not run | Not run | Not run |
| PDF correct-document/page citation | Not run | Not run | — |
| Chat history after refresh and re-login | Not run | Not run | — |

### PDF false-abstain investigation

Code inspection shows chat requests require the active document to be `ready`, then query retrieval
with the authorized study set, owner, and active document ID. The retriever validates the document
and returns ranked chunks. The ranking core rejects queries with missing named anchors, then
requires a positive score and either coverage >= 0.3 or a matching anchor. Those filters can produce
zero candidates even when stored chunks exist. If candidates are empty, the application abstains
before calling the model. Otherwise
the API model may answer or abstain, and the web layer rejects answered responses without valid
citations or abstentions carrying citations. Existing PDF E2E tests cover page citation and
missing-evidence abstention locally.

The earlier cloud run did not retain a sanitized trace for the first query, so its ingestion-ready
state at request time, resolved wording, retrieved chunk scores/content, and model decision are
unknown. The subsequent page-2 cited answer proves the document could be ready and retrievable
later, but does not establish readiness or retrieval results for the earlier question. Root cause
cannot be established from available evidence; this remains an unresolved quality risk. No ranking
threshold or retrieval behavior was tuned.

### Git state and remaining risks

All seven commits listed below are pushed to
`origin/feat/vercel-staging-deployment`; HEAD was `3da54c8` and the working tree was clean before
this final report correction. No PR, merge, force push, or Production deployment occurred.

Commits pushed since the prior remote head `48700ba`:

- `f8a2349` — `docs(staging): close v1.1 acceptance evidence`
- `56a679e` — `docs(staging): correct preview acceptance status`
- `538c040` — `docs(staging): verify preview deployment record`
- `76bff41` — `docs(staging): record closure commit authorship`
- `71b9d7d` — `fix(web): canonicalize document upload MIME types`
- `796a6a6` — `docs(staging): record v1.2 local verification`
- `3da54c8` — `docs(staging): record Preview v1.2 acceptance status`

Acceptance remains **PARTIAL**. The Markdown fix is locally verified, but essential cloud gates,
the Student A/B uploads, metadata and data isolation, owner access, private-Blob boundary, PDF page
citation on this build, and chat persistence are unverified. Anonymous app-level checks were
partially verified as recorded above; unauthenticated Vercel-edge 302s were not counted as proof.
The PDF false-abstain root cause remains unresolved. Preview used the rotated key configuration;
there were zero real LLM calls during this acceptance attempt.


## Final cloud acceptance evidence — 2026-10-15, authenticated Chrome contexts

This section supersedes the incomplete cloud matrix in the earlier continuation sections.
**Final status: PARTIAL.** Functional/security verification passed for the recorded cases,
including signed-GET expiration. The evidence-hygiene exception below prevents a strict
zero-token-exposure SUCCESS / STAGING READY claim.

### Deployment under test and authorization contexts

- Code SHA: `3f3b8bb2472f97214ac6c665403595f12bcb0c66`.
- Ready Preview: <https://haui-compass-djq3cyp24-nam-4b71.vercel.app/>; stable branch alias points
  to this build. Both tests and deployment are from `feat/vercel-staging-deployment`.
- Student A: ordinary Chrome profile on the stable alias, UI identity `student A`.
- Student B: independent Chrome Incognito window on the same alias, UI identity `student B`.
  User sign-in restored B's three existing materials, including the previously uploaded Markdown.
- App-anonymous context: ordinary Chrome on the immutable `djq3cyp24` hostname, authorized by the
  existing Vercel profile but without a HaUI student session. GET `/api/auth/session` returned
  HTTP 200 with `user` absent/null (logged as authenticated=false). This context reached the app
  normally; Deployment Protection was not disabled or bypassed.
- Final-build `/api/v1/health` returned HTTP 200 and `{"status":"ok"}` in B's authorized context.

### Markdown, TXT and PDF cloud regression

Three unique synthetic fixtures were selected in B's native file picker and uploaded together.
Network inspection observed POST `/api/documents/upload-intent` **HTTP 200**. Its request payload:

| File | Bytes | Requested MIME | Document ID | Upload-intent ID |
|---|---:|---|---|---|
| `acceptance-20261015.md` | 116 | `text/markdown` | `59a43664-4408-474f-9594-97ce4e1c6540` | `c6c1dfdf-6281-4fdf-add3-692b34f625af` |
| `acceptance-20261015.pdf` | 3,167 | `application/pdf` | `300cb90e-161b-4568-84e1-abb9fdc90d35` | `b5404dc6-d640-4688-a3bf-305b40907b37` |
| `acceptance-20261015.txt` | 119 | `text/plain` | `c95db999-179d-4e51-a923-65db8d1c7204` | `2628a126-a48f-4a02-b6ec-9457b4496acb` |

All three corresponding Blob PUT requests returned **HTTP 200**. For the Markdown PUT, the actual
request header was `Content-Type: text/markdown` and `X-Vercel-Blob-Access: private`. Each
`GET /api/documents/upload-intent/{id}` was subsequently revisited as a fresh browser navigation:
**HTTP 200**, intent `status: ready`, document `ingestionStatus: ready`, with the IDs above.

The ready page listed all three saved files. Markdown reader displayed the synthetic Seabird /
23-day facts; TXT reader displayed its different synthetic note and 23-day inspection cycle.
The new PDF loaded in Chrome's embedded PDF viewer as a three-page document (page 1: Softmax).
After navigation/refresh, B's learning space still showed six materials, including these three.
No indefinite loading state was observed in completed upload/reader/chat flows.

### Deterministic RAG defect and smallest fix

The original question was recovered from B's persisted cloud chat. Extracting the original
synthetic PDF locally and using production `chunkPages`/`rankDocumentChunks` reproduced zero
candidates: `which`, normalized `states` → `state`, `often`, and `should` were absent mandatory
ASCII anchors. The simpler `What is the calibration interval?` retrieved page 2 with score
1.3862943611198906. The new regression first failed (`undefined !== 2`) while four other ranking
tests passed. This is a demonstrated retrieval defect matching the observed pair of outcomes;
the original historical request trace was not retained, so that runtime path is not independently
proven from server telemetry.

The fix strips the reporting phrase `which/what page state(s)` from query terms while retaining
`page`, and treats the evidenced functional words `often`/`should` as stop words. It preserves the
technical noun `state` elsewhere and still refuses an absent Kubernetes anchor. No threshold,
candidate limit or lexical architecture changed. Afterward the exact original query retrieves
page 2 (score 2.0794415416798357, coverage 0.6); all five ranking tests pass and all 63 baseline
retrieval results remain unchanged. The live original-question retest below is separate evidence.

### Cloud RAG, false-abstain repair and persistence

On this final code build, B created a new chat and sent the recovered original question:
`Which page states how often calibration should be done, and what is the interval?`
The assistant answered that page 2 specifies every 17 days, with a citation to
`student-b-manual.pdf`, page 2. The citation excerpt contains that exact supporting fact.
The selected conversation, question, answer and citation remained after refresh.

B then asked `What is the Kubernetes deployment policy?`; the assistant abstained with the
standard insufficient-evidence response. The missing named anchor causes zero retrieved chunks
before model invocation. A's grounded supervised-learning answer and its citation also persisted
after refresh. B's re-login in a separate browser restored expected previously persisted data.

- New B conversation: `dc4e8db2-e98d-4918-a441-7b7e2bb675be`.
- A conversation: `6f3d5e86-6133-486e-8c14-d08f765ab6f6`.
- A cited chunk: `9f77f2d4-4076-405e-9a42-cb8c593504bd`.
- B page-2 chunk: `4d5e21cf-0ebc-439b-aa83-bddc0452d3f4`.
- Live LLM requests for this acceptance continuation: **2 of maximum 3**. The Kubernetes send
  followed the deterministic zero-candidate abstention path. No model request was needed to read
  historical chats, inspect citations, or run the security matrix.

### Observed cloud authorization matrix

All numeric entries below are observed application HTTP results on code `3f3b8bb`; edge 302s are
excluded. Study Set authorization is checked through the owner-scoped Study Set chat-session API;
A's own and foreign Study Set HTML requests additionally returned 200 and 404 respectively.
Document metadata is represented by owner-scoped listing/progress and the same owner lookup used
by the document routes; there is no separate per-ID metadata-only API to imply was tested.
Citation resolution uses the extracted-chunk endpoint, so those rows intentionally share a route.

| Resource / boundary | Owner | A accessing B | B accessing A | App-anonymous |
|---|---|---|---|---|
| Study Set (`/api/study-sets/{document}/chat/sessions`) | 200 | 404 | 404 | 401 |
| Document listing/progress metadata | 200 | 404 for foreign progress | 404 for foreign progress | 401 |
| Document byte route (`/api/documents/{id}`) | 200 for A text and B PDF | 404 for B PDF | 404 for A text | 401 for B PDF |
| Extracted chunk (`/api/documents/{id}/chunks/{chunk}`) | 200 for A and B | 404 | 404 | 401 |
| Chat history (`/api/chat/sessions/{id}/messages`) | 200 for A and new B chat | 404 | 404 | 401 |
| Citation resolution (same chunk route) | 200 for A and B | 404 | 404 | 401 |

The reverse byte check uses A's Markdown source, because A has no owned PDF. Anonymous checks use
B's known existing resources; not every resource ID in both accounts was separately tested.
The original B historical chat also returned 200 for B. Tests use existing real app users and
synthetic documents; no forged session, copied cookie or test-auth bypass was used.

A GET for B's new Markdown byte route with its actual storage key supplied as a query parameter
still returned **404**. Knowing the storage key does not grant access through that app route.
Direct access to the same private Blob pathname, without any signed token or storage credential,
returned **403** from storage in a separate unauthenticated terminal request.

### Private Blob bearer URL and evidence handling

The Vercel store was observed labelled **Private**. The upload is scoped to the owner's intent,
pathname, MIME and maximum size. Raw `BLOB_READ_WRITE_TOKEN` remains server-side in reviewed code;
it was never retrieved from the environment or Vercel. The tested browser upload used scoped,
temporary presigned authority, not a printed/read master credential. This is a bounded review and
network observation, not an exhaustive audit of all assets and traffic.

A reader-issued signed GET was exercised with `credentials: omit`; it returned **200**. This
confirms its intended bearer property: after authorized issuance, possession can grant temporary
access without an application cookie. It is not claimed to be student-bound. An expiry check against the same URL returned **403 after 311,264 ms**, beyond the five-minute
default lifetime. Initial GET was observed at 16:26:27 and the expired GET at 16:31:37 on
2026-10-15 (Asia/Ho_Chi_Minh). The URL stayed inside that page and was never printed by the
expiry script. Thus both temporary bearer access and expiration were observed on cloud.

**Evidence-hygiene exception:** an earlier native accessibility snapshot included a temporary GET
URL, and later broad header filtering inadvertently included partial presigned upload URL strings
and signature suffixes. These were tool-output observations, not committed artifacts or raw
OpenAI/Blob master keys. Subsequent collection uses strict field allowlists and prints only status,
MIME, IDs and access mode. The report does not claim that no temporary token material ever appeared
in tool output. This violates the task's stricter no-token-logging requirement; a clean acceptance
status must not silently omit it. Synthetic data and short-lived/path-scoped grants limit scope.

### Final local checks and Git publication

- Previous remote reported in the task: `48700ba080afdf895ba85bf945049b1964fee60e`.
- Actual fetched remote and local head at this continuation's start:
  `3da54c8241b36893d76e85bbf20d8b9eec5d5bc3`, ahead/behind 0/0. The seven commits since `48700ba`
  were already pushed and are listed in the earlier v1.2 section.
- New code commit: `3f3b8bb2472f97214ac6c665403595f12bcb0c66`,
  `fix(rag): normalize page-location question phrasing`, exactly two code/test files.
- All seven prior commits and this code commit are authored by
  `Nguyen hoai nam <namnh.audit@gmail.com>`, preserving the configured email, without co-author
  or AI attribution. No branch history was rewritten.
- Environment: macOS workspace, Next.js 16.3.6, local isolated fixture web/API servers, one
  Playwright worker. No Neon URL was supplied to regression tests.
- The web config/security suite also passed all 25 cases. Focused MIME/owner-validation tests
  passed 2/2. Changed tracked files were scanned for common credential and signed-URL patterns:
  zero matches. No actual `.env` is tracked; only `apps/web/.env.example` is tracked.


Full web regression after the RAG change: **148 passed, 8 skipped, 0 failed**. Ranking tests:
**5 passed** (the new test was first observed failing). The 63-turn offline corpus has no changed
baseline retrieval results. TypeScript, ESLint, Next.js build and `git diff --check` pass.
The fresh API run on 2026-10-15 has **1,577 passed, 14 skipped**; PostgreSQL-only skips remain
skips, and the historical isolated PostgreSQL runs are not represented as fresh executions.
No persistence/API code changed, no cloud database fixture run or migration was performed.

Report corrections present at task start remain preserved in the final report-only commit
containing this section. That evidence commit uses the configured author name/email and contains
no co-author or AI trailer. Its exact final SHA, remote equality, clean-worktree result and resulting
Ready Preview URL are reported in the final handoff after publication; the report cannot embed
its own containing commit hash. The cloud checks above targeted code `3f3b8bb`; the report-only
commit does not change that tested application code. Only the staging branch is authorized for
publication. No PR, merge, force push, Production change or cloud cleanup was performed.

### Residual risks

- **P0/P1 confirmed application defect:** none demonstrated by the bounded acceptance checks;
  this does not replace a comprehensive security audit.
- **P2 process/evidence exception:** temporary bearer URL material appeared in tool output, as
  disclosed above. Do not label this a zero-exposure run or silently declare strict SUCCESS.
- **P3:** repeated pg connection-string SSL-mode compatibility warnings; separate PostgreSQL
  integration results were not rerun; authorization tests are representative, not exhaustive.
- **Signed-GET expiration:** passed (initial 200; expired 403 after 311 seconds).
- **Strict closure:** PARTIAL solely because the no-token-logging invariant was not met in earlier
  tool output. No raw API/Blob master credential was retrieved, copied into an artifact, or
  committed. Later signed-URL tests used status-only output. Synthetic staging data is retained;
  no account/document was deleted and no direct cloud SQL cleanup was performed.

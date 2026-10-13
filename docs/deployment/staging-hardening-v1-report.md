# HaUI Compass staging hardening v1 — evidence report

**Status: PARTIAL**
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
Run date: 2026-10-12 (Asia/Ho_Chi_Minh). Branch: `feat/vercel-staging-deployment`.
Starting HEAD: `71b9d7d916face296285942c5f2563dd19b2e31f`.

### Credential safety gate

The exposed key value was not read from `.env`, fetched from Vercel, or copied into this report.
No live LLM calls or Vercel deployment actions were made during this attempt. The user must
explicitly confirm that the exposed key is revoked and a replacement staging key is saved as
`OPENAI_API_KEY` in Vercel Preview scoped to this branch before those actions can proceed.

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

No deployment was started, so there is no new Preview URL or deployed SHA for this closure.
Production Branch and Preview targeting were not rechecked in Vercel settings. TXT/MD/PDF cloud
uploads, metadata refresh, Student A/B isolation for metadata/bytes/chunks/chat/citations, private
Blob authorization, anonymous application authorization, and logout/re-login history persistence
remain unverified on the new build. The earlier v1.1 observations above are not evidence for this
commit.

| Staging check | Student A | Student B | Anonymous |
|---|---|---|---|
| Markdown upload on new Preview | Not run | Not run | — |
| TXT/PDF ingestion and metadata refresh | Not run | Not run | — |
| Document metadata, bytes, chunks, chat, citations | Not run | Not run | Not run at app boundary |
| Owner access | Not run | Not run | — |
| Private Blob through application authorization | Not run | Not run | Not run |
| PDF correct-document/page citation | Not run | Not run | — |
| Chat history after refresh and re-login | Not run | Not run | — |

### PDF false-abstain investigation

Code inspection shows chat requests require the active document to be `ready`, then query retrieval
with the authorized study set, owner, and active document ID. The retriever validates the document
and returns ranked chunks; there is no local score threshold that would force an abstention when
chunks exist. If chunks are empty, the application abstains before calling the model. Otherwise
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

At report update time, the branch was clean and five commits ahead of
`origin/feat/vercel-staging-deployment`; no push was made. The report update itself is now an
uncommitted working-tree change. The prior five commits remain in local history; no PR, merge,
force push, or Production deployment occurred.

Acceptance remains **PARTIAL**. The Markdown fix is locally verified, but essential cloud gates,
the Preview deployment with the rotated key, cross-user/private-Blob authorization checks, and
the PDF false-abstain diagnosis are unverified. Continue only after the credential safety gate is
explicitly confirmed and use the existing authorized Student A and Student B sessions.

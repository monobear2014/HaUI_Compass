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

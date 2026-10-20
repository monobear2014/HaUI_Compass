# Lecturer MVP release preflight

Author: Nguyen hoai nam

Execution status: the operator subsequently authorized staging push and Preview
deployment. See [cloud acceptance](lecturer-preview-acceptance.md) for the release
configuration and scoped results; the approval instructions below describe the
original preparation gate.

## Scope and Git inventory

Baseline branch: `feat/vercel-staging-deployment`, HEAD `66cf006`.
The staged diff was empty. All 18 pending paths were inspected and classified:

- API: `app_factory.py`, `simulated_workspaces.py`, new `api/lecturer.py`,
  `api/lecturer_fixture.py`, `domain/lecturer/__init__.py`.
- Authorization/KPI tests: `test_lecturer.py`, `test_simulated_workspaces_api.py`.
- Web auth/routing: auth action route, Compass proxy route, demo page,
  application frame, Compass auth component, auth navigation, proxy matcher,
  new `lib/lecturer-access.ts`.
- Browser config: `playwright.config.ts`, `playwright.lecturer.config.ts`.
- Specification: `docs/implementation/lecturer-dashboard-mvp.md`.

No unrelated files, dependencies, schema changes or migrations were pending.
`49cdc6a` and `66cf006` remain in history. The baseline lecturer UI depended on
untracked server authorization, API and fixture files; the integration commit
closes that dependency. Weekly UI uses existing weekly endpoints unchanged.
No planner/risk/replanner business logic changed.

## Preview prerequisites

Keep all existing Preview configuration from `vercel-staging.md`: dedicated web
PostgreSQL, API PostgreSQL, simulated workspaces, service binding/key, HTTPS origin,
private Blob and model settings. Do not enable `COMPASS_DEMO_AUTH` in Preview.

Lecturer additions require **no migration or database fixture load**. They read a
static, versioned synthetic fixture from Git. API remains compatible with
`0004_simulated_workspaces`; existing web migration history is unchanged. Local
PostgreSQL integration validates the existing schema path, not the current remote
Neon state. Do not reset Neon or rerun migrations solely for this lecturer release.
Before deploy, verify the staging API still reports revision `0004_simulated_workspaces`
using the established controlled read-only database procedure.

Provision an ordinary synthetic lecturer account through registration on the
existing protected Preview. Obtain its immutable account ID from its own authenticated
`/api/auth/session` response in the browser; do not paste cookies or the response into
logs. Configure this server-only value identically on **web and API**, Preview scope:

```text
COMPASS_LECTURER_GRANTS={"<lecturer-account-id>":["canvas-demo-ai","canvas-demo-small"]}
```

Do not grant `canvas-demo-other`; the negative smoke expects it to be unassigned.
Student A and B must be distinct registered synthetic accounts without grants.
There is no public lecturer signup or hard-coded Preview demo password.

## Safe Preview smoke (user-run after approved deployment)

Use an encrypted environment or hidden shell prompts to populate `PREVIEW_URL`,
`STUDENT_A_USERNAME`, `STUDENT_A_PASSWORD`, `STUDENT_B_USERNAME`,
`STUDENT_B_PASSWORD`, `LECTURER_USERNAME`, `LECTURER_PASSWORD` and, if needed,
`VERCEL_AUTOMATION_BYPASS_SECRET`. Do not put credentials in command arguments,
committed dotenv files, shell history or debug output.

From `apps/web`:

```sh
node scripts/preview-lecturer-preflight.mjs
```

The script logs only fixed check labels, PASS/BLOCKED and sanitized HTTP status
records via `scripts/staging-evidence.mjs`. It keeps credentials and cookies in
memory, disables redirects for auth evidence, never logs caught errors and writes
no trace, screenshot, HAR or response-body artifacts. It checks three distinct
identities, student workspace access and cross-account query denial, both student
lecturer denials, lecturer student-route denial, unassigned class 404, 50%=6/12,
fixed observation time and complete small-cohort suppression. Login creates normal
sessions; workspace GETs can lazily initialize a synthetic workspace.

Then perform the full browser acceptance in separate A/B/Lecturer profiles:

1. A: plan → edit candidate → preview → approve once → start/complete → log time →
   risk/replan → next day → reload. Confirm approval controls remain reachable on
   desktop and 390px mobile, and approved state persists.
2. B: initial week/clock remains independent; A's edits, logs and plan are absent.
   Complete B's own cycle and reload A to verify independence in both directions.
3. Lecturer: normal login lands at `/lecturer`, observation time is 12:00 UTC+7,
   main class shows 50%, small class has no counts/progress; verify desktop/mobile
   layout and formula keyboard access. Student learning APIs return 403.
4. Student role injection and lecturer class isolation are covered by local tests;
   repeat status-only HTTP probes with the script on the new immutable Preview.

This smoke does not certify private document bearer access. Follow
`signed-url-evidence.md` separately if document access is part of acceptance.
Do not use the legacy Preview Playwright trace configuration with real credentials
or signed authority; this handoff intentionally avoids that artifact capture.

## Release gates

Local test results and clean Git snapshot verification are recorded in the
implementation document. Local PASS permits requesting user approval to push and
create a **Preview only** deployment. It does not certify live Preview acceptance.
After approval: push this feature branch, deploy Preview, verify immutable deployment
commit/environment, run the safe smoke plus A/B browser scenario, record sanitized
results. No PR, merge, Production action or Neon reset is authorized.

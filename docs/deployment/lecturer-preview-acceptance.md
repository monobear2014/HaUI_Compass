# Lecturer MVP + Student Core Flow Preview acceptance

Author: Nguyen hoai nam

Date: 2026-10-18. Scope: Vercel **Preview** only, staging branch
`feat/vercel-staging-deployment`. No Production deployment, PR, merge, database
migration, database reset or planner/risk/replanner change.

## Deployment and configuration

The operator authorized configuration, non-force staging push, Preview deployment
and synthetic end-to-end acceptance in this release session.

Application release SHA: `5f441e56d42b5656d235a456515bb55586eeedc9`.
Immutable application acceptance URL:
<https://haui-compass-k3hxr330r-nam-4b71.vercel.app/>.
Vercel deployment: `dpl_FJJzPSHmeNQHVN6vWPNi7yEtroAt`, READY, Preview
(`target: null`, not Production); Production Git branch remains `main`.

An ordinary synthetic lecturer account was created through the existing registration
route. A branch-specific encrypted `COMPASS_LECTURER_GRANTS` variable grants only
`canvas-demo-ai` and `canvas-demo-small` for Preview on the staging branch. It is a
project variable inherited by both Services; successful web-derived lecturer role
and API authorization independently verify consistent grants. The decrypted value
was compared in memory. No demo-auth/test-storage environment variable was enabled.
Credentials, bypass authority and account IDs are intentionally omitted here.

Neon Console verified `0004_simulated_workspaces` using:

```sql
BEGIN READ ONLY;
SELECT version_num FROM public.alembic_version;
COMMIT;
```

The existing dedicated project `neon-cinereous-castle` / database `neondb` uses its
`main` database branch for staging (this is unrelated to the Git Production branch).
No cloud schema migration or database fixture import was needed. CLI authentication
was expired; the existing authenticated Console session provided read-only evidence.

## Evidence collection

`playwright.release.config.ts` uses real cloud application routes and real registered
synthetic accounts, with no API mocking. It runs desktop (1280×900) and mobile
(390×844). Traces, video and screenshots are disabled. Automatic page snapshot
capture is disabled, output artifacts are not retained, and the release reporter
outputs only fixed test/step labels, statuses, durations and numeric failure lines.
The runner never exports response bodies, auth headers, cookies or caught errors.
The separate HTTP smoke uses the allowlist from `scripts/staging-evidence.mjs`.
No private document reader, signed Blob URL or live document-access probe is involved.

The first lecturer attempt was interrupted because the new test used English auth
labels while Preview defaults to Vietnamese. The test now accepts both languages;
application code was unchanged. No failed application check was concealed by that
harness correction.

## Acceptance results

| Cloud browser acceptance | Result |
| --- | --- |
| Lecturer desktop | PASS, 11.5 seconds |
| Student A/B desktop | PASS, 222.3 seconds |
| Lecturer mobile | PASS, 8.0 seconds |
| Student A/B mobile | PASS, 226.2 seconds |

Application sources are unchanged by the bilingual locator correction and artifact
retention settings in the release harness. The final test/documentation successor is checked against the same application
tree; its own Preview URL and SHA are reported in the release handoff after READY
and a fresh smoke. This avoids claiming that a commit can contain its own SHA.

The independent safe HTTP smoke passed all checks:

| Check | Observed |
| --- | --- |
| Student A/B own workspace | 200 / 200 |
| Student A/B lecturer access | 403 / 403 |
| Student A/B foreign identity query | 403 / 403 |
| Lecturer assigned aggregate | 200 |
| Lecturer student workspace | 403 |
| Lecturer unassigned class | 404 |
| 50% = 6/12, observation timestamp, entire small-cohort suppression | PASS |

The lecturer browser contract checks normal login navigation, KPI scale and formula,
keyboard disclosure, fixed 12:00 UTC+7 observation timestamp, no horizontal overflow,
small cohort with no count/progress, unknown/unassigned class 404 and lecturer
student-route 403. An explicit response-key allowlist rejects individual identifiers,
names, emails, grades, submission bodies and histories. Registration with a lecturer
role and forged identity headers still returns a student role and denies lecturer API.

The Student A/B browser scenario covers Plan → Do → Adapt → Reflect → next week:
AI breakdown with edited candidate, preview and approval; completed execution with
80 logged minutes; busy-day replanning revision 2; reflection with selected signals
and difficult-topic carry-over; next-week plan approval; login persistence. B has
separate tasks, plan/history and virtual clock, cannot read/modify A through query,
JSON body, mixed-case JSON media types or borrowed task IDs. Resetting B's own
synthetic scenario does not reset the database or affect A.

Local validation before the first push: TypeScript, ESLint, 30 config/security tests
and whitespace checks PASS. Previous full local preflight remains applicable because
this session changes only test harness/configuration and release documentation.

## Result and reproduction

**SUCCESS: full cloud acceptance 4/4 passed**, plus all nine HTTP status probes and
the aggregate KPI/suppression contract. Sanitized machine-readable evidence is in
[evidence/lecturer-preview-20261018.json](evidence/lecturer-preview-20261018.json).
No application fix or schema migration was required. The bilingual test locator and
artifact-retention settings are the only corrections after the first staging push.

To repeat from `apps/web`, load `PREVIEW_URL`, `LECTURER_USERNAME`,
`LECTURER_PASSWORD` and existing `VERCEL_AUTOMATION_BYPASS_SECRET` from a secure
environment, then run:

```sh
npx playwright test --config playwright.release.config.ts
```

This creates fresh synthetic Student A/B accounts for each viewport, logs in to the
already provisioned lecturer account, and retains only the safe reporter records.
Do not add Playwright debug logs, a raw JSON reporter, traces or document probes.
The standalone status smoke also requires separate `STUDENT_A_*` / `STUDENT_B_*`
credentials as described in the preflight runbook.

No blocker remains for this scoped Preview release. This is not a Production or
private-document-access certification; those remain outside this acceptance.

# Basic learning companion acceptance — 2026-10-19

The current delivery targets the basic requirements supplied by the project owner.
Use simulated courses, assignments, deadlines and submissions. Keep advanced Canvas,
multi-agent, Qdrant, reranking, Redis and 1,000-user load claims outside this release.

## Acceptance map

| Requirement | Current implementation / evidence | Boundary |
| --- | --- | --- |
| Online app and two roles | Existing Vercel Preview and Google/password auth; backend lecturer grants, class scoping | This change has local evidence only; revalidate the new release online |
| Weekly goals | `/plan`, saved weekly goal and availability, proposed plan requires confirmation | Mock LMS assignments; not a real Canvas connection |
| Task decomposition | Existing candidate generation and explicit selection/confirmation in the plan flow | Offline fallback remains usable; offline tests do not prove live model quality |
| Deadline reminders | `/today` and `/plan` show approaching deadlines, including assignments without tasks and completed-task assignments | In-app reminders only; no scheduled email/push. Verify actual submission on LMS |
| End-of-week reflection | `/reflect`, weekly summary, confirmation and next-week adjustment | Student confirmation remains the write boundary |
| Lecturer aggregate dashboard | `/lecturer`; server-provisioned role, assigned classes only, suppress cohorts smaller than five | Fixture aggregate counts; not aggregation of actual student workspaces |
| Before/after on-time KPI | Per-period numerator/denominator, percentage-point difference, unknown when denominator is empty | Hand-authored synthetic periods illustrate arithmetic; no causal improvement claim |

## Demonstration

1. Sign in as a student. `/learn` offers Plan → Do → Reflect without requiring upload.
2. Open `/plan`, enter a weekly goal and availability, split an assignment, select
   candidates, preview and approve. Verify no tasks/plans are saved from a proposal alone.
3. Open `/today`, start and finish a task with actual study time. Check progress.
4. Advance the simulated clock using demo controls. Missed study blocks can trigger
   a proposed adjustment; approve before applying it.
5. At week end open `/reflect`, review the week and confirm reflection signals.
   Inspect the next week's goal/plan suggestions.
6. Use a separately authorized lecturer account. Inspect assigned-class totals and
   before/after periods. A small cohort exposes neither totals nor comparison.
7. A student cannot obtain lecturer access by sending a role field or changing a URL.

For local browser tests, the synthetic `student-demo` account is provisioned as a
lecturer only by `playwright.lecturer.config.ts`. Do not enable that grant in the
normal student test suite. Real deployment grants use account IDs, never browser claims.

## KPI semantics

An obligation is one student × assignment. Only obligations whose deadline is at or
before the observation time enter the denominator. Submission exactly at deadline is
on time. Unobserved future submissions count as missing; assignments without deadlines
are excluded. Task completion does not establish submission.

Compare rates as percentage points, not relative percent growth. Display both
denominators; preserve unknown values rather than converting an empty period to 0%.
Extensions/exemptions must be normalized into the authoritative obligation dataset
before future real-data use. The current mock corpus has neither.

## Local validation commands

```sh
cd apps/api
uv run --extra dev pytest tests/unit/test_lecturer.py tests/integration/api/test_weekly_cycle_api.py tests/integration/api/test_simulated_workspaces_api.py -q
```

```sh
cd apps/web
npm run typecheck
npx playwright test tests/weekly-cycle.spec.ts tests/deadline-reminders.spec.ts --project=desktop
npx playwright test --config=playwright.lecturer.config.ts
```

The weekly-cycle test exercises the real demo API and deterministic/offline adapters.
The deadline regression test modifies synthetic context to cover missing/completed
tasks. Lecturer tests exercise role rejection, class isolation, small-cohort suppression,
percentage scale, before/after arithmetic presentation and desktop/mobile layouts.
These checks do not replace a PostgreSQL persistence or hosted acceptance run.

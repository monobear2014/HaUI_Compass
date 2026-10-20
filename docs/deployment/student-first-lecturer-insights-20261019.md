# Student-first and lecturer expansion — protected Preview acceptance

Date: 2026-10-19. Stable app: <https://haui-compass.vercel.app/>.
Immutable release: <https://haui-compass-k2wq9zdat-nam-4b71.vercel.app/>.
Deployment `dpl_A5wz3RGJmCXjmqsA5caisnoQkHFm` is READY, Preview.
Both stable and compatibility aliases point to it. Deployment protection, existing
roles/grants and roster configuration remain. No schema migration, new paid service,
Production promotion or global reset was needed.

[Implementation and student-first acceptance](../implementation/student-first-and-lecturer-insights.md)
describe scope, controls and verification. Tests use synthetic data only.

## Hosted API acceptance

- Existing simulated submission records agree with the owning student's workspace
  context. Lecturer assignment-detail counts agree with class overview totals.
- The five-learner class exposes five mock assignments; the small class returns
  suppressed detail without a cohort count or assignment cells.
- Students receive 403; an unassigned/unknown class receives 404. Browser-selected
  rosters do not change the response. Account IDs, private task titles, goals,
  reflections and conversations are absent from the new detail contract.
- One previously untouched enrolled synthetic learner submitted its first assignment
  early. That assignment's aggregate on-time count rose by one, while the already-due
  denominator and task completions remained unchanged.
- Advancing that learner's clock created an upcoming 48-hour obligation. Distinct
  learners with upcoming unsubmitted work rose from one to two. The two learners
  with overdue work and four without saved plans were unchanged.

## Hosted browser acceptance

Normal lecturer login showed the live detail and the same support counts. Class
selection, course/attention filters and deadline sorting worked. CSV export produced
its UI acknowledgement. The browser connector did not observe the Blob download
event, so hosted file completion/content is unverified; desktop/mobile local browser
tests did download and inspect the filtered CSV and verified formula-prefix handling.
No app/auth/storage change was made to compensate for that connector observation.

The small class displayed no analysis/export controls. Normal lecturer logout and
student login worked. The student could combine course/submission filters and see
an explicit empty result. The personal KPI showed “no assignments due yet” with
0/0 rather than inventing a rate, and the recorded submission was absent from open
deadlines. Student and lecturer layouts had no horizontal overflow at 390px;
temporary viewport overrides were reset.

The final production-build student PostgreSQL flows passed on desktop/mobile,
including a full Plan–Do–Adapt–Reflect cycle, per-account isolation, assignment
filters, persisted server timestamps and the personal 50% = 1/2 KPI after a late
submission. All 24 lecturer UI tests and 30 final statistics/reminder/CSV regressions
passed. The backend unit/API suite passed 1,620 tests, with additional real-PostgreSQL
insight reporting across fresh API instances. Build, typecheck, lint and configuration
checks passed. No new live-model evaluation claim is made; AI behavior was unchanged.

[Sanitized evidence](evidence/student-first-lecturer-insights-20261019.json) records
only checks and aggregate outcomes. The existing basic MVP limitations remain:
simulated LMS clocks/data, in-app reminders and aggregate teaching support rather
than real Canvas synchronization or validated individual risk predictions.

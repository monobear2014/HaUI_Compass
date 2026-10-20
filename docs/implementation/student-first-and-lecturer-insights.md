# Student-first completion and lecturer insights

Date: 2026-10-19. Scope: basic companion using per-account simulated LMS data.

## Student acceptance first

The existing student loop remains goal → syllabus/assignment decomposition →
confirmed plan → task execution → reschedule → reflection → next-week plan, with
course-grounded Q&A and optional private documents alongside it.

This iteration closes gaps found during the audit:

- `/academic` supports assignment search, course filtering and authoritative
  submission-state filtering, with an explicit no-results state.
- Submission status now uses the same authenticated workspace snapshot as deadline
  reminders. A second independent submission-status request was removed so an old
  response cannot overwrite a newer submission in the UI.
- `/dashboard` keeps an assignment deadline until a submission is actually recorded,
  including assignments whose study tasks are completed. Submitted assignments leave
  the open-deadline list even if some study tasks remain.
- The personal simulated-submission card shows on-time/late/overdue/pending counts,
  the due-obligation denominator and its rate. Early future submissions appear in
  counts but do not enter the KPI until the deadline matures.
- In-app reminders include overdue unsubmitted work and a working assignment link.
  Mock submission facts are labelled separately from actual Canvas submission.

The selected statistics/planning/reflection/knowledge/reminder regressions passed.
The final production-build PostgreSQL tests passed all four desktop/mobile cases:
independent-account full weekly cycles and submission/filter/personal-KPI flows.
An initial accessibility test exposed ambiguous select labels; explicit labels were
added and the final four cases passed. No live user data or global reset was used.

## Lecturer functions added after student validation

The lecturer keeps the live class overview and before/after submission KPI. New
functions are:

1. Select one assigned class or view all assigned classes.
2. Open assignment-level live analysis on demand.
3. See aggregate submission punctuality, overdue work, upcoming 48-hour obligations,
   completed study tasks and recorded study minutes for each mock assignment.
4. See counts of distinct learners with overdue work, approaching deadlines or no
   saved plan, with transparent suggestions for supporting the class.
5. Search assignments, filter by course or attention signals, and sort by attention,
   deadline or course.
6. Export the currently filtered aggregate assignment rows as UTF-8 CSV.
7. Retry failed detail requests; refresh overview and opened analysis; pending and
   empty states prevent exporting stale/absent detail data.

These are observability and teaching-support functions, not a gradebook or an
individual student-risk scoring system. No student identity, private task title,
goal text, chat or reflection content is returned. Suggestions do not send messages,
change deadlines or take decisions about a learner.

## Server boundary

`GET /api/v1/lecturer/classes/{class_id}/insights` uses the same service-key,
immutable-account grant and explicit-roster checks as the existing overview.
Unknown and unassigned classes both return 404; students cannot access the endpoint.
Only initialized current-generation workspaces count, duplicates and lecturer
accounts are excluded, and a GET never seeds a workspace. Below five learners,
`detail` is null and no count or assignment cell is exposed.

A shared mock curriculum key joins equivalent assignments across account-specific
UUIDs. Those UUIDs never leave the detail API. Counts use each learner's virtual
clock. `due_soon` is an unsubmitted obligation within the next 48 hours; it is not a
prediction. Support counts deduplicate learners within each signal; signals may
overlap. This bounded threshold is not a formal guarantee against all auxiliary
information, and real university deployment needs a separate disclosure review.

CSV export serializes an explicit aggregate-column allowlist, quotes all fields,
escapes embedded quotes and neutralizes spreadsheet-formula prefixes. It does not
serialize the response object or learner state. Suppressed detail cannot be exported.

## Verification

- Backend unit/API suite: 1,620 passed.
- New API integration covers evolving submission counts, unique-learner signals,
  no-identity output, cohort suppression, role/class boundaries, ignored browser
  rosters, reset generations and approaching deadlines.
- PostgreSQL detail reporting was checked across fresh API instances using the real
  repositories; the existing migration is unchanged.
- Lecturer desktop/mobile suite: 24 passed, including detail failure/retry,
  class/course/search/attention filters, sorting, CSV download contents and layout.
- Final statistics/reminder/CSV regressions: 30 passed. CSV formula injection and
  no-denominator submission semantics are covered.
- TypeScript, ESLint, Ruff, mypy, configuration/evidence checks and production build
  passed. Full live-model evaluation was not repeated: AI prompts/models were not
  changed in this iteration.

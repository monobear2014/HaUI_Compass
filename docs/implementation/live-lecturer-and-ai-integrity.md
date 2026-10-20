# Live simulated activity and academic-integrity acceptance

Date: 2026-10-19. Scope: basic Plan–Do–Reflect companion, no new infrastructure.

## Live class reporting

`COMPASS_LECTURER_GRANTS` continues to authorize immutable lecturer account IDs and
assigned class IDs. Configure the API's server-only `COMPASS_SIMULATED_CLASS_ROSTERS`
as a JSON map from class ID to enrolled simulated account IDs, for example:

```json
{"canvas-demo-ai":["student-a","student-b","student-c","student-d","student-e"]}
```

These are placeholders, not deployed accounts. Registration does not automatically
enroll users or grant teaching rights. This basic release deliberately has no public
roster editor. Keep roster values out of public/browser environment configuration.

The API reads only explicitly rostered, initialized workspaces. Duplicate IDs count
once, lecturers are excluded, malformed rosters fail closed and retired generations
are ignored. A lecturer GET never seeds or resets a student's data. Cohorts smaller
than five initialized learners return no enrollment count or activity numbers.

Reports contain aggregate task totals/completions, total study minutes, number of
learners with approved plans and number with confirmed reflections. No task title,
goal text, reflection content, student ID or learner name is returned. Totals cover
each account's current simulated generation, not a synchronized real-world week;
virtual clocks may differ between learners. These are aggregate/de-identified reports,
not a formal anonymity guarantee against all auxiliary information.

Submission KPI now comes from explicit simulated submission events, stored in
`simulated_submissions` (migration `0005`). The server records the workspace's virtual
clock; client timestamps are rejected, repeated/concurrent submissions retain the
first timestamp and account/generation ownership is enforced. Completing a study
task never becomes a submission event. `/academic` exposes one submission action
per assignment and replaces it with a timestamp/status after success. Submitted
assignments no longer produce deadline reminders.

The “before” period contains one explicitly synthetic historical obligation per
enrolled learner. The “after” period uses current-generation assignment deadlines
and recorded mock actions, evaluated at each learner's virtual clock. The rate is
on-time submitted obligations / all obligations already due, multiplied by 100;
not-yet-due submissions do not enter the denominator. No due assignments yields a
null rate, not zero. The comparison demonstrates measurement; it does not establish
actual learning improvement or a causal effect. The legacy fixed-value fixture
requires `COMPASS_LECTURER_FIXTURE=1`, used only by isolated regression tests.

The dashboard refreshes every 30 seconds while visible and has a manual refresh
button. Requests are `no-store`; failures display an error rather than silently
claiming stale counts are newly updated. The only new infrastructure change is an additive PostgreSQL table; no vector
database or cache service is needed.

## Academic-integrity boundary

A bounded Vietnamese/English rule set catches explicit outsourcing requests with
assessment context, including recent user-message context in follow-ups. It returns
fixed guidance to explain, outline, hint or review the student's own attempt before
calling a provider. Negated requests such as “đừng làm hộ” remain eligible for help.
This check covers public knowledge queries, internal private-document answer routes
and the shared generation service. User claims of teacher permission do not change
the model instructions. Retrieved text is treated as untrusted data.

Existing source-handle validation remains authoritative: unknown/duplicate/empty
citations, provider abstention and invalid outputs cannot become cited answers.
Missing evidence stops generation. A citation proves provenance mapping, not full
semantic correctness; no universal hallucination-free claim is made.

The deterministic rule set does not cover every paraphrase or adversarial request.
Model instructions provide another layer, but classifier accuracy and pedagogical
quality need a larger labelled dataset and human review before real student use.

## Verification

- API integration exercises five enrolled accounts, a full student week, live count
  changes, an outsider, teacher/student denials, deduplication, small-cohort suppression,
  malformed rosters and reset isolation.
- Browser regression covers desktop/mobile live display and manual refresh separately
  from the legacy fixture presentation tests.
- Grounding/integrity integration checks legitimate explanations, no evidence,
  irrelevant evidence in existing knowledge tests, forged citations, explicit graded
  outsourcing and follow-up context. Provider calls are counted to establish that
  deterministic refusal does not send the request to the model.
- A six-case live-model smoke uses only synthetic 3NF text: explanation with source,
  unrelated-evidence abstention, empty evidence, graded outsourcing, graded follow-up
  and document prompt injection. Three cases call the provider; three stop locally.
  All six passed the bounded checks. This is a smoke test, not a RAGAS benchmark or
  a population-level estimate of model accuracy.

Current implementation has no roster management UI and no claim of 1,000-user
performance. Historical fixture acceptance documents
remain records of their earlier deployments.

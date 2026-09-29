# Manual import pilot demo

This reproducible thesis demonstration needs no HaUI API, login, credential, or
institutional LMS access. Use only fictional data or the student's own authorized data.
For the PostgreSQL validation commands and current validation boundary, see
[the pilot validation runbook](pilot-validation-runbook.md).

1. Start the PostgreSQL-backed API after `alembic upgrade head`, then start the web app.
2. Open **Academic Data** and import
   [academic-import-v1.json](examples/academic-import-v1.json), or enter one course and
   assignment manually. The page identifies the source as JSON/CSV/Manual.
3. In Current imported data, choose **Create study task** for an assignment and confirm
   its focused-study estimate. This is explicit; importing an assignment never creates work.
4. Use the existing weekly-plan API/UI with the same student/source identity to generate
   a plan, then obtain its daily recommendation.
5. Record an execution, submit/confirm a reflection, replan, and inspect plan history.

The imported source is user-provided pilot input. Compass owns the created task, plans,
executions, and confirmed reflections. Re-importing exactly the same dataset succeeds
idempotently; material changes conflict until the source is explicitly cleared. Clear is
blocked if it would orphan an existing task.

In the development/pilot workspace, importing a source selects it explicitly. Today and
Weekly Plan then request the same source and student context from the API rather than
`MockLMS`. This remains user-provided pilot input rather than a claim of official HaUI
connectivity.

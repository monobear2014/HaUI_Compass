# Manual import pilot demo

This reproducible thesis demonstration needs no HaUI API, login, credential, or
institutional LMS access. Use only fictional data or the student's own authorized data.

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

Known limitation: the current visual workspace still defaults to its separate fictional
Mock-LMS demo context. The Academic Data page performs the real import/task API actions,
but a source-switching workspace context for Today/Plan is future polish rather than a
claim of official HaUI connectivity.

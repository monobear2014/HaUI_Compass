# Academic import v1

**Status:** IMPLEMENTED for in-memory development and PostgreSQL composition. It is
student-provided pilot input, not direct HaUI LMS integration.

`haui-compass-academic-import-v1` normalizes manual, CSV, and JSON-shaped input
into the existing `LMSCourseRecord`, `LMSAssignmentRecord`, and
`LMSSubmissionRecord` boundary. Namespaces are `manual`, `csv`, and `json`, so
the same external ID in different sources cannot collide.

## JSON

```json
{
  "schema_version": "haui-compass-academic-import-v1",
  "student_external_id": "demo-student",
  "source": "json",
  "courses": [{"external_id": "db", "name": "Databases", "code": "DB101"}],
  "assignments": [{"external_id": "schema", "course_external_id": "db", "title": "Schema report", "deadline": "2026-10-08T17:00:00+07:00", "estimated_effort_minutes": 90}],
  "submissions": [{"assignment_external_id": "schema", "status": "not_submitted", "submitted_at": null}]
}
```

`estimated_effort_minutes` is a Compass/user planning estimate. It is not
academic data asserted by HaUI or another LMS.

## Canonical CSV

Only this exact header order is accepted:

```text
course_id,course_name,course_code,assignment_id,assignment_title,deadline,submission_status,submitted_at,estimated_effort_minutes
```

Each row represents one assignment and repeats its course fields. Repeated course
IDs must have identical course details. Timestamps must be ISO-8601 with an
explicit offset. Blank deadline means unknown; blank submission fields mean no
submission record.

## Semantics and safety

- Imports are validated before replacement; duplicate IDs, orphan assignment/course
  references, orphan submissions, invalid status, naive timestamps, and negative
  effort are rejected.
- An exact retry is idempotent. A changed dataset for the same source/student is a
  conflict and must be cleared explicitly before replacement.
- No uploaded file is executed or retained. CSV content is parsed as text with a
  one-megabyte API limit.
- Import only your own academic information or authorized fictional data. Do not
  enter student passwords, tokens, grades, submission files, or other students'
  data.

## Persistence and tasks

PostgreSQL uses relational `academic_sources`, `imported_courses`,
`imported_assignments`, and `imported_submissions` tables. Each source is scoped to a
derived Compass student identity plus its `manual`/`csv`/`json` namespace. The import
transaction either commits a complete normalized dataset or writes nothing.

The Academic Data page supports manual entry, CSV/JSON selection, current-data display,
and explicit **Create study task** actions. An assignment never creates a Task by itself.
Clearing a source is refused when any existing Compass task refers to one of its
assignments; tasks, plans, executions, and reflections are never deleted by reset.

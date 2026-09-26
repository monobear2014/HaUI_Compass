# IntelliPlan LMS Integration Reference

- **Status:** Research note (not a decision). Read-only study; no IntelliPlan code or provider constants were copied.
- **Date:** 2026-09-27
- **Reference:** `.references/IntelliPlan` at commit `78731438d0bd71524d99ec1bc32b3dfafe1cb75d` (git-ignored). Licence caveat: the repository has no LICENSE file, so only concepts may be reused ([`intelliplan-audit.md`](intelliplan-audit.md) §2).
- **Purpose:** inform the `LMSProvider` port and `MockLMSProvider` ([ADR-0001](../decisions/0001-python-package-and-domain-boundaries.md), `application/ports`, `infrastructure/lms`).

All paths are relative to the IntelliPlan repository root.

## Scope inspected

| Module | Role |
|---|---|
| `intelliplan/integrations/lms/base.py` | Typed `LMSProvider` ABC, `LMSCourse`, `LMSAssignment`, `StubProvider` |
| `intelliplan/integrations/lms/registry.py` | Key → provider class map |
| `intelliplan/integrations/lms/{moodle,blackboard,google_classroom,powerschool}.py` | The four typed providers (Moodle read in full) |
| `intelliplan/api/lms_sync.py` | The only consumer of the typed providers |
| `canvas_helper.py`, `canvas_oauth.py`, `canvas_routes.py` | Legacy Canvas integration |
| `studentvue_helper.py`, `studvue.py`, `schoology_helper.py` | Legacy StudentVUE and Schoology integrations |
| `intelliplan/repositories/assignments.py`, `intelliplan/domain/assignment.py` | Where loose rows become the canonical `Assignment` |
| `docs/scheduler-audit.md` | IntelliPlan's own account of the two parallel layers |

## Provider architecture

IntelliPlan has **two parallel integration styles**, not one:

1. **Typed providers** (`intelliplan/integrations/lms/`): an abstract `LMSProvider` with OAuth-shaped methods (`get_authorize_url`, `exchange_code`, `refresh_tokens`) plus `list_courses` and `list_assignments`, returning frozen dataclasses. Four providers implement it (Google Classroom, Blackboard, Moodle, PowerSchool), with `StubProvider` for uncredentialed ones. A registry maps keys to classes.
2. **Legacy helpers** (repository root): `canvas_helper.py`, `studentvue_helper.py`, `schoology_helper.py`. Module-level functions taking credentials as arguments (`(canvas_url, token)`, `(district_url, username, password)`, `(key, secret)`) and returning **untyped dicts**.

**Why Canvas and StudentVUE sit outside the typed abstraction.** The structure suggests the legacy helpers came first and the planner was built on their dict shape, with the typed layer added later (the shallow clone has no history, so this ordering is an inference, not a verified fact). Canvas's own docstring says it returns assignments "in StudentVue-compatible shape" (`canvas_helper.py:167`), i.e. one legacy helper mimics another rather than implementing a shared interface. And the two styles are not merely parallel: **`LMSAssignment` and `sync_all` are consumed in exactly one place, `intelliplan/api/lms_sync.py:99`, which only counts the result** (`row.last_sync_count = len(assignments)`). The typed records are not what feeds planning. `AssignmentRepository` merges loose dicts from legacy fetchers (`intelliplan/repositories/assignments.py`, "same shape as `/tasks/unified`"). The typed layer therefore adds surface area without being the canonical data path, which matches the finding in `docs/scheduler-audit.md` that two normalisation layers run in parallel.

## Course normalization

- Typed: `LMSCourse(external_id, name, section, teacher_name, meta)`, with the id **namespaced by provider** (`"moodle:<id>"`), so two providers cannot collide (`moodle.py`).
- Legacy Canvas: `get_courses` returns only `[{"name": ...}]`; course identity travels as a name string (`course_map`, `canvas_helper.py:171`). Assignments carry `course` (a display name) and `course_id` as strings.

## Assignment normalization

- Typed: `LMSAssignment(external_id, course_external_id, title, due_at, description, points_possible, url, submitted, graded, score, meta)`. `due_at` is a `datetime`; Moodle converts a Unix timestamp to UTC (`moodle.py`).
- Legacy Canvas: `get_assignments` builds a dict per assignment. **`due_date` is `due_str[:10]`, a date string**, so time of day and timezone are discarded at the boundary. The same function also *computes planning fields*: a `priority` ("High/Medium/Low" from days to due), an `estimated_time` from a heuristic, a display `color`, and `points_possible` defaulted to `60` when missing. Ingestion and planning heuristics are fused in the adapter.
- The canonical `Assignment` (`intelliplan/domain/assignment.py`) has `due_date: date`. Assignment *kind* is inferred from **title regexes** in the repository (`_KIND_PATTERNS`: "exam", "project", "quiz", and so on).

## Submission state

- The typed `LMSAssignment` has `submitted: bool`, `graded: bool`, `score`. A search finds **no typed provider that sets `submitted`** (the field is only defined in `base.py:40`), so it is a placeholder in practice.
- Canvas has real submission handling in the legacy code (`_assignments_with_submissions`, `get_missing_assignments`, gradebook functions), but it is in loose dicts and feeds grades and "missing" lists, not the typed record.
- The canonical `AssignmentStatus` is IntelliPlan's own lifecycle (`not_started`, `in_progress`, `completed`, `dismissed`), not the LMS's submission state.

## Provider leakage / coupling

- **Raw payload leaks into the normalized record:** Moodle sets `meta={"raw": c}` on every `LMSCourse` (`moodle.py`), so provider-specific JSON travels with the "normalized" object.
- **Errors are swallowed:** `_call` returns `None` on any non-200 or bad JSON, and providers then return empty lists. "Not connected", "wrong token", and "no courses" are indistinguishable. Canvas `get_assignments` skips a whole course on any exception.
- **Configuration inside the adapter:** providers read environment variables (`MOODLE_BASE_URL`) and take OAuth tokens as method arguments; credentials are part of the call shape, so the interface cannot be satisfied by a credential-free source.
- **Sensitive credentials:** StudentVUE takes a username and password on every call.
- **Planning heuristics in ingestion** (priority, estimates, default 60 points), as above.
- **Loose dict contracts** downstream: every consumer re-parses keys such as `due_date`.

## Useful concepts

- **Provider-namespaced external ids** (`"provider:id"`), so identifiers from different systems cannot collide, and the external id is kept separate from any internal id.
- **Frozen, normalized records** with a timezone-aware `due_at`, converted to UTC at the boundary.
- **A small course and assignment record** as the only thing the rest of the system sees; a `registry` to choose a provider.
- **Doing normalization at the boundary and keeping the domain type pure**: IntelliPlan's `Assignment` docstring states conversion "lives in the repository layer, not here". The same principle applies to us.
- **Pagination correctness** (the Canvas helper notes it once truncated to ten items per page) is a reminder that real providers need paging inside the adapter, invisible to the port.
- **Multiple providers must be able to coexist behind one contract**, which suggests reusable contract tests.

## Problems to avoid

- Two parallel integration styles with only one on the real data path.
- OAuth and credentials in the port's method signatures.
- Raw provider payloads (`meta={"raw": ...}`) in normalized records.
- Swallowed errors that turn failures into empty results.
- Dates truncated to a day string; naive or ambiguous times.
- Effort estimates, priorities, or default point values invented inside an adapter.
- Inferring assignment kind from titles at ingestion.
- Untyped dicts as the contract.
- Provider environment variables read inside the provider.
- Submission fields defined but never populated.

## Implications for HaUI Compass

1. **One port, one canonical path.** There is a single narrow, read-only `LMSProvider` in `application/ports`; anything feeding the domain goes through it.
2. **Credential-free port.** Authentication, tokens and base URLs belong in the adapter's construction, never in the port's methods.
3. **Typed normalized records** at the boundary (`LMSCourseRecord`, `LMSAssignmentRecord`, `LMSSubmissionRecord`), distinct from domain entities, with **provider + external id** as their identity. No `meta`/raw payload and no `dict[str, Any]`.
4. **Explicit domain mapping**, outside domain entities. Values the LMS does not provide, such as effort estimates, are **not invented in the adapter**; an assignment with unknown effort maps to `estimated_effort=None`, which our RiskEngine already treats as `UNKNOWN`.
5. **Deadlines are timezone-aware UTC instants** on arrival.
6. **Failures are explicit** (a minimal typed error), not empty results.
7. **Submission state** is a small normalized enum that includes `UNKNOWN`.
8. **A reusable contract test** that any provider (Mock now; HaUI, Canvas, Moodle later) can run.
9. **Assignments are not tasks.** Decomposition is a separate concern (the legacy code merges "priority" and "estimated_time" into the ingestion row; we do not).

## Source modules inspected

`intelliplan/integrations/lms/base.py`, `intelliplan/integrations/lms/registry.py`, `intelliplan/integrations/lms/moodle.py`, `intelliplan/api/lms_sync.py`, `canvas_helper.py`, `studentvue_helper.py`, `schoology_helper.py`, `intelliplan/repositories/assignments.py`, `intelliplan/domain/assignment.py`, `docs/scheduler-audit.md`.

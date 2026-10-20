# Public courseware Preview acceptance — 2026-10-19

Immutable deployment: https://haui-compass-ngv7tu7ap-nam-4b71.vercel.app

Deployment ID: `dpl_APpQq7KeEHAaNDyRctQZJ25V6AtF`, READY, Preview (`target: null`).
Stable https://haui-compass.vercel.app and compatibility alias
https://haui-compass-preview-nam-4b71.vercel.app both point to this deployment.

Normal multi-service build copies the public corpus into the API bundle. No schema migration,
role/roster change, Google credential change or document-storage authorization change was needed.

## Accepted behavior

- Existing synthetic student sign-in works. All twelve originals are catalogued online:
  AI 3, ML 2, linear algebra 2, probability/statistics 3, control 2; six PDF and six Markdown.
- Each resource has publisher, authors, license URL, pinned source URL, source hash and byte count.
  Both PDF page 1 and page 2 are readable; Markdown originals are readable.
- Five full Vietnamese example questions returned `source: ai`, `status: answered` with only
  `open_educational` citations in their selected course. PDF references include physical pages.
- Public-only DB query cannot reuse a fictional demo brief. Graded-outsourcing request returns
  academic-integrity guidance. Both have no fabricated citations.
- Wrong-course resource and out-of-range PDF page return 404. Lecturer access to the student
  catalog is 403; unauthenticated access is 401.
- Existing read-only lecturer preflight passed: two isolated student workspaces, cross-owner and
  role denial, lecturer aggregate contract and small-cohort suppression.
- Chrome acceptance used an existing synthetic student: read MIT PID PDF, changed page, opened
  D2L linear-algebra Markdown with a pinned GitHub revision; asked the full Vietnamese PID example
  and saw a grounded Vietnamese answer, public-source badges and a citation link ending `#page=1`.

An initial real-browser run exposed poor lexical coverage for the full Vietnamese PID question.
Question scaffolding is now excluded from search terms while the original question is sent unchanged
for generation. All five full UI example questions are regression tested. Repeated full backend run
passed 1,689 tests including PostgreSQL; offline RAG baseline remained 25/25.

Machine-readable allowlisted results: [evidence](evidence/public-courseware-20261019.json).
Implementation and limits: [public courseware](../implementation/public-courseware.md).
Full source attribution and licenses: [data README](../../data/README.md).
No cookies, signed document URLs, request/response headers, private document bodies, account IDs
or raw exceptions are included in this evidence.

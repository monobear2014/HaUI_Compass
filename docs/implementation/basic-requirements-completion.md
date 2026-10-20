# Basic learning-companion requirements — 2026-10-19

Scope follows the agreed basic release with simulated university/Canvas data.
Advanced infrastructure/scaling in the reference images remains a later phase.

| Requirement | Implemented behavior / evidence |
| --- | --- |
| Online app, two roles | Next.js + FastAPI on Vercel; student and authorized lecturer accounts, server role/class checks; Google sign-in retained. |
| Plan | Weekly goal, syllabus/assignment instructions, AI task suggestions, student edits/confirmation, approved weekly schedule. |
| Do | Start/complete tasks, log study time, deadline reminders, missed-session rescheduling with confirmation. |
| Reflect | End-of-week summary, self-reflection, student-selected insights and next-week planning; persistent per account. |
| Lecturer overview | Explicit simulated roster; live aggregate tasks, minutes, plans and reflections; 30-second/manual refresh; groups below five suppressed. |
| On-time KPI before/after | Explicit server-timestamped simulated submissions, separate from task completion; mature-obligation denominator; before period labelled synthetic history, after period computed from recorded actions. |
| Grounded help | Course/public knowledge and private TXT/Markdown questions with citation validation, evidence abstention and graded-work guidance; bounded rule/model checks. |
| Privacy | Server account ownership and teacher grants; no learner identity/reflection/goal text in class reporting; private document storage. |

## Submission semantics

`POST /api/v1/demo/submissions/{assignment_id}` accepts `{}` only. The server uses
its workspace clock and preserves the first recorded timestamp across retries and
concurrent requests. Another learner's/currently retired assignment is rejected.
Events survive app recreation using PostgreSQL. The additive migration is
`0005_simulated_submissions`; it does not reset or backfill existing activity.

A submission on/before the due instant is on time. The rate includes only already
matured obligations; unsubmitted due work stays in the denominator. A week with no
due work has no rate yet. Each simulated account has its own clock. The baseline is
mock history, not measured pre-intervention data; the change is not evidence that
Compass improves learning. Actual Canvas submission/integration is not enabled.

## Control cleanup

- Preview/production no longer advertises nonfunctional built-in demo credentials.
- Only Student and authorized Lecturer choices remain; unsupported Parent/Teacher
  placeholder cards are removed.
- Missing Google configuration renders explanatory text rather than an inert button.
- Empty library has one upload action; an existing library uses its toolbar action.
- Unavailable PDF recall/flashcard cards are hidden, supported reading remains.
- A recommended task has one primary Start action; the schedule does not duplicate it.
- Task help opens course Q&A (`/knowledge`).
- Submitting an assignment shows pending state then a persisted timestamp/status;
  imports are guarded while pending. Submitted work stops deadline reminders.
- Lecturer brand stays in lecturer space; logout revokes the session and returns to login.

The controls were reviewed in source and exercised in desktop/mobile tests. This is
bounded functional coverage, not a guarantee that every possible state is defect-free.

## Deferred advanced criteria

Live Canvas REST/LTI 1.3 needs a university tenant/approval. LangGraph multi-agent
orchestration, Qdrant/reranking, Redis/model routing, RAGAS/LLM-judge evaluation,
1,000-concurrent-student load acceptance, and lecturer risk alerts remain outside
this basic release. Existing bounded AI smoke checks do not establish those claims.
No claim of FERPA compliance or universal anonymity/AI correctness is made.

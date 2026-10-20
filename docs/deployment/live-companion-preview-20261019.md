# Live dashboard and AI integrity — Preview acceptance

Date: 2026-10-19. Stable URL: <https://haui-compass.vercel.app/>.
Final immutable release: <https://haui-compass-hlrassyrj-nam-4b71.vercel.app/>.
Deployment `dpl_2bb7i2oqX3VKa2rJnknqmULe3kPR` is READY, Preview, with deployment
protection retained. The compatibility Preview alias also points to this release.
No Production promotion, database reset, schema migration or new paid service.

## Online results

Five new synthetic learners were explicitly rostered in the main simulated class.
The small class contains four of them and remains fully suppressed. Existing
lecturer grants were preserved. Account IDs, passwords, roster values and cookies
are not part of these records.

Before student activity: 25 tasks, zero completed tasks, zero logged minutes,
zero learners with approved plans, zero learners with confirmed reflection.

After one learner completed Plan → Do → Adapt → Reflect → next-week approval:

| Aggregate | Observed |
| --- | --- |
| Tasks | 26 |
| Completed tasks | 1 |
| Study minutes | 80 |
| Learners with approved plans | 1 |
| Learners with confirmed reflection | 1 |

The additional task came from a confirmed decomposition candidate. The dashboard
browser visibly displayed the same totals, no old 50% fixture KPI, and no horizontal
overflow at 390px. A student request to lecturer reporting returned 403. No learner
identifier or reflection/goal text was returned by the aggregate API.

The full activity-changing cycle ran on the first same-backend release
`haui-compass-g923m05tl-nam-4b71.vercel.app`. The final release adds the knowledge
page's distinct learning-guidance heading. Fresh final-release HTTP checks verified
that persisted counts, suppression, student-role denial and hosted AI boundaries
remain correct; the cohort was not reset for a second run.

## Grounding and integrity

Hosted checks passed for a supported course query with citations, an unsupported
question returning abstention without citations, and a graded-outsourcing request
returning deterministic learning guidance. A separate supported hosted query
reported `source=ai`, without fallback. The final stable page visibly showed
“Mình sẽ hướng dẫn bạn tự làm” for the outsourcing request, with no misleading
insufficient-evidence heading.

The six-case live-model smoke used synthetic text only and passed its bounded
checks. Three cases used the real provider; empty-evidence and two academic-integrity
cases stopped before provider invocation. It checks basic source use, abstention
and one document-injection example, not universal semantic faithfulness or classifier
coverage. Its 30-second provider timeout is an evaluation setting, not a new server
latency guarantee. Production provider configuration was not changed by the evaluator.

## Local verification

- Targeted grounding, provider, knowledge, weekly-flow and integrity backend tests.
- Architecture boundary checks, Ruff, mypy, TypeScript and ESLint.
- 20 existing desktop/mobile lecturer fixture regressions, two live-refresh UI cases
  and two guidance-heading cases passed. Fixture tests explicitly opt in; Preview
  explicitly uses live mode.
- In-memory integration covers outside-roster activity, duplicate memberships,
  small/malformed rosters, role/class isolation and retired-generation exclusion.
- Online acceptance exercises the existing PostgreSQL repositories with actual
  persisted simulated learner activity.

## Evidence and use

- [Activity-changing cloud acceptance](evidence/live-companion-20261019.json)
- [Final-release verification](evidence/live-companion-final-20261019.json)
- [Synthetic live-model smoke](evidence/ai-integrity-smoke-20261019.json)
- [Implementation and roster configuration](../implementation/live-lecturer-and-ai-integrity.md)

The enrolled synthetic test accounts are stored only in a local owner-readable
file `/tmp/haui-live-cohort-20261019.json`. New accounts are not automatically
enrolled. To include another account, an operator must update the server-side roster
by immutable ID and redeploy Preview. There is no public role/roster escalation path.

Submission KPI/comparison stay unavailable until submission events are implemented.
This release does not equate task completion with submission or claim an educational
improvement from the synthetic activity.

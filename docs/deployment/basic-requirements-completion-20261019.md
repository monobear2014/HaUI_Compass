# Basic requirements completion — protected Preview

Date: 2026-10-19. Stable URL: <https://haui-compass.vercel.app/>.
Immutable release: <https://haui-compass-qt6shsqfi-nam-4b71.vercel.app/>.
Deployment `dpl_4STNsdkJNf2MoUTt7GkBTgUtK7KH` is READY, Preview.
The stable and compatibility aliases point to this release; protection is retained.

## Scope and observed behavior

[Requirement mapping and control changes](../implementation/basic-requirements-completion.md)
cover the agreed basic Plan–Do–Reflect release. No Production promotion, new paid
service, real university data, Canvas access or global database reset was performed.

The additive API migration `0005_simulated_submissions` was applied. The first
migration build hit a cross-device package-link error. A copy-mode migration build
completed the migration but its editable Python package was unsuitable for runtime
packaging. These releases were not assigned to the stable URL. The final release
uses the original normal build command; the checked-in `vercel.json` is restored.
Runtime acceptance below passed on the final release.

For the existing five-account synthetic cohort, the reporting API first showed
three already-due obligations without submissions (0%). One other learner then
submitted one assignment early, advanced its own clock, submitted another late,
and left a third due obligation unsubmitted. The aggregate became six due
obligations: one on time, one late, four missing, or **16.7%**. Task completions,
study minutes, plans and reflections did not change during these submission actions.
The lecturer browser displayed those same counts. This demonstrates calculation
and live updates; the separately labelled synthetic historical baseline was 80%
and does not establish an educational improvement.

Server timestamps, rejection of client timestamps, retry preservation, cross-owner
404, lecturer/student role denials, new-session persistence and small-group
suppression passed online. No identity, goal or reflection text appeared in the
aggregate. Only synthetic testing accounts were used for these actions.

Hosted source-grounded answers, unsupported-question abstention, graded-outsourcing
guidance and legitimate AI-policy questions passed. A separate stable-URL task
decomposition request returned `source=ai`, no fallback and five editable candidates
from a syllabus-bearing mock assignment. A browser request also exercised the
explicit offline fallback; provider latency/failure can still use that labelled path.
These are bounded checks, not a guarantee of hallucination-free or adversarially
complete behavior. The prior six-case real-model integrity smoke remains applicable.

Browser acceptance verified no obsolete demo credentials on login, normal lecturer
login/logout, student landing without an upload gate, expanded mock syllabus,
submission pending state followed by timestamp instead of a duplicate submission
button, and persistence after reload. The academic page had no horizontal overflow
at a 390px viewport. Temporary viewport overrides were cleared.

## Local checks

- 1,619 backend unit/API tests passed.
- Nine targeted PostgreSQL tests passed; an additional real-PostgreSQL live
  submission-aggregate regression passed across fresh app instances.
- Plan–Do–Adapt–Reflect and isolated-account weekly cycles passed on desktop/mobile
  with a production Next build and PostgreSQL. Submission UI passed on both sizes.
- 34 selected auth/onboarding/knowledge/library/reminder browser cases initially
  passed; the two obsolete greeting assertions were updated and passed on retry.
- Four lecturer refresh/login/logout desktop/mobile cases and all six final
  authoritative-reminder cases passed.
- The final production build and both final submission UI cases passed again after
  the login footer cleanup. Stable-alias authorization/aggregate preflight passed.
- 32 configuration/private-storage/evidence tests, Ruff, mypy, TypeScript, ESLint and
  whitespace checks passed. Local framework failure objects were not used as
  deployment evidence; the persisted artifact contains allowlisted checks only.

[Sanitized deployment evidence](evidence/basic-requirements-completion-20261019.json)
contains statuses, aggregate numbers and UI check outcomes, without account IDs,
passwords, cookies, private documents or signed URLs.

# Explicit learning preferences and weekly-cycle acceptance

Implemented 2026-10-19. This completes the scoped evaluation, acceptance and explicit-memory slice;
load tests, caching, model routing and infrastructure scaling are deferred.

## Student behavior

Weekly plan exposes “Sở thích học tập của tôi”, before and after approving a plan. Students can
confirm recurring weekday/time/duration sessions (Vietnam time), a weekly minutes target and up to
five self-reported difficult topics. Save, edit and delete are real server operations. A confirmed
profile survives sign-in, application recreation and week changes. It is keyed to the immutable
account, not a simulated workspace generation.

Saving never changes an approved plan. In a plan draft, “Apply saved preferences” copies fitting,
future sessions and the declared target into editable fields. If the goal is blank, difficult topics
suggest a revision goal; existing text is preserved. Only preview followed by explicit plan approval
writes a schedule. Expired/out-of-period sessions are omitted. Overlapping sessions, invalid days,
long sessions, too many topics and forged extra fields are rejected server-side.

The existing next-week draft separately uses confirmed reflections: workload feedback adjusts the
declared target, underestimated effort produces an explainable warning, and carried/deferred tasks
and difficult topics are shown. These are factual records and student reports, not inferred ability,
personality or motivation labels. Applying a saved target deliberately replaces the draft target;
the student can edit it again before approval. A time target is not itself planner capacity.

## Persistence and privacy

Alembic `0006_learning_preferences` adds an account-keyed JSON table without rewriting old activity.
A repository port has in-memory and PostgreSQL adapters; upserts are atomic. Requests authenticate
service + account, reject lecturer access and ignore no client-supplied ownership claims. The web
proxy retains session, same-origin and role checks. Lecturer endpoints never read this repository.
The API returns no-store responses through the existing authenticated proxy.

Delete removes the saved profile. It does not erase already approved schedules, weekly goals or
confirmed reflections derived from earlier decisions. The privacy page explains retention and this
boundary. No preferences are silently extracted from chats or sent to the lecturer dashboard.

## Acceptance

- Fresh-account production-build PostgreSQL desktop/mobile tests exercise Plan → Do → Adapt →
  Reflect → next-week plan, submission/filter/KPI behavior and account isolation.
- Preference tests exercise explicit save, application to an editable draft, topic goal suggestion,
  week change, reload, independent accounts, edit/delete and management after approval.
- API tests check ownership, teacher denial, forged fields, timezone conversion, overlapping and
  out-of-range sessions, persistence across reconstructed applications and physical deletion.
- Existing live lecturer tests exercise five synthetic accounts and verify student actions change
  only the assigned aggregate, with small-cohort suppression. The 24-case lecturer UI regression
  suite covers live detail/filter/export states.
- Online fresh-account acceptance covers the complete weekly cycle, explicit simulated submission,
  next-week preference reuse, sign-in persistence, independent clocks, editing/deleting preferences
  without altering saved plans, and lecturer isolation.

The new table is migrated in a one-time Preview build using an isolated `uv --no-project` Alembic
invocation with `PYTHONPATH=src`. This avoids installing the repository as an editable package in the
Vercel runtime. Subsequent deployments use the normal corpus-copy build. No production promotion or
new permission grants are required. Historical migration 0001 excludes tables introduced by 0006,
so fresh database creation and downgrade/upgrade do not create the table twice.

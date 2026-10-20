# Student AI evaluation, weekly acceptance and confirmed memory — 2026-10-19

Final immutable Preview: https://haui-compass-lx9ezfvna-nam-4b71.vercel.app
Deployment ID: `dpl_CDffPCmkTSWSpsxd1rRxvwJ4gDsJ`, READY, target null.

## Scope delivered

1. A versioned 44-case Vietnamese AI evaluation suite, offline baseline, actual model run,
   source/page validation, safety/refusal cases, latency and fallback accounting, and separate
   review worksheets/rubric. See [evaluation](../evaluation/student-ai-vi-v1.md).
2. Fresh-account full Plan–Do–Adapt–Reflect–next-week acceptance with durable data, separate
   submission facts and role/account boundaries. Existing lecturer aggregate behavior was
   rechecked with simulated learner activity and the 24-case lecturer UI suite.
3. Explicit persistent preferences with view/edit/delete, recurring preferred sessions,
   a declared target and self-reported topics. Apply to editable drafts and approve separately;
   manage preferences even after a plan is approved. See [implementation](../implementation/confirmed-learning-preferences.md).

Load testing, Redis/caching, model routing and scaling infrastructure are intentionally deferred.

## Verification

- Backend: **1,692 passed**, including PostgreSQL; Ruff and mypy passed.
- Migration 0006: additive preference table, deployed once in isolated Preview build. Fresh
  database creation, ORM schema comparison, downgrade and upgrade now pass. Existing activity
  was not reset or backfilled. Following deployments use the normal API build command.
- Student production-build PostgreSQL UI: **6 passed**, desktop/mobile weekly flow, submissions
  and preferences. Lecturer UI: **24 passed**. Public-reader/Q&A validation UI: **14 passed**.
- Frontend TypeScript, scoped ESLint and production builds passed. Corpus: 13 tests and manifest
  validation passed; existing offline RAG contract baseline retained 25/25.
- New evaluation: offline 38/38 RAG + 6/6 reflection contracts. Retained live run: 37/38 RAG after
  an audited synonym-grader correction, plus 6/6 bounded reflection-output contracts (3 actual
  AI reflections, 3 safe fallbacks). One legitimate query safely refused invalid provider output.
  This failure remains recorded; no claim that every live AI response passes.
- Online two fresh synthetic accounts: complete week and next-week approval, simulated
  submission, reflection history, sign-in persistence, isolated clocks, preference reuse,
  editing/deletion without changing existing plans, teacher/student separation.
- Final deployment smoke: saved profile read/write/preview/delete, grounded Vietnamese PID
  answer with public PDF-page citations, and role boundaries passed.
- Chrome recovered and was used to save a synthetic student's profile, observe that saving
  leaves the plan unchanged, apply it to a draft and see “Ôn tập: Bayes”. On the final deployment,
  the confirmed 240-minute profile persisted and the preferred-session action has a distinct label.

Initial failures were resolved: Vietnamese keyword/anchor handling, technical reflection-code
leakage, ambiguous select labels and historical migration table ownership. Provider validation
failures now have their own UI explanation rather than a misleading missing-evidence message.

All account credentials remain in local restricted test files. Evidence contains allowlisted
statuses/metrics only, no cookies, headers, signed document URLs, private document bodies or
arbitrary exception objects. Model-evaluation data are public courseware/synthetic facts.
Independent human semantic/pedagogical review remains explicitly unscored in the worksheet.

Stable https://haui-compass.vercel.app and compatibility alias
https://haui-compass-preview-nam-4b71.vercel.app were verified to point to this final Preview.

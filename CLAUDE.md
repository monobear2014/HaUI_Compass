# HaUI Compass — Working Protocol

> **Before starting ANY task in this repository, read CLAUDE.md and docs/PROJECT.md completely.**

This file is the mandatory operating manual for every Claude Code session in this repository. `docs/PROJECT.md` is the product source of truth. When code, comments, tickets, or assumptions conflict with it, stop and resolve the inconsistency rather than silently choosing a different architecture.

## Mandatory workflow

Before coding:

1. Read `CLAUDE.md` completely.
2. Read `docs/PROJECT.md` completely.
3. Inspect the current branch and `git status`.
4. Inspect the relevant existing implementation, configuration, tests, and documentation.
5. Understand how the requested change fits the product architecture and learning loop.
6. Make the smallest coherent change that satisfies the request.
7. Do not silently change architecture. Record material decisions in documentation and, where appropriate, an ADR.
8. Run relevant tests, linters, type checks, and other proportional checks.
9. Summarize what changed, what was verified, and what remains planned.

## Repository safety

- Never guess existing architecture when it can be inspected.
- Never overwrite or discard user work.
- Never perform destructive Git operations without explicit permission.
- Never push, force push, merge, rebase, reset, delete branches, or rewrite history unless explicitly requested.
- Never commit or expose secrets, credentials, tokens, private student data, or `.env` files.
- Treat existing uncommitted changes as user-owned unless proven otherwise.
- Keep generated files, local caches, editor state, and operating-system artifacts out of version control.
- `.references/` contains external reference implementations (see `docs/research/`). Treat them as read-only research sources. Never edit, stage, commit, vendor, or copy code from them into HaUI Compass unless the user explicitly requests reuse after license review.

## Product and architecture rules

- Preserve the central question: **“What should this student do next, and why?”**
- Build and test domain logic before adding agent complexity.
- Start as a modular monolith; do not introduce microservices without demonstrated need.
- Avoid premature abstraction and premature multi-agent architecture.
- Prefer deterministic code for deterministic problems such as deadlines, task status, progress, capacity, and explicit risk thresholds.
- Use LLMs selectively for planning, decomposition, reflection, grounded learning support, explanation, and suitable classification tasks.
- Keep AI provider interfaces abstract where practical; domain logic must not depend directly on a single model vendor.
- Keep the LMS behind a provider interface. The MVP may use `MockLMSProvider`; future providers must not require rewriting core domain logic.
- Treat RAG as a supporting subsystem, not the whole product. Course-grounded answers require traceable citations and must not invent unsupported facts.
- Preserve academic integrity: assist understanding, planning, review, and learning; do not complete graded work for students. Redirect unsafe requests toward explanation, outlines, rubric analysis, guided practice, or draft feedback.
- Preserve student privacy. Do not expose private student conversations to lecturers by default; lecturer views should use only necessary, appropriately aggregated signals.
- Keep core modules independently testable and dependencies directed toward stable domain interfaces.
- Avoid unnecessary dependencies. Add one only when its value and maintenance cost are understood.
- Do not add an ML predictor when transparent rules are sufficient or training/evaluation data does not exist.

## Quality and documentation

- Add or update tests whenever behavior changes.
- Update documentation when architecture, data boundaries, privacy behavior, AI behavior, or product scope materially changes.
- Use an ADR for durable decisions with meaningful alternatives or migration cost; follow `docs/decisions/README.md`.
- Clearly distinguish **IMPLEMENTED** functionality from **PLANNED** functionality.
- Never document planned functionality as already implemented.
- Do not fabricate metrics, evaluation results, integrations, or capabilities.
- Important AI-assisted decisions must be explainable. A recommendation should include why it is timely and what risk exists if deferred.
- Prefer observable boundaries so latency, failures, model usage, cost, retrieval quality, and decision traces can be measured later without leaking sensitive content.

## Completion checklist

Before reporting a task complete:

- Confirm the requested scope is implemented and no unrelated user files changed.
- Review `git diff` and `git status`.
- Run the relevant checks and report any checks that could not run.
- Verify secrets and private data were not introduced.
- Ensure documentation uses accurate `IMPLEMENTED` and `PLANNED` labels.
- State follow-up work separately; do not implement planned scope unless requested.

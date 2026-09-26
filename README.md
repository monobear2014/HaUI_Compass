# HaUI Compass

> **Know what to do next.**

HaUI Compass is a planned adaptive AI learning companion for students at Hanoi University of Industry (HaUI). It is designed around a closed learning loop—plan, do, monitor, reflect, adapt, and plan again—to recommend a student's next best learning action and explain why it matters.

## Current status

**Current phase: Project foundation / architecture design.**

**IMPLEMENTED:** repository foundation, source-of-truth documentation, working protocol, and initial directory structure.

**PLANNED:** the web and API applications, domain behavior, AI workflows, grounded RAG, risk engine, next-best-action recommendations, reflections, LMS providers, dashboards, and evaluation suites.

No product feature is claimed to be operational yet.

## High-level architecture

The initial direction is a modular monolith:

```text
Next.js web application
          │
      FastAPI API
          │
  Domain/application modules
    ├── deterministic planning and risk rules
    ├── provider-independent AI capabilities
    ├── LMS provider abstraction
    └── grounded retrieval with citations
          │
  PostgreSQL (+ pgvector when justified)
```

This direction is intentionally revisable. Material decisions will be recorded as Architecture Decision Records (ADRs).

## Repository structure

```text
apps/             Planned deployable web and API applications
packages/shared/  Planned explicitly shared contracts or utilities
domain/           Planned core academic and learning domain modules
ai/               Planned AI capability boundaries and provider adapters
integrations/lms/ Planned LMS interface and provider implementations
evals/            Planned AI and product evaluation assets
tests/            Cross-module and integration tests
docs/             Product source of truth, architecture, ADRs, and research
scripts/          Repository automation
infra/            Infrastructure definitions when justified
```

Start with [docs/PROJECT.md](docs/PROJECT.md) for product scope and architecture, then read [CLAUDE.md](CLAUDE.md) before making changes.

## Development status

The repository currently contains documentation and an empty architectural scaffold only. Dependencies, runtime projects, database schemas, and business logic will be introduced incrementally in future tasks.

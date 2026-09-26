# Architecture Decision Records

Architecture Decision Records (ADRs) capture durable technical decisions that have meaningful alternatives, consequences, or migration cost. They complement `docs/PROJECT.md`; they do not replace the product source of truth.

## Naming

Use a four-digit sequence followed by a short kebab-case title:

```text
0001-use-modular-monolith.md
0002-use-postgresql.md
```

Numbers are never reused, even if an ADR is later superseded.

## Suggested format

```markdown
# NNNN: Decision title

- Status: Proposed | Accepted | Superseded | Rejected
- Date: YYYY-MM-DD
- Supersedes: NNNN (optional)

## Context
## Decision
## Alternatives considered
## Consequences
## Follow-up
```

Create an ADR only after a decision has actually been proposed or made. Do not create records merely to fill the directory. When a decision changes, preserve its history and mark it superseded rather than rewriting the original rationale.

# ADR-0003: HTTP API Boundary and Composition Root

## Status

Accepted (2026-09-27). Walking Skeleton v0 is implemented on `feat/api-skeleton`.

## Decision

FastAPI is confined to `haui_compass.api`. Pydantic models are DTOs at the HTTP boundary only;
domain, engines, and application use cases remain framework-independent. `create_app(container=...)`
is the explicit application factory. `api.dependencies` is the sole composition root and wires LMS,
clock, repository ports, and use cases without a dependency-injection framework.

The v0 API uses deterministic in-memory adapters and a trusted development student identity in the
request body. Execution writes append the execution record first and then save the current task
snapshot; repository writes are not one transaction. PostgreSQL, authentication/authorization,
frontend integration, and production transaction handling remain planned.

## Consequences

Routes can be tested through an actual ASGI HTTP client with fresh injected containers, while the
domain and application tests do not need FastAPI. The trusted identity and in-memory state are
deliberately not production security or durability guarantees.

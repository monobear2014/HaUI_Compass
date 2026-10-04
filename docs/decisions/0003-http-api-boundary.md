# ADR-0003: HTTP API Boundary and Composition Root

## Status

Accepted (2026-09-27). Walking Skeleton v0 is implemented; Learning Loop API v0 extends this
boundary on `feat/api-learning-loop`.

## Decision

FastAPI is confined to `haui_compass.api`. Pydantic models are DTOs at the HTTP boundary only;
domain, engines, and application use cases remain framework-independent. `create_app(container=...)`
is the explicit application factory. `api.dependencies` wires LMS, clock, repository ports, and use
cases without a dependency-injection framework.

Demo Showcase v0.2 adds `api.demo` as an explicit, opt-in composition root for fictional scenario
fixtures. It may wire infrastructure adapters, but normal API startup never imports it and its
reset/selector routes exist only on `haui_compass.api.demo:app`. The import-boundary test lists this
module explicitly; other API modules still cannot import infrastructure.

The API supports both explicit in-memory and explicit PostgreSQL composition roots. The PostgreSQL
root runs repository access through its transaction boundary; execution and plan-revision writes
retain their adapter-owned atomicity. Trusted development student identity remains in request bodies.
Authentication/authorization and frontend integration remain planned.

## Consequences

Routes can be tested through an actual ASGI HTTP client with fresh injected containers, while the
domain and application tests do not need FastAPI. The trusted identity and in-memory state are
deliberately not production security or durability guarantees.

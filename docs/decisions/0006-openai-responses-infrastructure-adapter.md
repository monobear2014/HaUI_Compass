# 0006: OpenAI Responses as an opt-in language adapter

- Status: Accepted
- Date: 2026-10-04

## Context

The v0.2 recommendation explanation and v0.3 task-decomposition workflows already own their
provider ports, validation and deterministic fallbacks. Real model access must fit those boundaries
without allowing a model to calculate risk, choose the Next Best Action, schedule work, create tasks
without confirmation, or make the offline showcase depend on a network.

The integration also needs schema-constrained output and transport fakes in the normal test suite.
Secrets must remain server-side. Provider response objects must not leak into application contracts.

## Decision

Use the OpenAI Responses API through a small `httpx` infrastructure adapter. Both existing
application ports are implemented by `OpenAIResponsesAdapter`; the application and deterministic
engines do not import `httpx`, OpenAI types or vendor configuration.

The adapter sends `store: false` and requests strict JSON Schema output. It immediately converts the
response to `ExplanationText` or `ProviderTaskCandidate`. Malformed response envelopes, JSON and
typed fields become the provider-neutral `InvalidLLMOutputError`; HTTP/network failures remain
provider errors. Application validation remains authoritative even after schema-constrained output.

Configuration is server-side and opt-in:

```text
HAUI_COMPASS_LLM_ENABLED=true
OPENAI_API_KEY=<server secret>
HAUI_COMPASS_LLM_MODEL=gpt-5-mini-2025-08-07
HAUI_COMPASS_LLM_BASE_URL=https://api.openai.com/v1
HAUI_COMPASS_LLM_TIMEOUT_SECONDS=8
```

The default model is pinned for repeatable demo behavior and can be overridden at deployment. If
the feature is disabled or the credential is missing, composition supplies no network adapter and
records `disabled` or `missing_credential` as the fallback reason.

```text
typed application port
  → OpenAI Responses infrastructure adapter
  → strict JSON Schema response
  → internal typed value
  → authoritative application validation
  → candidate session or explanation

timeout / HTTP / malformed / invalid output
  → existing deterministic template or decomposition fallback
```

Only composition roots read environment settings. No browser request selects a provider or carries
an API key. Logs contain outcome and fallback reason only, not prompts, keys or academic content.

## Alternatives considered

1. **Official vendor SDK.** Not selected for this milestone because the integration uses one HTTP
   endpoint and a narrow transport protocol. `httpx` keeps the dependency and mock surface small
   while still using the supported Responses API and structured-output contract.
2. **Free-form prose plus regex parsing.** Rejected because it is brittle and weakens the trust
   boundary.
3. **Browser-side provider selection.** Rejected because it risks exposing configuration and lets
   clients influence a server capability that should remain operational configuration.
4. **Model output directly creates tasks or decisions.** Rejected because it violates confirmation,
   auditability and deterministic engine ownership.

## Consequences

- The demo remains fully functional with no credential or network.
- OpenAI is the only implemented online adapter, while application ports remain replaceable.
- Strict schemas reduce malformed output but do not replace application validation.
- `httpx` becomes a runtime dependency.
- Candidate sessions, authentication and production operational controls remain outside this
  milestone.

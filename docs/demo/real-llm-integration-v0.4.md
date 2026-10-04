# Real LLM Integration v0.4

## What the demo proves

The optional model supplies language suggestions and explanations. It does not own the learning
decision or durable student facts.

```text
OpenAI model                  Deterministic core                 Student
language suggestions    →     risk / ranking / planning    →    review and confirmation
language explanations         replanning + evidence
        │                              │
        └── unavailable/invalid ───────┘
                  deterministic fallback
```

AI output may be wrong or unavailable. Basic recommendation and planning remain usable because
Risk, NBA, Planner and Replanner do not call the model. Suggested tasks still require explicit
selection and confirmation before they enter those engines.

## Server configuration

Offline is the default. Start the demo normally and the UI will show **Template · offline**.

For an online demo, set these variables only in the API process:

```bash
export HAUI_COMPASS_LLM_ENABLED=true
export OPENAI_API_KEY='<your server-side key>'
# Optional overrides:
export HAUI_COMPASS_LLM_MODEL='gpt-5-mini-2025-08-07'
export HAUI_COMPASS_LLM_TIMEOUT_SECONDS='8'

cd apps/api
uv run --extra dev uvicorn haui_compass.api.demo:app --host 127.0.0.1 --port 8001
```

Do not put `OPENAI_API_KEY` in frontend environment variables or commit it to a file. If
`HAUI_COMPASS_LLM_ENABLED` is false/unset, or the key is absent, startup succeeds and the offline
providers remain active.

## Exact online presenter flow

1. Start the API with the opt-in variables above and start the web app using the v0.2 runbook.
2. Select **Normal Week**, open **Academic Data**, and find **Database Mini Project**.
3. Click **Suggest tasks with AI**. A successful call shows one to five candidates and the badge
   **AI · online**.
4. Explain that the candidates passed both the provider schema and the existing v0.3 application
   validation, but no task has been created.
5. Edit the first title/estimate, deselect at least one candidate, then click
   **Add selected tasks**.
6. Open **Today**. The deterministic engine can now recommend one of the confirmed task facts; its
   language panel shows **AI · online** when explanation succeeds.
7. Expand **Decision evidence** to show that risk level, reason codes and deciding dimension came
   from the deterministic result before the model was called.
8. Open **Weekly Plan**, adjust remaining effort if desired, and create a revised plan. Scheduling
   remains deterministic.

## Exact fallback demonstration

1. Stop the API, set `HAUI_COMPASS_LLM_ENABLED=false` (or remove the API key), and restart it.
2. Repeat generation. The candidate badge reads **Template · offline** and the bounded four-step
   fallback appears.
3. Open **Today**. The explanation badge also reads **Template · offline**.
4. Complete the same edit/select/confirm/replan flow. It remains functional without a network.

Internally the API distinguishes `disabled`, `missing_credential`, `timeout`, `provider_error` and
`invalid_output`. These values never contain secrets or raw academic prompt content.

## Trust and failure boundaries

| Failure or state | Result |
|---|---|
| Provider disabled | Offline fallback; reason `disabled` |
| Key missing while enabled | Offline fallback; reason `missing_credential` |
| Outer timeout | Cancel provider call; reason `timeout` |
| Network, HTTP or provider exception | Offline fallback; reason `provider_error` |
| Malformed envelope/JSON/schema | Offline fallback; reason `invalid_output` |
| Duplicate, excessive or out-of-range candidates | Whole response rejected; offline fallback |
| Empty or oversized explanation | Template explanation |

No failure path persists candidates as tasks. The confirmation invariant from ADR-0005 still owns
the only candidate-to-task transition.

## Current limitations

- Only the OpenAI Responses adapter is implemented.
- There is no retry, circuit breaker, usage/cost dashboard or full telemetry stack.
- Candidate sessions remain process-local and ephemeral.
- Authentication and production authorization remain planned.
- Prompt and model quality have unit coverage for contracts, not a production evaluation dataset.
- Live-provider behavior must be verified separately when a valid credential is available; normal
  automated tests use fake transports and never call an external API.

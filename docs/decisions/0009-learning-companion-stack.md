# 0009: Incremental stack for the Plan–Do–Reflect companion

- Status: Accepted
- Date: 2026-10-19

## Context

The product remains a learning companion, not a standalone document portal. The
basic release needs two roles, simulated LMS assignments/deadlines, weekly planning,
execution tracking, reflection, an aggregate lecturer dashboard and measurable
submission outcomes. Advanced infrastructure must not obscure this user journey.

The repository already contains Next.js authentication and private file storage,
FastAPI application services, PostgreSQL repositories, Mock LMS, deterministic
planning/risk engines, opt-in language adapters and lexical retrieval with citations.
These are implementation assets; their presence does not prove production readiness.

## Decision

Retain the modular monolith and migrate in independently verifiable slices.

| Concern | Basic release | Advanced adoption gate |
| --- | --- | --- |
| Web/API | Next.js + FastAPI; preserve current authenticated proxy | Move API to a container service only after measuring request/runtime limits |
| State | PostgreSQL for durable domain facts; existing private Blob storage for files | Durable ingestion worker with retries when synchronous processing becomes insufficient |
| LMS | Existing per-account simulated workspaces and Mock LMS | Canvas REST OAuth scopes for assignment/submission sync; LTI 1.3 separately for launch/context |
| LLM | Existing server-side adapter and configurable pinned model; deterministic fallback | Compare task-specific models on Vietnamese fixtures before model routing |
| Planning | Existing deterministic engines; model proposes task candidates, student confirms | LangGraph for resumable planner/reflector orchestration once checkpoint/recovery tests exist |
| Retrieval | Existing lexical baseline and structural citations | Benchmark Qdrant hybrid retrieval and a reranker against that baseline |
| Memory | Explicit task/progress/reflection records with ownership | Persist only user-confirmed preferences; retention and deletion controls before inferred personal memory |
| Guardrails | Application authorization, evidence validation, candidate confirmation | Dedicated integrity evaluation and policy enforcement; assess NeMo/Llama Guard as additional classifiers |
| Evaluation | Offline deterministic contracts and labelled RAG questions | Optional RAGAS + human-calibrated judge; separate load and student-outcome studies |
| Cache | No new shared response cache | Redis after measuring reuse; permission- and version-aware keys required |

No Qdrant, Redis, LangGraph, guard model or paid reranker dependency is introduced
by this decision. Their adoption requires a measured benefit and a dedicated change.
Existing provider configuration is preserved; model names in a suggested stack are
not evidence of quality, availability or cost for this workload.

## Boundaries

- The language model does not own deadline arithmetic, risk levels or schedule writes.
- Every plan mutation proposed by AI passes existing validation and confirmation.
- Retrieval filters authorized resources before sending context to a provider.
- Checkpoint storage is not the authoritative store for task completion/submission.
- A completed task is not a submission. On-time metrics require due/submitted timestamps,
  extension/exemption handling and an explicit eligible denominator.
- Aggregate lecturer reporting and identifiable risk alerts are separate permissions.
- Mock outcomes demonstrate calculations, not actual educational improvement.
- No claim of 1,000-user capacity without a declared workload and measured results.

## Cost and latency accounting

Estimate provider cost from measured tokens, not logged-in users:

`daily cost = sum(calls_per_task * (input_tokens * input_price + output_tokens * output_price) / 1_000_000)`

Illustrative workload assumptions, not measurements: 1,000 daily users, eight calls
each, 2,000 input and 400 output tokens per call produce 16M input and 3.2M output
tokens/day. Apply current provider prices at evaluation time and add embedding,
reranking, judge, retries, storage and hosting separately. Do not automatically
escalate every reflection to a larger model.

For load testing, declare the fraction actively sending requests, request arrival
rate, provider limits, p50/p95 latency, error rate and maximum in-flight requests.
For example, 100 simultaneous active requests with 8s average service time implies
approximately 12.5 completions/s at steady state, not 1,000 AI requests/s.

Cache keys must include authorized scope, document version, model/prompt version
and relevant conversation state. Do not share personal reflections across users.

## Delivery sequence and acceptance

1. Restore Plan–Do–Reflect and visible source-backed Q&A entry points on `/learn`.
   Preserve document library, uploads, auth and current URLs. This change implements
   that navigation slice only; it does not add missing weekly-goal/backend behavior.
2. Audit and complete a simulated weekly cycle: assignment → confirmed tasks → plan
   → execution → reflection → confirmed adjustment, with per-account persistence.
3. Complete submission facts, before/after metric definitions and aggregate lecturer
   reporting. Test access isolation and small-cohort disclosure explicitly.
4. Add a labelled Vietnamese integrity/RAG/reflection evaluation set. Record baseline
   results before selecting models, embeddings, reranking or graph orchestration.
5. Add advanced adapters individually, then load-test the selected deployment.

## Alternatives and consequences

Installing the entire suggested stack now adds several services, secrets, failure
modes and evaluation variables without fixing the entry journey. Replacing FastAPI
or rewriting the working storage/auth system would increase migration risk.
Incremental adoption keeps the offline demo reproducible but defers semantic search
and agent orchestration until their value can be demonstrated.

## References

- [LangGraph persistence](https://docs.langchain.com/oss/python/langgraph/persistence)
- [Qdrant tenant isolation](https://qdrant.tech/documentation/manage-data/multitenancy/)
- [Canvas LTI introduction](https://developerdocs.instructure.com/services/canvas/external-tools/lti/file.tools_intro)
- [RAGAS metrics](https://docs.ragas.io/en/latest/concepts/metrics/available_metrics/)
- Existing ADRs 0005–0008 remain authoritative for confirmation, provider boundaries,
  bounded retrieval and simulated workspace isolation.

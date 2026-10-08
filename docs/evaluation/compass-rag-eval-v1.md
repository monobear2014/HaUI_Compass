# Compass Assistant RAG Evaluation Harness v1

## Purpose and boundary

This harness measures the current private-document Compass Assistant before any
embedding or hybrid-search work. It keeps retrieval quality separate from grounded
generation quality so a failed answer can be traced to either missing evidence or
generation/citation behavior.

It evaluates the production chunker, lexical ranker, follow-up query resolution,
upload ingestion, grounded-answer endpoint, citation validation, refusal path and
chat persistence. It does not add a vector database, embeddings, a judge model or
another RAG implementation.

The older `evals/rag_v1.py` remains the engineering-contract evaluation for the
public/fictional knowledge API. This harness targets Compass Assistant uploads and
therefore intentionally has a separate version: `compass-rag-eval-v1`.

## Dataset

`evals/datasets/compass-rag-v1.json` contains 48 fictional cases and 54 evaluated
turns. The six follow-up cases each contain two turns and preserve real pronouns;
the evaluator never rewrites “nó” itself. The production `resolveRetrievalQuery`
function receives the conversation history. Its versioned JSON Schema is
`evals/datasets/compass-rag-v1.schema.json`; the runner also performs fail-closed
semantic validation such as unique IDs, exact category distribution and source links.

| Category | Cases |
|---|---:|
| Direct factual | 12 |
| Paraphrased | 8 |
| Multi-section | 6 |
| Follow-up/context | 6 |
| No-evidence | 8 |
| Ambiguous | 4 |
| Adversarial/document injection | 4 |

Four synthetic Markdown fixtures live in `evals/rag/fixtures/`. Stable
`[SOURCE:semantic-id]` markers map expected sources to runtime chunks, avoiding
hard-coded UUIDs. They are evaluation metadata inside fictional documents, not a
production citation mechanism.

Concept expectations are alias groups rather than exact whole-answer strings:

```json
{
  "concept": "probability distribution",
  "aliases": ["phân phối xác suất", "xác suất trên các lớp"]
}
```

Matching uses NFC Unicode normalization, case folding, whitespace collapse and
basic punctuation removal. Cases can also list deterministic forbidden phrases.

## Modes and commands

Offline retrieval is the default and requires no provider or network call:

```bash
cd /path/to/HaUI_Compass
apps/api/.venv/bin/python evals/compass_rag_v1.py --mode retrieval
```

It calls a small Node worker that imports the same pure chunking/ranking/context
modules used by the Next.js production adapter. It never reimplements lexical
ranking in Python.

Full mode is explicitly live and runs the real path:

```text
register → upload → SQLite ingestion → chat session → lexical retrieval
→ internal FastAPI grounded answer → real configured LLM
→ citation validation → persistence → response
```

Run it with credentials in an environment file:

```bash
apps/api/.venv/bin/python evals/compass_rag_v1.py \
  --mode full --live --env-file .env
```

If `HAUI_COMPASS_LLM_ENABLED=true` or `OPENAI_API_KEY` is missing, full mode fails
clearly. It never substitutes a mock and labels it live. The harness starts isolated
development servers on ports 8111 and 3411 by default; `--api-port` and `--web-port`
override them. Upload/chat SQLite data is placed in a temporary directory and removed
at the end, without touching `.demo-auth` or Playwright state.

Both commands write `artifacts/evals/compass-rag-v1/summary.json` and `report.md`.
These runtime artifacts are ignored by Git.

## Retrieval metrics

For an answerable turn:

- **Hit@K = 1** if at least one expected semantic source identifier occurs in the
  top K retrieved chunks.
- **RR = 1 / rank** of the first relevant chunk; RR is zero when none is relevant.
- **MRR** is mean RR over answerable turns.
- **Source recall@5** is the number of distinct expected sources found in the top
  five divided by the number expected. This matters for multi-section questions.

The report includes aggregate and per-category metrics. No-evidence turns are not
mixed into Hit@K/MRR; they instead report the empty-retrieval rate.

## Generation and citation metrics

Full mode reports:

- **Grounded Answer Rate:** answerable, answered, every required concept matched,
  no configured forbidden phrase, and structurally correct source coverage.
- **Citation Precision:** citations matching an allowed expected source divided by
  all returned citations on answerable turns.
- **Citation Coverage / Correctness Rate:** answerable turns whose citations exist,
  are in the actual retrieved context, and collectively cover expected sources.
- **Refusal Recall:** unanswerable turns that abstain.
- **Refusal Precision:** abstentions that belong to unanswerable turns.
- **Unsupported Claim Rate:** responses matching a case's known forbidden concepts.
- **Provider calls:** actual calls emitted by the production chat service. A
  zero-retrieval turn should show zero provider calls because it short-circuits.

These deterministic checks are deliberately approximate. They do not parse every
natural-language claim or prove semantic entailment. `manual_review` can be added to
future cases that cannot be represented safely with aliases; v1 keeps all cases
machine-evaluable. No external judge service is used.

Citation validation checks all of the following: the chunk exists, belongs to the
uploaded evaluation document, appears in the exact retrieved context, and contains
an expected semantic source marker. Merely returning a citation is not enough.

## Latency and reproducibility

The opt-in production trace records exact retrieval, provider-generation and
end-to-end service durations with `performance.now()`, plus rank, heading and lexical
score. Reports contain mean, nearest-rank p50, p95 and max. This is single-request
development evaluation, not a concurrent load test or production SLO measurement.

Every report records UTC timestamp, Git SHA, dataset version, case/turn counts,
mode, retriever configuration and, in live mode, provider model/base URL. Credentials
are never recorded. Token counts are explicitly marked unavailable because the
current provider-neutral answer contract does not expose usage; pricing is not
hard-coded.

## Decision signal

The report emits `evidence_supports_hybrid_experiment` if any of these descriptive
v1 thresholds fail:

- overall Hit@3 ≥ 0.90;
- paraphrased Hit@3 ≥ 0.85; or
- Hit@3 ≥ 0.85 in any category with at least four answerable turns.

Otherwise it emits `lexical_adequate_on_v1_fixture`. This is a prioritization signal,
not a product gate or proof of real-world quality. The category breakdown and failed
case traces remain the primary evidence for deciding what retrieval experiment to run.

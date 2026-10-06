# RAG Ingestion & Citation v1

**IMPLEMENTED — bounded development/council-demo capability.** It is not a full HaUI knowledge
base, production search system or evidence of answer accuracy/student outcomes.

## Architecture

```text
manifest + local source
  → hash verification + extraction
  → heading/page-aware deterministic chunks
  → mandatory scope/course filter
  → local BM25-like lexical ranking
  → bounded grounded-answer provider
  → structural citation validation
  → answered | abstained API response
```

`KnowledgeRetriever` and `GroundedAnswerProvider` live with the application consumer. Vendor SDK,
HTTP, filesystem and ranking implementation do not leak into domain/engines. Risk, NBA, Planner
and Replanner are unchanged.

## Corpus and ingestion

The runtime reads `data/manifest.json`, verifies every source SHA-256 and ingests only groups
`haui` and `courses`; synthetic student/scenario JSON/CSV is excluded. Current inventory:

- 3 public HaUI text snapshots (`institutional`, `official_public`);
- 20 fictional Markdown documents across `db`, `ml`, `en` and `se` (`course`,
  `fictional_demo`); the RAG UI exposes `db`, `ml`, `se`;
- 117 deterministic chunks: 24 institutional and 93 course chunks.

Every chunk contains document/chunk identity, title, scope, document/source type, nullable course
and URL, local path, version/date, stable index, nullable page/section, content hash and manifest
source hash. IDs are SHA-256-derived; no random UUID is used.

Markdown extraction preserves authored headings and paragraphs. Plain/derived text snapshots use
paragraph structure and a deterministic sentence/word fallback for overlong blocks. PDF page
boundaries are supported through `PdfPageReader` and covered with a fake page-reader test; the
current manifest has no PDF and v1 deliberately bundles no OCR or PDF dependency. No heading or
page number is invented. Maximum chunk size is 1,400 characters and overlap is zero.

## Retrieval and embeddings

`LocalLexicalKnowledgeRetriever` performs a small BM25-like token ranking. This is a reproducible
lexical fallback, **not semantic vector search**. Scope and `course_id` are hard pre-ranking filters.
The answer workflow requires a minimum score and explicit acronym/version/English anchors to occur
in evidence; this conservative rule prevents generic overlap from answering a named concept absent
from the selected course.

No embedding provider or vector DB is used. The application boundary already allows another
retriever later. pgvector is the recommended next persistence adapter only after a migration,
extension setup, real PostgreSQL tests and an offline-safe composition path exist.

## Grounded answer and citations

Offline mode uses a deterministic template over the strongest retrieved chunk. When existing
server-side OpenAI configuration is enabled, the Responses adapter receives only the question,
bounded evidence and citation handles. Its prompt states that document text is untrusted evidence,
not instruction, and prohibits following embedded requests or calling tools.

The provider returns answer text plus handles. It cannot create response citations directly. The
backend rejects malformed output, abstained output, empty/duplicate/unknown handles and any handle
outside the retrieval set. Valid handles are mapped to structural citations:

```json
{
  "citation_id": "c1",
  "document_id": "knowledge:courses:db:assignments.md",
  "chunk_id": "chk_...",
  "title": "...",
  "source_url": null,
  "page": null,
  "section": "Database Mini Project"
}
```

## Abstention and API

`POST /api/v1/knowledge/query` accepts `question`, `scope` and nullable `course_id`. Institutional
scope forbids a course; course scope requires `db`, `ml` or `se`. No raw vectors are exposed.

Insufficient evidence, missing anchors, malformed/invalid provider output, timeout or provider error
returns `status=abstained`, no citations and:

> Chưa tìm thấy đủ thông tin trong tài liệu hiện có để trả lời chắc chắn.

UI badges are explicit: `Nguồn công khai HaUI` and `Tài liệu môn học demo`.

## Evaluation and limitations

`evals/datasets/rag-v1.json` has 25 public/fictional-safe cases: answerable scopes, cross-course
filtering, unsupported questions, fabricated/duplicate citations, source separation and prompt
injection in a document. `evals/rag_v1.py --mode offline` is deterministic. `--mode live` is an
explicit provider run and reports separately; fallback is never counted as LLM success.

The offline baseline checks engineering invariants, not semantic quality at scale. Known limits:

- lexical retrieval has limited paraphrase/synonym recall;
- public HaUI coverage is only three time-stamped snapshots, not regulations coverage;
- the deterministic fallback quotes/summarizes one strongest chunk and is less fluent;
- no persisted index, embeddings, pgvector, authorization, private data or user upload;
- structural citation validation proves the source was retrieved, not full natural-language
  entailment of every model sentence.

See [ADR-0007](../decisions/0007-bounded-local-rag-and-structural-citations.md) and the
[two-minute demo](../demo/rag-demo-v1.md).

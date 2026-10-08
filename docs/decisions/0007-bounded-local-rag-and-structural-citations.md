# ADR-0007: Bounded local RAG and structural citations

- Status: Accepted
- Date: 2026-10-05

## Context

The versioned public/fictional corpus is available, but a council demo must remain reproducible
without a credential, network, vector service or private LMS data. RAG also introduces two trust
boundaries: retrieved document text is untrusted, and model-produced citation identifiers cannot
be displayed without server validation. Adding pgvector now would require an extension, migration,
real PostgreSQL path and separate offline behavior before retrieval semantics have been evaluated.

## Decision

RAG v1 is a bounded application workflow. `KnowledgeRetriever` and `GroundedAnswerProvider` are
application-owned ports. Infrastructure ingests only manifest-registered knowledge files, creates
deterministic structural chunks and serves a local BM25-like lexical adapter. It is explicitly a
lexical fallback, not semantic/vector search. Mandatory scope and course filters run before ranking.

Markdown chunking preserves headings and paragraphs. Text snapshots preserve paragraphs. PDF page
boundaries are supported through a small text-page reader seam; v1 ships no PDF corpus and no OCR.
No random UUID identifies a chunk: identity derives from document ID, structural position,
page/section and content hash.

The offline grounded-answer adapter summarizes only the highest-ranked sufficiently relevant
chunk. The optional existing OpenAI Responses adapter receives bounded evidence, treats document
content as untrusted data and returns strict structured output. The model may refer only to handles
issued by the backend (`c1`, `c2`, ...). The application maps valid handles back to retrieved chunks;
unknown or duplicate handles, malformed output, timeout and provider errors fail closed to
abstention.

The response distinguishes official public HaUI snapshots from fictional demo course material.
Queries are independent; there is no memory, agent, web search, file upload or tool execution.

## Consequences

- The normal test/demo path is deterministic and network-free.
- Scope/course isolation and citation validity are testable without a model.
- No embeddings are generated in v1; an embedding provider and pgvector remain future adapters.
- Lexical retrieval has weaker synonym/semantic recall and uses conservative abstention anchors.
- Provider-side grounding cannot prove sentence-level entailment; backend validation proves citation
  membership and provenance, while the strict prompt and bounded context reduce unsupported output.
- A production PDF adapter, authorization model and persisted index are still required before
  broader ingestion.

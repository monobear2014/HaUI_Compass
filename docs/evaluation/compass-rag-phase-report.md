# Compass RAG phase report — 2026-10-08

## 1. Outcome and scope

**RAG RETRIEVAL HARDENED AND VALIDATED + PDF RAG V1 READY** within the tested fixture/configuration.
Selected production strategy: **LEXICAL**. Hybrid experiment: **NOT JUSTIFIED**;
keep lexical for v1, revisit on independent semantic-miss evidence.

A–E, H–K, M–Q completed. F/G intentionally not applicable after the evidence gate.
No OCR, embeddings, vector service, agent framework, web search or study-plan/flashcard mutation.

## 2. Live baseline, A/B and final metrics

All live runs use real `gpt-5-mini-2025-08-07`; no provider mock/fallback.
Baseline/hardened are same 48-case/54-turn dataset, 44 answerable turns, development
runtime and **8-second deadline**. The production runs use **30 seconds**:
these are different operating-condition experiments, not paired quality deltas.
The full PDF v1 run has 56 cases/62 turns/50 answerable turns; PDF v2 adds one
cross-page case (57/63 offline), with a separate nine-case live PDF slice.

| Metric | Baseline, 54 / 8s | Hardened, 54 / 8s | Selected, 54 / 30s | Full PDF v1, 62 / 30s | PDF v2 slice, 9 / 30s |
|---|---:|---:|---:|---:|---:|
| Hit@1 | 95.45% | 100.00% | 100.00% | 100.00% | 100.00% |
| Hit@3 | 95.45% | 100.00% | 100.00% | 100.00% | 100.00% |
| Hit@5 | 95.45% | 100.00% | 100.00% | 100.00% | 100.00% |
| MRR | 0.9545 | 1.0000 | 1.0000 | 1.0000 | 1.0000 |
| Source recall@5 | 95.45% | 100.00% | 100.00% | 100.00% | 100.00% |
| Unanswerable empty retrieval | 70.00% | 70.00% | 70.00% | 75.00% | 100.00% |
| Grounded Answer Rate (raw aliases) | 84.09% | 81.82% | 81.82% | 86.00% | 85.71% |
| Citation precision | 100.00% | 100.00% | 100.00% | 100.00% | 100.00% |
| Citation coverage | 93.18% | 93.18% | 100.00% | 100.00% | 100.00% |
| Citation correctness | 93.18% | 93.18% | 100.00% | 100.00% | 100.00% |
| Refusal precision | 83.33% | 100.00% | 100.00% | 100.00% | 100.00% |
| Refusal recall | 100.00% | 90.00% | 100.00% | 100.00% | 100.00% |
| Known unsupported-phrase rate | 0.00% | 0.00% | 0.00% | 0.00% | 0.00% |
| Provider error rate / all turns | 1.85% | 7.41% | 0.00% | 0.00% | 0.00% |
| retrieval p50 / p95, ms | 0.532 / 2.043 | 0.703 / 6.378 | 0.882 / 5.179 | 0.757 / 11.282 | 0.416 / 1.643 |
| generation p50 / p95, ms | 4892.517 / 7027.633 | 5094.025 / 8036.036 | 5970.772 / 10753.665 | 4872.295 / 8292.322 | 4944.458 / 6713.618 |
| end_to_end p50 / p95, ms | 4894.648 / 7030.378 | 5096.137 / 8037.367 | 5977.035 / 10755.28 | 4887.105 / 8294.139 | 4946.436 / 6715.65 |
| Observed input tokens | 40584 | 39278 | 43066 | 45745 | 3187 |
| Observed output tokens | 27291 | 25318 | 30199 | 31670 | 4180 |
| Observed total tokens | 67875 | 64596 | 73265 | 77415 | 7367 |
| Responses with usage | 44 | 43 | 47 | 53 | 7 |
| Provider calls | 45 | 47 | 47 | 53 | 7 |

Only observed usage is summed. Timed-out requests may incur unobserved billing;
token deltas are not billed-cost or efficiency claims. No pricing is hard-coded.
Latency samples include zero-generation short-circuit refusals, use nearest-rank
percentiles, and are sequential host measurements, not a load/SLO certification.
The full PDF run overlapped regression/QA work on the host; latency changes cannot
be attributed causally to the three extra stop words.

## 3. Per-category live breakdown

Each cell is **Hit@3 / raw GAR / citation correctness / refusal recall**.
A dash means the denominator does not exist, not zero.

| Category | Baseline | Hardened | Selected | Full PDF v1 |
|---|---|---|---|---|
| direct_factual | 100.00% / 100.00% / 100.00% / — | 100.00% / 91.67% / 100.00% / — | 100.00% / 91.67% / 100.00% / — | 100.00% / 91.67% / 100.00% / — |
| paraphrased | 100.00% / 75.00% / 100.00% / — | 100.00% / 75.00% / 100.00% / — | 100.00% / 75.00% / 100.00% / — | 100.00% / 87.50% / 100.00% / — |
| multi_section | 83.33% / 66.67% / 83.33% / — | 100.00% / 66.67% / 66.67% / — | 100.00% / 83.33% / 100.00% / — | 100.00% / 66.67% / 100.00% / — |
| follow_up | 100.00% / 91.67% / 100.00% / — | 100.00% / 75.00% / 91.67% / — | 100.00% / 75.00% / 100.00% / — | 100.00% / 83.33% / 100.00% / — |
| no_evidence | — / — / — / 100.00% | — / — / — / 100.00% | — / — / — / 100.00% | — / — / — / 100.00% |
| ambiguous | 100.00% / 50.00% / 50.00% / 100.00% | 100.00% / 100.00% / 100.00% / 50.00% | 100.00% / 100.00% / 100.00% / 100.00% | 100.00% / 100.00% / 100.00% / 100.00% |
| adversarial | 75.00% / 75.00% / 75.00% / — | 100.00% / 100.00% / 100.00% / — | 100.00% / 75.00% / 100.00% / — | 100.00% / 75.00% / 100.00% / — |
| pdf | — | — | — | 100.00% / 100.00% / 100.00% / 100.00% |

## 4. Failure analysis and lexical fixes

The complete taxonomy is retained in `evals/rag/analysis.py`:
retrieval_miss, ranking_issue, tokenization_issue, normalization_issue,
multi_source_recall_issue, generation_missing_concept, unsupported_claim,
bad_citation, false_refusal, missed_refusal, context_failure,
prompt_injection_failure, provider_error, timeout, evaluator_issue, dataset_issue.

Slash/hyphen splitting already worked. The two original misses were not punctuation:
`multi-006` required absent generic **checklist**; `adversarial-004` required singular
**instruction** while evidence used plural **instructions**. Fix: exclude generic
query-format checklist and apply conservative ASCII plural normalization identically
to query/evidence (protect short acronyms and ss/us/is/ics endings).
Weights, thresholds, chunk size/overlap, follow-up behavior and prompts are unchanged.

The initial PDF eight-case run exposed three new ordinary-English anchor mistakes:
`affect`, `direction`, `defined`. Their exclusion is supported by unchanged-question
offline/live evidence. Unknown named anchors (Transformer, Kubernetes) still refuse.
Initial PDF Hit@3/recall were 50%; after this bounded fix they are 100%.
The original 48 cases remain byte-equivalent as objects in the extension.
Neither expectations nor aliases were changed after observing generated answers.

### Complete failed/degraded turn review

The following tables preserve **raw** failed turns. Semantic-equivalent answers are
tagged evaluator_issue separately rather than rewriting raw GAR. Reviews check the
required concepts, not exhaustive every-claim entailment. No dataset_issue or true
prompt-injection failure was found in these traces.

#### baseline-live-complete

| Case / turn | Root cause and tags | Review |
|---|---|---|
| paraphrased-004 / 1 | generation_missing_concept (raw), evaluator_issue (review) | Required concepts expressed with equivalent wording/numbers; raw alias match fails. |
| paraphrased-008 / 1 | generation_missing_concept (raw), evaluator_issue (review) | Required concepts expressed with equivalent wording/numbers; raw alias match fails. |
| multi-004 / 1 | generation_missing_concept (raw), evaluator_issue (review) | Required concepts expressed with equivalent wording/numbers; raw alias match fails. |
| multi-006 / 1 | retrieval_miss, false_refusal | Generic checklist wrongly treated as mandatory anchor. |
| followup-002 / 2 | generation_missing_concept (raw), evaluator_issue (review) | Required concepts expressed with equivalent wording/numbers; raw alias match fails. |
| ambiguous-003 / 1 | provider_error, timeout | Configured provider deadline exceeded; not a refusal. |
| adversarial-004 / 1 | retrieval_miss, false_refusal, normalization_issue | Singular/plural instruction anchor mismatch. |

#### lexical-hardened-live

| Case / turn | Root cause and tags | Review |
|---|---|---|
| direct-006 / 1 | generation_missing_concept (raw), evaluator_issue (review) | Required concepts expressed with equivalent wording/numbers; raw alias match fails. |
| paraphrased-001 / 1 | generation_missing_concept (raw), evaluator_issue (review) | Required concepts expressed with equivalent wording/numbers; raw alias match fails. |
| paraphrased-008 / 1 | generation_missing_concept (raw), evaluator_issue (review) | Required concepts expressed with equivalent wording/numbers; raw alias match fails. |
| multi-004 / 1 | provider_error, timeout | Configured provider deadline exceeded; not a refusal. |
| multi-005 / 1 | provider_error, timeout | Configured provider deadline exceeded; not a refusal. |
| followup-002 / 1 | generation_missing_concept (raw), evaluator_issue (review) | Required concepts expressed with equivalent wording/numbers; raw alias match fails. |
| followup-002 / 2 | generation_missing_concept (raw), evaluator_issue (review) | Required concepts expressed with equivalent wording/numbers; raw alias match fails. |
| followup-005 / 2 | provider_error, timeout | Configured provider deadline exceeded; not a refusal. |
| ambiguous-001 / 1 | provider_error, timeout | Configured provider deadline exceeded; not a refusal. |

#### final-selected

| Case / turn | Root cause and tags | Review |
|---|---|---|
| direct-006 / 1 | generation_missing_concept (raw), evaluator_issue (review) | Required concepts expressed with equivalent wording/numbers; raw alias match fails. |
| paraphrased-001 / 1 | generation_missing_concept (raw), evaluator_issue (review) | Required concepts expressed with equivalent wording/numbers; raw alias match fails. |
| paraphrased-008 / 1 | generation_missing_concept (raw), evaluator_issue (review) | Required concepts expressed with equivalent wording/numbers; raw alias match fails. |
| multi-004 / 1 | generation_missing_concept (raw), evaluator_issue (review) | Required concepts expressed with equivalent wording/numbers; raw alias match fails. |
| followup-002 / 1 | generation_missing_concept (raw), evaluator_issue (review) | Required concepts expressed with equivalent wording/numbers; raw alias match fails. |
| followup-002 / 2 | generation_missing_concept (raw), evaluator_issue (review) | Required concepts expressed with equivalent wording/numbers; raw alias match fails. |
| followup-006 / 2 | generation_missing_concept (raw), evaluator_issue (review) | Required concepts expressed with equivalent wording/numbers; raw alias match fails. |
| adversarial-004 / 1 | generation_missing_concept (raw), evaluator_issue (review) | Required concepts expressed with equivalent wording/numbers; raw alias match fails. |

#### final-pdf-extended

| Case / turn | Root cause and tags | Review |
|---|---|---|
| direct-006 / 1 | generation_missing_concept (raw), evaluator_issue (review) | Required concepts expressed with equivalent wording/numbers; raw alias match fails. |
| paraphrased-008 / 1 | generation_missing_concept (raw), evaluator_issue (review) | Required concepts expressed with equivalent wording/numbers; raw alias match fails. |
| multi-001 / 1 | generation_missing_concept (raw), evaluator_issue (review) | Required concepts expressed with equivalent wording/numbers; raw alias match fails. |
| multi-004 / 1 | generation_missing_concept (raw), evaluator_issue (review) | Required concepts expressed with equivalent wording/numbers; raw alias match fails. |
| followup-002 / 1 | generation_missing_concept (raw), evaluator_issue (review) | Required concepts expressed with equivalent wording/numbers; raw alias match fails. |
| followup-002 / 2 | generation_missing_concept (raw), evaluator_issue (review) | Required concepts expressed with equivalent wording/numbers; raw alias match fails. |
| adversarial-004 / 1 | generation_missing_concept (raw), evaluator_issue (review) | Required concepts expressed with equivalent wording/numbers; raw alias match fails. |

#### pdf-eval

| Case / turn | Root cause and tags | Review |
|---|---|---|
| pdf-001 / 1 | generation_missing_concept (raw), evaluator_issue (review) | Answer says phân bố xác suất; alias only accepts phân phối xác suất. Correct page 1. |

Initial PDF failures `pdf-003/004/006`: retrieval_miss + false_refusal from generic
English phrasing, fixed with regression tests. These initial artifacts remain intact.
PDF v2 cross-page `pdf-009` retrieves and cites both original pages **2 and 1**;
both expected concepts are present. All seven answerable PDF v2 turns cite the correct
pages; both negative turns refuse with no sources/calls. Raw GAR remains **6/7** due
to the untouched `pdf-001` alias false negative, not a fabricated 100% quality score.

## 5. No-evidence safety

Original dataset: 7/10 unanswerable turns have empty retrieval, 3/10 retrieve noisy
overlapping evidence. The latter (negative-008, ambiguous-001/002) must be refused by
grounded generation rather than being treated as positive retrieval hits. Baseline
refuses all ten; hardened 8s run times out on ambiguous-001; successful responses
still refuse. Selected and full PDF runs refuse all negatives with zero citations.
All zero-retrieval turns make zero provider calls. Eight-case/9-case PDF negatives
both have empty retrieval. Empty-retrieval rate alone is not refusal quality.

## 6. Before/after decision and complexity

Paired baseline → hardened: Hit@1/3/5 and recall **+4.55 pp**, MRR **+0.0455**;
multi-section **+16.67 pp**, adversarial **+25 pp**; direct/paraphrase/follow-up unchanged.
Raw GAR **-2.27 pp**, correctness unchanged at 93.18%, provider errors **+5.56 pp**:
do not claim improved operational reliability from retrieval alone.
See [paired A/B detail](compass-rag-retrieval-decision.md) for all latency/token deltas.
The 30s experiments remove observed deadline failures, but do not change production
defaults or `.env`, and are not evidence that lexical caused that reliability change.

Hybrid cannot repair timeout failures or brittle evaluator aliases. After evidenced
normalization, no semantic source miss remains in this small corpus. Embedding calls,
latency, index/storage and vector dependencies are **zero/not added**. Only PDF parsing
adds a production dependency (`pypdf`) and an ephemeral worker inside the existing API.
No semantic retrieval quality claim beyond these fixtures; no independent holdout.

## 7. PDF implementation

Internal service-key-protected API → application `PdfTextExtractor` port → bounded
pypdf subprocess → extracted pages → shared page chunker → existing owner-scoped
SQLite retriever → original grounded answer/citation validation/persistence.

Migration 004 stores nullable original 1-based page metadata; no cross-page chunk.
Text headings/offsets are unchanged; PDF offsets refer to extracted text within a page.
Empty pages are skipped without renumbering later pages. Exact original bytes remain.
Malformed files reject before the upload batch transaction; image/graphics-only,
empty and encrypted PDFs persist unsupported with the assistant disabled. No OCR.
Ready dedup preserves chunk/citation IDs. Reupload retries failed/legacy unsupported PDFs.
Citation click authorizes the chunk and opens the original PDF viewer at `#page=N`.
No alternate public API, bypass of owner/session/study-set boundaries, or arbitrary-URL parser.

Limits: 5 MiB, 200 pages, 1M text characters, 4 MiB decoded stream/page, 15s wall/10s
Unix CPU; Linux 512 MiB address-space cap. Timeout/cancellation kills and reaps the worker.
Page extraction/reader details: [feature documentation](../features/compass-assistant.md).
Fixture QA used the PDF skill: ReportLab fixtures and Poppler rendering of all four
renderable fixture pages were visually inspected (no clipped/overlapping text).
Zero-page fixture is deliberately unsupported and has no page to render.

## 8. PDF evaluation and dataset versions

The first extension added eight cases (single-page facts across a three-page PDF,
page correctness, two negatives). A ninth cross-page case was appended as
`compass-rag-eval-v1-pdf-v2`; no old case was replaced. Original full 62-turn live
run and later nine-case PDF live run are reported separately, **not pooled** into
a synthetic aggregate. Current full offline v2 has 57 cases/63 turns, Hit@1/3/5,
MRR and source recall@5 all 100%; PDF live page/source correctness is 100%.
Raw GAR differs between repeated live runs because alias wording is stochastic;
it is not a retrieval or dataset-tuned improvement claim.

## 9. Verification

| Check | Result |
|---|---|
| Backend excluding dedicated PostgreSQL directory | 1,575 passed, no skips |
| Real isolated PostgreSQL | 14 passed, no skips |
| Production-build Playwright desktop + mobile | 142 passed, no skips |
| Pure lexical regression | 4 passed |
| Ruff | pass |
| mypy (src + tests) | 222 source files pass |
| TypeScript / ESLint / Next production build | pass |
| SQLite clean/upgrade/idempotency, preserved FK/citations | pass |
| PDF worker timeout/cancellation cleanup and page-evaluator regression | pass |
| Poppler visual QA | all renderable fixture pages pass |

Deprecation warnings in Starlette/TestClient and Alembic are pre-existing, not test
failures. Provider mocks appear only in browser regression transport, never in live
quality runs. The final later dataset-only change reran backend/eval tests; production
code/build was unchanged from the 142-test verified version.

## 10. Artifact index and provenance

All paths below are relative to `artifacts/evals/compass-rag-phase/`.
Each run keeps its summary, report, cases and (live) sanitized provider/retrieval traces
and server log; runtime artifacts are intentionally ignored by Git.

| Artifact | Purpose |
|---|---|
| baseline-offline | Original deterministic baseline |
| baseline-live-complete | Full valid live baseline |
| baseline-live-initial, baseline-live | Retained runner-error attempts, not quality baselines |
| baseline-analysis.json | Full baseline failure table |
| lexical-hardened-offline, lexical-hardened-live | Paired hardened retrieval/live |
| hardened-analysis.json, ab-live.json | Hardened failures and paired deltas |
| final-selected | Production selected original 54-turn / 30s run |
| final-selected-analysis.json | Full selected failure table |
| pdf-offline, pdf-live-initial | Initial eight-PDF-case 50% retrieval evidence |
| pdf-extended-offline, final-pdf-offline | Full extension offline comparisons |
| final-pdf-extended | Full 62-turn production / 30s run |
| final-pdf-analysis.json | Full extension failure table |
| pdf-v2-offline | Latest 63-turn offline with cross-page case |
| pdf-eval-offline | Same 63-turn cases after correcting the dataset's descriptive case count |
| pdf-eval, pdf-analysis.json | Latest nine-case real-live PDF slice/failures |

Reports record Git SHA, dataset version/hash, retriever strategy/hash, model,
UTC timestamp, runtime and deadline. Some early metadata predates hash capture;
raw evidence is preserved, not retroactively rewritten. Git SHA is captured at
report emission; use dataset/retriever hashes and implementation commits for precise
provenance. Code commits: `bbb9b5e` original lexical fix, `8d96af7` English fix,
`8909018` PDF adapter, `91582f6` PDF web flow, `f786c11` first PDF evaluation,
`f5a8fb0` lifecycle tests, `0397a38` cross-page extension.

After the live PDF v2 run, only its top-level description was corrected from eight
to nine cases. Cases, concepts and sources are unchanged. The live dataset hash
therefore resolves to commit `0397a38`; `pdf-eval-offline` records the current file hash.

## 11. Bugs found

| Severity | Cause | Fix / regression |
|---|---|---|
| Medium | Relative trace path interpreted from web cwd; instrumentation could fail a response | Absolute run paths, best-effort traces; failed attempts retained |
| Medium | Runner aborted full dataset on HTTP provider failure | Persist failed turns/partial results, never count them as refusals |
| Medium | Generic checklist + plural instruction anchors rejected real evidence | Symmetric bounded normalization; punctuation/Unicode/absent-anchor tests |
| Medium | English affect/direction/defined incorrectly required in PDF source | Three evidenced function words; unknown-name refusal tests |
| Medium | All PDFs unsupported; citation page always null | Bounded extraction, migration 004, page chunks/DTO/persistence/source/viewer tests |
| Evaluation limitation | Valid paraphrases fail substring aliases | Preserve raw scores, add explicit manual failure review; no post-run rubric tuning |

## 12. Remaining limitations

OCR, image understanding, complex-layout reading order/exact PDF highlighting deferred.
Small synthetic corpus, short multi-section chunks, no independent holdout or statistical
significance. Lexical named-anchor fail-closed can still miss unseen semantic phrasing.
Known-phrase unsupported-claim detection and aliases are not exhaustive entailment.
No load, adversarial-file security certification or multi-instance certification;
macOS worker lacks the Linux memory cap. Viewer page fragments are browser-dependent.
Production's existing 8s default remains unchanged and can still timeout; configure
the deployment deadline deliberately. Do not claim zero provider failures outside
the observed 30s runs.

## 13. Final verdict

**RAG RETRIEVAL HARDENED AND VALIDATED + PDF RAG V1 READY**, with the documented
fixture, evaluator and operational limits. **KEEP LEXICAL FOR V1, REVISIT LATER**.

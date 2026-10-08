# Production retrieval decision

Selected production strategy: **LEXICAL** (hardened). Hybrid experiment: **NOT JUSTIFIED**.

The same dataset/model/scoring with an 8-second timeout gives:

| Metric | Baseline | Hardened | Delta |
|---|---:|---:|---:|
| Hit@1 / Hit@3 / Hit@5 | 95.45% | 100% | +4.55 pp |
| MRR | 0.9545 | 1.0 | +0.0455 |
| Source recall@5 | 95.45% | 100% | +4.55 pp |
| Multi-section Hit@3 | 83.33% | 100% | +16.67 pp |
| Adversarial Hit@3 | 75% | 100% | +25 pp |
| Direct / paraphrased / follow-up Hit@3 | 100% | 100% | 0 pp |
| Unanswerable empty retrieval | 70% | 70% | 0 pp |
| Raw grounded answer rate | 84.09% | 81.82% | -2.27 pp |
| Citation precision | 100% | 100% | 0 pp |
| Citation correctness | 93.18% | 93.18% | 0 pp |
| Refusal precision | 83.33% | 100% | +16.67 pp |
| Refusal recall (errors count as failures) | 100% | 90% | -10 pp |
| Known unsupported-phrase rate | 0% | 0% | 0 pp |
| Provider error rate | 1.85% | 7.41% | +5.56 pp |
| Retrieval p50 / p95 (ms) | 0.532 / 2.043 | 0.703 / 6.378 | +0.171 / +4.335 |
| Generation p50 / p95 (ms) | 4892.517 / 7027.633 | 5094.025 / 8036.036 | +201.508 / +1008.403 |
| End-to-end p50 / p95 (ms) | 4894.648 / 7030.378 | 5096.137 / 8037.367 | +201.489 / +1006.989 |
| Observed input / output / total tokens | 40584 / 27291 / 67875 | 39278 / 25318 / 64596 | -1306 / -1973 / -3279 |

This is retrieval improvement, not evidence of improved end-to-end reliability.
Hardened live has four timeouts: `multi-004`, `multi-005`, `followup-005` turn 2,
`ambiguous-001`. Three answerable failures account for the missing citations;
the unanswerable timeout accounts for refusal recall dropping. Successful negative
answers still refuse with zero citations. No false supported answers were observed.

Five additional raw concept mismatches are evaluator issues on manual review:
`direct-006` (mean of assigned points), `paraphrased-001` (sum to one),
`paraphrased-008` (class ordering unchanged), and both `followup-002` turns
(step size and slow convergence). The dataset/rubric was not tuned to make these
responses pass. Reviewed required-concept rate for answerable turns is 41/44
in both runs. This is separate from exhaustive entailment checking.

The known misses are resolved by a generic query-format stop word and a bounded
ASCII plural normalization rule applied to both query and evidence. Punctuation
splitting, ranking weights, chunk sizes, scopes and prompts are unchanged. Tests
cover slash/hyphen/punctuation, mixed Vietnamese/English, NFC/NFD, preserved short
acronyms and unknown named technical concepts. No retrieval weights were tuned.

No semantic retrieval failure remains on this small corpus. Adding embeddings
cannot fix provider deadlines or brittle aliases. Consequently the automatic
earlier hybrid suggestion is superseded by this reviewed decision. No hybrid code,
embedding calls, vector storage or additional operational services are shipped.

A final selected-strategy run uses the production web build and an explicitly
recorded **30-second benchmark timeout** to investigate the deadline problem.
It is a separate operating-condition experiment, not a paired quality delta.
`.env` is not modified; production deployments must deliberately choose their
timeout budget. No statistical significance or load/SLO claim is made from these
single sequential runs. Short documents often share multiple semantic sections
within a single chunk, so high Hit@1 does not prove ranking quality on long corpora.

Generated full comparisons/failures are retained under
`artifacts/evals/compass-rag-phase/ab-live.json`, `baseline-analysis.json`,
`hardened-analysis.json`, and the individual baseline/hardened run directories.

## Selected strategy and PDF follow-through

The selected 54-turn production / 30s run completed with Hit@1/3/5 and recall 100%,
citation correctness 100%, refusal precision/recall 100% and provider errors 0%.
Raw GAR is 81.82% due to eight manually reviewed alias false negatives; the rubric
was not changed. This is not evidence of a paired GAR gain over the 8s baseline.

The additive PDF slice revealed three further lexical function-word misses:
`affect`, `direction`, `defined`. A separate bounded fix excludes those words;
no weights or named-anchor rules changed. Unchanged PDF cases went from 50% to 100%
retrieval, and the full 62-turn production rerun retains 100% source recall. The
ninth cross-page case in PDF v2 also retrieves/cites pages 1 and 2. This is lexical
phrasing evidence, not justification for embeddings. Hybrid remains NOT JUSTIFIED.

See [complete phase report](compass-rag-phase-report.md) for every metric, failure
table, PDF version, deadline distinction, regression result and artifact.

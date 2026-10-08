# Live baseline and failure review

Full current 48-case / 54-turn dataset was run on 2026-10-08 with real
`gpt-5-mini-2025-08-07`, timeout 8 seconds. Artifacts:
`artifacts/evals/compass-rag-phase/baseline-live-complete/`.

Raw deterministic grounded answer rate was 84.09%; citation precision 100%;
citation correctness/coverage 93.18%; refusal precision 83.33%; refusal recall
100%; configured unsupported-phrase rate 0%; provider error rate 1.85% (one timeout).
Input/output/total observed tokens: 40,584 / 27,291 / 67,875. Usage excludes the
timed-out request because no response usage was available.

| Case / turn | Category | Root cause | Failure tags |
|---|---|---|---|
| paraphrased-004 / 1 | paraphrased | Valid meaning “theo thứ tự thời điểm bạn gửi yêu cầu” misses contiguous alias | evaluator_issue |
| paraphrased-008 / 1 | paraphrased | Valid explanation “lớp đứng đầu ... không thay đổi” misses configured alias | evaluator_issue |
| multi-004 / 1 | multi_section | Correct `GPA học kỳ ≥ 3.20` differs from contiguous GPA alias | evaluator_issue |
| multi-006 / 1 | multi_section | `checklist` is treated as an absent mandatory technical anchor | retrieval_miss, false_refusal, tokenization_issue |
| followup-002 / 2 | follow_up | Correct “hội tụ sẽ rất chậm” misses contiguous alias | evaluator_issue |
| ambiguous-003 / 1 | ambiguous | Provider exceeded configured 8-second limit | timeout, provider_error |
| adversarial-004 / 1 | adversarial | Query `instruction` does not match plural `instructions` | retrieval_miss, false_refusal, normalization_issue |

The four evaluator issues remain failures in the raw score to keep the original
dataset and scoring comparable. Manual review recognizes their required facts;
no prompt change is justified by these four rows. A semantic judge was not used.
The reviewed baseline rate is 41/44 = 93.18%, separate from the raw deterministic
rate. This manual review checks required facts, not exhaustive claim entailment.

All eight no-evidence and both unanswerable ambiguous cases refused. Seven of these
ten turns had empty retrieval and zero provider calls. The three noisy retrievals
were `negative-008`, `ambiguous-001` and `ambiguous-002`; downstream generation refused
each with zero citations. Noise is tracked separately from unsupported answering.

The previously suggested slash/hyphen diagnosis was incorrect: punctuation already
splits these tokens. `merge`, `deploy` and `upload` exist in the corpus. Required
anchors actually missing were `checklist` and singular `instruction`.

Two harness bugs prevented initial runs: relative trace paths were interpreted from
the web process working directory, and a single HTTP error aborted the dataset.
Those attempts are retained as `baseline-live-initial` and `baseline-live`. The
runner now resolves output paths, saves partial per-turn rows, distinguishes errors
from refusals and completes the dataset. Opt-in observation cannot fail a product
request. Account storage now honors the same isolated storage directory as uploads.

No retrieval or prompt behavior changed before this complete baseline was saved.

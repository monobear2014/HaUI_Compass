# Data & Knowledge Corpus v1 — council runbook

**IMPLEMENTED:** corpus offline có version, provenance, checksums và validation tooling.
**PLANNED:** ingestion, chunking, embeddings, retrieval, citations runtime và RAG evaluation.

## Preflight

Từ repo root:

```bash
apps/api/.venv/bin/python scripts/corpus_v1.py
apps/api/.venv/bin/python scripts/test_corpus_v1.py
```

Kỳ vọng validator: PASS, demo 10, haui 3, courses 15. Regression tests thay đổi bản copy tạm,
không sửa corpus gốc hoặc API đang trình bày. Vẫn chạy demo_preflight và canonical council
runbook hiện có để kiểm tra ứng dụng; corpus validator không thay thế app preflight.

## Phần trình bày bổ sung, khoảng một phút

1. Mở `data/manifest.json`. Chỉ ra ba nhóm nguồn, ID và checksum. Nói: “Dữ liệu sinh viên là
   synthetic. Tài liệu HaUI là bản chụp thông tin công khai có nguồn và thời điểm.”
2. Mở `data/demo/crunch/academic.json`: ba course, năm assignment, năm submission status.
   Mở `student-workspace.json` để thấy bốn task và study windows. Database Mini Project chưa
   có task; dữ liệu assignment không tự trở thành công việc đã xác nhận.
3. Mở `data/knowledge/courses/db/assignments.md` và `rubric.md`. Chỉ ra nhãn HƯ CẤU và rubric
   hỗ trợ tự đánh giá; đây không phải lời giải bài nộp hoặc tài liệu chính thức HaUI.
4. Mở README nguồn HaUI, chỉ ra URL và phạm vi thời gian. Bản tuyển sinh 2025 chỉ là lịch sử.
5. Nói: “Corpus đã sẵn sàng để review nguồn và thiết kế RAG tiếp theo. Demo hiện chưa retrieve
   những file này; Risk, NBA và scheduling vẫn chạy qua core hiện có.”

## Import tùy chọn

Dùng một phiên demo riêng, chọn Academic Data rồi file `data/demo/normal/academic.json` hoặc
CSV tương ứng. Kiểm tra số course/assignment; chỉ tạo task qua thao tác người dùng hiện có.
Import không restore task UUID, executions hoặc history từ student-workspace.json. Không chạy
reset/clear trên session presenter đang sử dụng để kiểm tra corpus.

## Câu hỏi thường gặp

- **Đã triển khai RAG chưa?** Chưa. Không embeddings, vector store, chatbot hoặc retrieval pipeline.
- **Tài liệu official có nghĩa còn hiệu lực?** Chỉ chứng minh nguồn công khai HaUI tại mốc thu thập;
  cần kiểm tra riêng hiệu lực/applicability của từng văn bản và bản mới nhất.
- **Đã có LMS thật chưa?** Chưa; import là input student-provided, scenario là hư cấu.
- **Dataset eval có thay đổi không?** Không. `evals/datasets/mvp-v1.json` và
  `llm-capabilities-v1.json` vẫn là evaluation assets riêng; corpus không thay holdout hay claim metrics.
- **Corpus tự làm demo phong phú hơn trên UI không?** Không. UI vẫn dùng seed hiện có. Corpus bổ sung
  artifact để hội đồng kiểm tra và chuẩn bị bước knowledge tiếp theo.

## Acceptance

File có metadata và checksum; fixture/JSON/CSV nhất quán với implementation; course mapping đúng;
source official và fictional tách biệt; regression kiểm tra lỗi; runbook hướng dẫn truthful claims.
Không có runtime loader mới hoặc thay đổi business semantics. Xem [data README](../../data/README.md).

## Verification record — 2026-10-05

- Offline corpus validation: PASS — 10 demo, 3 HaUI, 15 course documents.
- Corpus regressions: 13 passed, using disposable corpus copies only.
- Existing demo showcase, academic import, deterministic engine and import-boundary tests:
  1,168 passed. No live API reset or external provider call.
- Ruff lint/format for both new scripts and `git diff --check`: PASS.

These checks establish artifact integrity and contract compatibility for this run. They do not
establish document legal validity, redistribution rights, retrieval quality or student outcomes.

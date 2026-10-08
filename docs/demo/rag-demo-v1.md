# RAG v1 — canonical two-minute demo

## Preflight

```bash
apps/api/.venv/bin/python scripts/corpus_v1.py
apps/api/.venv/bin/python evals/rag_v1.py --mode offline
cd apps/api && .venv/bin/python -m pytest tests/integration/api/test_knowledge_query_api.py
```

Use the normal offline demo. No API key or network is required.

## Flow

1. Open `/knowledge` — “Tài liệu & hỏi đáp”.
2. Select **Môn học demo → Cơ sở dữ liệu**.
3. Ask: **“Database Mini Project cần nộp những gì?”**
4. Show the grounded answer and `Template · offline` marker.
5. Expand the source. Point out section `Database Mini Project`, local provenance and badge
   **“Tài liệu môn học demo”**.
6. Ask: **“Lịch thi đấu bóng đá World Cup trên sao Hỏa?”**
7. Show `CHƯA ĐỦ BẰNG CHỨNG`, the fixed Vietnamese abstention and no fabricated citation.
8. Optional: switch to **HaUI** and ask **“HaUI có các cấp trình độ đào tạo nào?”** Open the
   citation and show **“Nguồn công khai HaUI”** plus the public source URL.

## Narration

> Model không được trả lời từ trí nhớ riêng. Hệ thống retrieve tài liệu trước, chỉ cho phép trích
> dẫn nguồn đã retrieve. Nếu không có đủ bằng chứng, hệ thống từ chối trả lời.

The offline path is lexical retrieval plus a deterministic answer template. Do not call it semantic
vector search or LLM success. The HaUI corpus is a bounded public snapshot; do not claim complete or
current policy coverage. The course pack is fictional and visibly labelled as such.

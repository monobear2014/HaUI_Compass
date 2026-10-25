# Cải thiện truy xuất tài liệu — 25/10/2026

## Kết quả

Giữ lexical retrieval và cải thiện theo lỗi đo được, không thêm embedding/vector
database, không đổi model/prompt sinh đáp án hoặc tăng thời gian chờ AI.

| Chỉ số | Trước | Sau |
| --- | ---: | ---: |
| Bộ mới: Hit@1, 34 câu có nguồn | 61,76% (21/34) | 94,12% (32/34) |
| Bộ mới: Hit@3 | 76,47% (26/34) | 97,06% (33/34) |
| Bộ mới: Source recall@5 | 76,47% | 97,06% |
| Bộ mới: MRR | 0,6863 | 0,9559 |
| Bộ mới: câu không có nguồn trả rỗng | 75% (3/4) | 100% (4/4) |
| Bộ mới: ca đạt, kể cả negative | 29/38 | 37/38 |
| Bộ cũ: Hit@1/3/5, recall@5, 51 câu có nguồn | 100% | 100% |
| Bộ cũ: 12 câu thiếu nguồn trả rỗng | 75% | 75% |

Tách split mới: dev 14/18 → 18/18 ca đạt; test 15/20 → 19/20. Hit@3 riêng
test tăng 72,22% → 94,44% trên 18 câu có nguồn. Đây là regression được xem trong
quá trình phát triển, không phải blind holdout độc lập.

Không gộp hai bộ hoặc diễn giải thành độ chính xác câu trả lời AI. Lượt này chạy
**retrieval-only, không gọi model**, không đo chất lượng sinh đáp án/entailment.
Empty retrieval không đồng nghĩa chất lượng từ chối. Bộ cũ vẫn có ba câu truy
xuất nhiễu: `negative-005`, `ambiguous-001`, `ambiguous-002`; không che các ca đó.

## Chẩn đoán và thay đổi

1. **Tiếng Việt không dấu:** query ASCII trước đây không khớp nội dung có dấu và
   bị coi là tên kỹ thuật thiếu trong nguồn. Chuẩn hóa NFC/NFD và dấu tiếng Việt
   ở lớp tìm kiếm; có thưởng khớp nguyên dấu để phân hạng khi có nhiều biến thể.
   Không sửa văn bản lưu, offset, chunk ID hay citation.
2. **Mất mã ngắn:** tokenizer bỏ ký tự đơn và tách `a_{12}` khác `a_12`.
   Giữ nhãn hàng/mô hình A/B/C (kể cả viết thường trong ngữ cảnh rõ) và chuẩn hóa
   chỉ số LaTeX nguyên đơn. `a_12`, `a_21`, `a_1_2` không được coi là một mã.
   A/I trong ngữ pháp tiếng Anh không tự động thành nhãn bắt buộc.
3. **Bag-of-words xếp nhầm:** thêm điểm cho cặp từ đúng thứ tự; đoạn chứa đủ tên
   chủ đề/mã được hỏi đứng trước đoạn chỉ trùng từ chung. Giữ trọng số IDF, top-6,
   ngưỡng coverage 0,3 và cơ chế từ chối tên chủ đề không có trong nguồn.
4. **Câu hỏi công thức loãng:** bỏ một số từ định dạng câu hỏi (`bao nhiêu`,
   `bằng`, `ghi`, `công thức`) khỏi phần so khớp; không gắn định nghĩa toán học tự
   suy đoán vào công thức. Phát hiện anchor trước khi bỏ dấu để từ Việt có dấu
   không vô tình thành tên tiếng Anh bắt buộc. Năm/mã số dài chưa có trong nguồn
   không được lấy đoạn gần giống thay thế.
5. **Bảng dài mất tiêu đề:** khi các chunk liên tiếp cùng tài liệu/trang vẫn là
   bảng, dùng tiêu đề bảng gốc để tìm hàng ở chunk sau. Trả thêm **chunk gốc chứa
   tiêu đề** làm bằng chứng riêng, không ghép nội dung giả vào chunk hàng.
   Không truyền tiêu đề qua trang/tài liệu hoặc đoạn văn thường. Tổng bằng chứng
   vẫn tối đa 6. Áp dụng ngay cho chunk đã lưu, không cần ingest/migrate lại.

Các lần thử có regression được giữ ở `artifacts/evals/retrieval-improvement-v2/`;
bản chọn cuối giữ nguyên nhãn và bộ cũ. Không sửa nhãn sau khi thấy đáp án để tăng điểm.

## Dữ liệu và bằng chứng

- `evals/datasets/retrieval-vi-v2.json`: tập tổng hợp có nhãn, chưa được người chấm
  độc lập xác nhận. 38 câu gồm 20 câu QA OCR v1 giữ nguyên và 18 câu bổ sung.
- Phần OCR ghép **gold text** của 20 tài liệu thành một sách tổng hợp 20 trang để
  có cạnh tranh giữa nhiều nguồn. Không chạy OCR trong benchmark này; không được
  dùng số liệu này để tuyên bố chất lượng OCR hoặc kết quả end-to-end.
- Các fixture bổ sung có nhiều trang gần giống nhau: bảng mô hình A/B/C, cụm từ
  đảo thứ tự, Unicode có/không dấu và chỉ số ma trận khác nhau. Không nhúng ID nhãn
  vào văn bản tìm kiếm. Dev/test có chia câu hỏi nhưng dùng chung một phần corpus;
  không phải chia độc lập theo tài liệu và không phải đánh giá tổng quát hóa.
- `retrieval-vi-v2-before.json` và `retrieval-vi-v2-after.json` cạnh tài liệu này
  giữ mọi rank, ca lỗi, split, SHA-256 của nhãn/ranker/chunker và so sánh trước–sau.
  Git SHA được chụp khi chạy trên working tree; dùng hash ranker để nhận diện code.
- `retrieval-legacy-v2-before.json` / `retrieval-legacy-v2-after.json` giữ toàn bộ
  63 lượt của bộ cũ, kể cả negative, không chỉ chọn câu đạt.
- Kiểm thử bảng 361 hàng xác nhận lấy được hàng B ở cuối cùng tiêu đề gốc, nguyên
  offset/nội dung. Kiểm thử HTTP thật xác nhận chunk được ingest, truy xuất và trích
  dẫn qua session đã đăng nhập. Chỉ transport sinh đáp án được mock trong E2E.

## Ca chưa đạt và giới hạn

`VI-R-014`: hỏi “Ký hiệu tốc độ học trong công thức là gì?”, trong nguồn chỉ có
tiêu đề “Cập nhật gradient descent” và LaTeX chứa `\eta`, không có cụm “tốc độ học”.
Retriever trả rỗng. Đây là khoảng cách ngữ nghĩa thật của lexical; không thêm alias
`eta = tốc độ học` chỉ để vượt ca test, vì eta không luôn có nghĩa đó.

Bỏ dấu có thể gây đồng âm; điểm khớp nguyên dấu chỉ giảm rủi ro, không giải quyết
ngữ nghĩa. Nhận diện bảng hiện dành cho Markdown hình chữ nhật, không chứng nhận
bảng gộp ô phức tạp. Không thêm cơ chế thực thi chỉ dẫn trong tài liệu. Ranh giới
owner/document, SQL, kho riêng tư và kiểm tra citation không thay đổi.

Benchmark cũ: retrieval p50/p95 từ 0,121/0,409 ms lên khoảng 0,528/0,799 ms trên
một lượt tuần tự local. Đây là chi phí regex/phrase matching quan sát được, không
phải SLO production, load test hoặc bằng chứng nhân quả về latency toàn hệ thống.

## Chạy lại

```sh
node evals/rag/retrieval-vi-v2.cjs artifacts/evals/retrieval-improvement-v2/new-run.json docs/evaluation/retrieval-vi-v2-before.json
node --test apps/web/tests/document-ranking.test.mjs evals/rag/ranking.test.cjs
apps/api/.venv/bin/python evals/compass_rag_v1.py --mode retrieval --dataset evals/datasets/compass-rag-v1-pdf.json --output artifacts/evals/retrieval-improvement-v2/new-legacy-run
cd apps/web
npm run test:config
npm run typecheck
npm run lint
npm run build
PLAYWRIGHT_USE_BUILD=1 PLAYWRIGHT_WEB_PORT=3192 PLAYWRIGHT_API_PORT=8192 npx playwright test tests/document-retrieval.spec.ts tests/pdf-rag.spec.ts --project=desktop --trace=off --reporter=line
```

Đường dẫn output phải mới; không ghi đè báo cáo cũ. So sánh từ chối nếu hash dữ
liệu/chunker hoặc câu hỏi/nhãn khác nhau. Không đưa tài liệu riêng tư vào runner.

# OCR và đánh giá AI tiếng Việt — v1

## Phạm vi đã triển khai

- Nhận PNG, JPEG, WebP (tối đa 3 MiB/ảnh); kiểm tra nội dung ảnh thực, MIME,
  kích thước pixel, loại bỏ EXIF trước khi gửi sang nhà cung cấp OCR.
- PDF chữ dùng bộ trích xuất hiện có. PDF scan, trang có ảnh, bố cục bảng hoặc
  ký hiệu toán được rasterize trong subprocess có giới hạn tài nguyên rồi OCR.
  Tối đa **4 trang cần OCR/PDF**; tệp nhiều hơn cần tách nhỏ. PDF mã hóa không hỗ trợ.
- Kết quả gồm chữ tiếng Việt, bảng theo đúng hàng/cột và công thức LaTeX.
  Không tự điền ô trống, giải toán hay làm theo chỉ dẫn nằm trong ảnh.
  Vùng không đọc rõ được đánh dấu để người dùng đối chiếu.
- Bản gốc vẫn ở kho riêng tư. Nội dung OCR được chia chunk, lưu một lần theo chủ
  sở hữu và dùng cho hỏi đáp có trích dẫn. Mở lại tài liệu không gọi OCR trả phí.
- Trình đọc có bản gốc và phần nội dung trích xuất; bảng và LaTeX được render.
  HTML, ảnh từ xa và lệnh LaTeX cần quyền tin cậy không được thực thi.

Đây là OCR dùng mô hình thị giác qua API, không phải mô hình OCR tiếng Việt tự huấn
luyện hay dịch vụ chạy hoàn toàn offline. Chất lượng phụ thuộc ảnh và model. Chưa
nghiệm thu chữ viết tay, bảng gộp ô phức tạp, ma trận lớn hoặc ảnh chụp méo/mờ.

## Bộ dữ liệu có nhãn

Nguồn nhãn: `evals/datasets/ocr-ai-vi-v1.json`.

20 tài liệu tổng hợp tiếng Việt, mỗi tài liệu có đoạn chữ chuẩn, bảng chuẩn theo ô,
LaTeX chuẩn và câu hỏi/đáp án chấp nhận được. Các nhóm gồm văn bản có dấu, bảng,
công thức, nội dung hỗn hợp và chỉ dẫn độc hại trong ảnh. Có ca ô trống, dấu âm,
chỉ số dưới, giới hạn tổng/tích phân, đơn vị và số thập phân dấu phẩy.

10 tài liệu dev và 10 test. Mỗi tài liệu có hai biến thể PNG/PDF scan, tổng cộng
40 fixture; cả hai biến thể luôn cùng split. Không được tính chúng là 40 tài liệu
độc lập. Fixture sinh từ nhãn tĩnh bằng Pillow/Matplotlib, không lấy đầu ra model
làm đáp án. Manifest lưu SHA-256 của nhãn và từng fixture.

Nhãn **chưa được người đánh giá độc lập nghiệm thu**. Đây là tập regression nhỏ,
không phải benchmark đại diện cho toàn bộ tài liệu HaUI. Các ca test cũng đã được
chạy trong quá trình phát triển; không coi đó là blind holdout cho nghiên cứu.

Bộ `student-ai-vi-v1` hiện có được giữ nguyên: 38 ca retrieval/grounding/an toàn
và 6 ca reflection. Tổng hai bộ là 64 ca có nhãn, không đồng nghĩa 64 ca OCR.

## Chỉ số và tiêu chí

- CER/WER: khoảng cách chỉnh sửa trên phần chữ, chuẩn hóa Unicode NFC/khoảng trắng.
  Không gộp ô bảng hoặc LaTeX vào chỉ số chữ; hai phần đó chấm riêng.
- Bảng: exact match và số ô đúng tại đúng chỉ số hàng/cột; ô trống cũng được chấm.
- Công thức: exact match sau chuẩn hóa định dạng LaTeX hạn chế; không bỏ dấu âm,
  giá trị chỉ số hay giới hạn. Biến thể toán tương đương vẫn có thể trượt, cần review.
- QA: khớp ít nhất một đáp án chuẩn và qua validator trích dẫn vào bằng chứng OCR.
  Đây là kiểm tra thành phần OCR → grounded answer, **không đo retrieval recall**
  hay chứng minh mọi phát biểu trong câu trả lời đều được nguồn hỗ trợ.
- Một ca đạt khi CER ≤ 0,10, bảng và công thức khớp, cùng QA đạt nếu bật.
  Lỗi timeout/provider tính trượt; không retry để lựa kết quả đẹp.
- Báo cáo giữ từng ca trượt và worksheet review để người chấm ghi độ trung thực,
  căn chỉnh bảng, công thức và tính bám nguồn. Không tự gán điểm human review.

Chế độ offline chỉ kiểm tra nhãn, fixture và hợp đồng grader; tuyệt đối không dùng
pass offline để tuyên bố độ chính xác OCR/model.

## Chạy lại

### Kết quả live ngày 25/10/2026

Model `gpt-5-mini-2025-08-07`, không retry ca lỗi:

| Lượt | OCR | Bảng đúng ô | LaTeX khớp | Toàn ca gồm QA |
| --- | --- | --- | --- | --- |
| PNG dev, 10 tài liệu | 10/10 | 24/24 | 5/5 | 10/10 |
| PNG test, 10 tài liệu | 10/10 | 42/42 | 6/6 | 9/10 |
| PDF scan test, cùng 10 tài liệu | 10/10 | 42/42 | 6/6 | 10/10 |

PNG test có một lỗi vận hành ở giai đoạn hỏi đáp (`OCR-VI-010`); không được bỏ
khỏi mẫu số 10. Trường `qa_total` trong report lượt này là số câu QA có kết quả
(9), không phải tổng kỳ vọng; runner đã tách `qa_completed` và `qa_total` cho các
lượt tiếp theo. CER/WER trung bình trên chữ của hai lượt test là 0; dev CER
0,000746 và WER 0,003571. Khớp LaTeX không bảo đảm mọi công thức thực tế đều đọc đúng.

Các báo cáo JSON cạnh tài liệu này giữ kết quả từng ca. Lượt baseline ban đầu
đạt 15/20 PNG, mắc lỗi lặp công thức/tách vế, được giữ để đối chiếu, không xóa ca
trượt. Bản sửa dùng ảnh lossless và yêu cầu trích phương trình nguyên vẹn, không
lặp ở phần chữ. Hai biến thể test cùng tài liệu không phải 20 mẫu độc lập.

### Lệnh thực thi

Từ thư mục gốc (Python ≥ 3.12, đã cài `uv`):

```sh
cd apps/api
uv sync --extra dev
cd ../..
apps/api/.venv/bin/python evals/build_ocr_vi_fixtures.py
apps/api/.venv/bin/python evals/ocr_ai_vi_v1.py --mode offline --split all
```

Live dùng biến môi trường đã cấu hình, không ghi khóa vào lệnh hoặc báo cáo:

```sh
apps/api/.venv/bin/python evals/ocr_ai_vi_v1.py --mode live --split dev --with-qa
apps/api/.venv/bin/python evals/ocr_ai_vi_v1.py --mode live --split test --with-qa
apps/api/.venv/bin/python evals/ocr_ai_vi_v1.py --mode live --split test --input-format pdf --with-qa
```

Runner không tự đọc `.env`; cần nạp vào môi trường bằng cơ chế quản lý secret đang
dùng. Cần `OPENAI_API_KEY`, `HAUI_COMPASS_LLM_ENABLED=true`; model/base URL theo cấu
hình API hiện có. Live phát sinh phí nhà cung cấp. Exit code 1 nếu có ca trượt.
Kết quả theo timestamp ở `artifacts/evals/ocr-ai-vi-v1/`, không ghi đè lượt cũ.
Chỉ dùng fixture tổng hợp trong repo, không đưa tài liệu riêng tư vào report.

## Cấu hình ứng dụng

`HAUI_COMPASS_OCR_ENABLED=true`, `HAUI_COMPASS_OCR_TIMEOUT_SECONDS=40`.
`HAUI_COMPASS_OCR_MODEL` tùy chọn, mặc định dùng model LLM đã cấu hình và phải hỗ
trợ ảnh/structured outputs. Timeout toàn pipeline PDF là 45 giây. Khi không cấu
hình OCR, ảnh báo lỗi rõ ràng, không tạo nội dung giả; PDF chữ vẫn dùng bộ native.
Production build kiểm tra OCR đã bật cùng các khả năng bắt buộc hiện có.

Không ghi ảnh base64, nội dung tài liệu riêng tư, khóa hoặc URL có chữ ký vào log.
Khi lấy bằng chứng truy cập kho riêng tư, tuân thủ
`docs/deployment/signed-url-evidence.md`.

Kiểm tra phụ thuộc: đã ép toàn bộ cây KaTeX dùng bản đã vá `0.19.1`, không chỉ
package ở root. `npm audit` vẫn báo 8 cảnh báo từ cây phụ thuộc hiện có (7 high,
1 critical, gồm Next/sharp/Blob và dependency gián tiếp). Chưa nâng cấp hàng loạt
framework/storage trong hạng mục OCR này; đây là việc cần xử lý riêng, không phải
kết luận ứng dụng đã qua kiểm toán bảo mật.

API contract tham khảo: [OpenAI vision](https://developers.openai.com/api/docs/guides/images-vision)
và [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

# Data & Knowledge Corpus v1

**IMPLEMENTED — development/council-demo assets, version 1.0, collected 2026-10-05.**

Corpus gồm 45 artifact được đăng ký trong `manifest.json`: 10 artifact dữ liệu synthetic,
3 tài liệu công khai HaUI và 20 tài liệu trong bốn course pack hư cấu, cộng 12 học liệu gốc công khai (6 PDF, 6 Markdown). README là tài liệu hướng dẫn,
không phải nội dung knowledge được đăng ký. Mỗi artifact có ID riêng, kể cả JSON và CSV cùng tên.

```text
data/
  manifest.json
  demo/
    students.json
    normal/       academic.json, academic.csv, student-workspace.json
    crunch/       academic.json, academic.csv, student-workspace.json
    disrupted/    academic.json, academic.csv, student-workspace.json
  knowledge/
    haui/         ba bản chụp bài viết công khai dạng text
    courses/
      db/         syllabus, notes, assignments, rubric, faq
      ml/         syllabus, notes, assignments, rubric, faq
      en/         syllabus, notes, assignments, rubric, faq
      se/         syllabus, notes, assignments, rubric, faq (RAG demo)
```

## Kiểm tra offline

Từ repo root, sau khi cài backend cùng dev dependencies theo README chính:

```bash
apps/api/.venv/bin/python scripts/corpus_v1.py
apps/api/.venv/bin/python scripts/test_corpus_v1.py
```

Hoặc từ `apps/api`: `uv run --extra dev python ../../scripts/corpus_v1.py`.
Validation không gọi Internet, model hoặc API demo đang chạy. Exit code 0 là PASS; lỗi trả code 1.
Validator dùng schema/parser/application dataset hiện có để kiểm tra JSON/CSV, so với fixture
authored tại đồng hồ cố định, kiểm tra checksum/byte count, nguồn HaUI, liên kết sinh viên/course,
coverage manifest và đủ năm tài liệu cho mỗi course pack.

## Phân biệt nguồn

| Nhóm | Nội dung | Thẩm quyền |
| --- | --- | --- |
| demo | Ba student profile hư cấu và snapshot của ba scenario hiện có | Fictional demo only |
| haui | Text chuẩn hóa từ bài viết công khai trên domain HaUI | Public information snapshot có thời điểm |
| courses | Tài liệu tiếng Việt do dự án soạn cho Databases, Machine Learning, Communication và Software Engineering | Fictional demo only |

Knowledge subset được RAG v1 load qua manifest; dữ liệu `data/demo` không đi vào knowledge index.
Runtime scenario vẫn lấy từ `apps/api/src/haui_compass/infrastructure/demo/scenarios.py`.
Description/rubric/course notes không được truyền cho provider decomposition hoặc learning engine.
RAG v1 dùng lexical fallback, chưa có embeddings/vector DB/chat memory và không dùng nội dung corpus
để thay đổi engine hoặc business semantics.

## Metadata contract

`manifest.json` có `schema_version = haui-compass-corpus-v1`, version, ngày tạo,
`runtime_loading = false`, fixture source, evaluation references, course mapping và documents.

Mỗi document phải có:

- `id`, `title`, `path`: định danh ổn định và đường dẫn tương đối trong `data/`.
- `group`: `demo`, `haui`, `courses`; `language`: `vi` hoặc `en`.
- `source_kind`: `synthetic`, `official_public` hoặc `open_educational`; `publisher`, `source_url` (null cho synthetic).
- `collected_at`: mốc ghi nhận collection có timezone; `published_at`: ngày nguồn công bố hoặc null
  nếu không xác định được. Không thay ngày xuất bản bằng ngày thu thập.
- `version`, `sha256`, `bytes`: version corpus artifact và checksum của bytes UTF-8 đã lưu.
- `rights`: ghi nhận quyền nguồn; public access không đồng nghĩa open license.
- `authority`, `temporal_scope`: phạm vi tin cậy và thời gian áp dụng.
- `course_id`: `db`, `ml`, `en`, `se`, `ai`, `la`, `stats`, `automation` cho course pack, null cho nhóm khác.
- `notes`: extraction/lossiness, nguồn fixture hoặc giới hạn sử dụng.

Không có mốc hiệu lực được xác minh thì ghi rõ unknown trong temporal scope. Metadata không
xác nhận một bài viết là văn bản pháp quy hoặc đang còn hiệu lực. Checksum xác nhận file không đổi,
không xác nhận nội dung đúng hoặc được cấp phép.

## Bảo trì

1. Giữ nguyên bản v1 trước khi có quyết định cập nhật dataset. Không tự sync nguồn trong demo.
2. Với fixture, helper `--export-demo` chỉ in map path/content ra stdout để review; không ghi file
   và không reset container hiện tại. Thay đổi export không được dùng để lách kiểm tra fixture drift.
3. Với HaUI, tải URL đúng trong manifest bằng curl vào thư mục tạm, kiểm tra HTTP/content/title,
   dùng `--extract-haui FILE_TRAINING FILE_SUPPORT FILE_ADMISSIONS` để xuất text ra stdout.
   Review extraction thủ công, loại view counter; giữ nội dung nguồn, không thêm suy diễn vào text.
4. Thêm document/version mới khi nguồn đổi; cập nhật ngày thu thập, checksum, byte count và notes.
   Dùng `shasum -a 256 PATH` và `wc -c PATH` để tính metadata. Validator không tự reseal file.
5. Chạy validation và regressions trước khi đưa bản mới vào demo.

Không lưu dữ liệu thật, mật khẩu, token, điểm cá nhân hoặc bài nộp thật. Các student profile dùng
field allowlist, không email/số điện thoại/mã sinh viên thật. Quyền redistribution/model training
của nguồn HaUI chưa được xác lập; cần đánh giá quyền sử dụng trước khi phát hành rộng hoặc train.

Xem [demo data](demo/README.md), [nguồn HaUI](knowledge/haui/README.md),
[course packs](knowledge/courses/README.md) và [runbook](../docs/demo/data-knowledge-corpus-v1.md).

## Học liệu công khai bổ sung ngày 2026-10-19

12 bản gốc tiếng Anh được tải nguyên byte, có tác giả, URL gốc, giấy phép, ngày thu thập,
SHA-256 và dung lượng trong manifest. Không tự soạn bài giảng hoặc giả danh học liệu HaUI.
Ngày thu thập không phải ngày xuất bản: MIT AI thuộc Spring 2005, điều khiển Fall 2012,
xác suất Spring 2022; D2L ghim revision `23d7a5aecceee57d1292c56e90cce307f183bb0a`.
Tác giả D2L: Aston Zhang, Zachary C. Lipton, Mu Li, Alexander J. Smola.
MIT: Leslie Kaelbling, Tomás Lozano-Pérez (AI); Jeremy Orloff, Jennifer French Kamrin
(xác suất); Steven Hall (điều khiển).

| Môn | Bản gốc | Nguồn |
| --- | --- | --- |
| ai | mit-introduction.pdf | [MIT 6.034 — Introduction to Artificial Intelligence](https://ocw.mit.edu/courses/6-034-artificial-intelligence-spring-2005/resources/ch1_intro/) |
| ai | mit-search.pdf | [MIT 6.034 — Search, Part 1](https://ocw.mit.edu/courses/6-034-artificial-intelligence-spring-2005/resources/ch2_search1/) |
| stats | mit-probability.pdf | [MIT 18.05 — Probability: Terminology and Examples](https://ocw.mit.edu/courses/18-05-introduction-to-probability-and-statistics-spring-2022/resources/mit18_05_s22_class02-prep_pdf/) |
| stats | mit-bayes.pdf | [MIT 18.05 — Conditional Probability, Independence, Bayes](https://ocw.mit.edu/courses/18-05-introduction-to-probability-and-statistics-spring-2022/resources/mit18_05_s22_class03-prep_pdf/) |
| automation | mit-control-introduction.pdf | [MIT 16.06 — Why Automatic Control?](https://ocw.mit.edu/courses/16-06-principles-of-automatic-control-fall-2012/resources/mit16_06f12_lecture_1/) |
| automation | mit-pid.pdf | [MIT 16.06 — PID Control](https://ocw.mit.edu/courses/16-06-principles-of-automatic-control-fall-2012/resources/mit16_06f12_lecture_10/) |
| ai | d2l-introduction.md | [Dive into Deep Learning — Introduction](https://github.com/d2l-ai/d2l-en/blob/23d7a5aecceee57d1292c56e90cce307f183bb0a/chapter_introduction/index.md) |
| ml | d2l-linear-regression.md | [Dive into Deep Learning — Linear Regression](https://github.com/d2l-ai/d2l-en/blob/23d7a5aecceee57d1292c56e90cce307f183bb0a/chapter_linear-regression/linear-regression.md) |
| ml | d2l-overfitting.md | [Dive into Deep Learning — Generalization](https://github.com/d2l-ai/d2l-en/blob/23d7a5aecceee57d1292c56e90cce307f183bb0a/chapter_linear-regression/generalization.md) |
| la | d2l-linear-algebra.md | [Dive into Deep Learning — Linear Algebra](https://github.com/d2l-ai/d2l-en/blob/23d7a5aecceee57d1292c56e90cce307f183bb0a/chapter_preliminaries/linear-algebra.md) |
| la | d2l-matrix-calculus.md | [Dive into Deep Learning — Calculus](https://github.com/d2l-ai/d2l-en/blob/23d7a5aecceee57d1292c56e90cce307f183bb0a/chapter_preliminaries/calculus.md) |
| stats | d2l-probability.md | [Dive into Deep Learning — Probability and Statistics](https://github.com/d2l-ai/d2l-en/blob/23d7a5aecceee57d1292c56e90cce307f183bb0a/chapter_preliminaries/probability.md) |

MIT OCW: [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/),
[điều khoản nguồn](https://ocw.mit.edu/pages/privacy-and-terms-of-use/).
D2L: [CC BY-SA 4.0](https://github.com/d2l-ai/d2l-en/blob/23d7a5aecceee57d1292c56e90cce307f183bb0a/LICENSE).
Giữ ghi công và các điều kiện giấy phép; quyền tác giả thuộc chủ sở hữu nguồn.
Bản xem text PDF và chunk RAG là trích xuất phục vụ tìm kiếm; file PDF gốc không bị sửa.
Công thức/hình minh hoạ có thể không đầy đủ trong text; nút mở bản gốc giữ toàn bộ bố cục.
Markdown giữ nguyên code, LaTeX và directive D2L; chưa dựng lại site D2L tại đây.

Tại `/knowledge`, chọn môn rồi mở “Đọc học liệu công khai · PDF / Markdown”.
Hỏi đáp năm môn AI/ML/đại số/xác suất/điều khiển từ UI gửi `public_only: true`,
lọc trước khi xếp hạng, không trộn bộ mô phỏng. DB/SE cũ vẫn ghi rõ nhãn demo.
API mặc định giữ tương thích với caller cũ; gọi `public_only: true` để giới hạn nguồn.
Trích dẫn PDF gồm trang vật lý (bắt đầu từ 1); Markdown gồm heading/chunk và URL phiên bản.
Không có bằng chứng đủ liên quan thì từ chối trả lời. Mở rộng từ khoá Việt–Anh có giới hạn
cho tìm kiếm lexical; không phải dịch toàn văn hoặc vector retrieval.

```bash
python scripts/restore_public_courseware.py
# Chỉ tải file thiếu, từ URL đã ghim; kiểm hash trước khi ghi, không tự cập nhật manifest:
python scripts/restore_public_courseware.py --restore-missing
```

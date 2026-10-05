# Data & Knowledge Corpus v1

**IMPLEMENTED — development/council-demo assets, version 1.0, collected 2026-10-05.**

Corpus gồm 33 artifact được đăng ký trong `manifest.json`: 10 artifact dữ liệu synthetic,
3 tài liệu công khai HaUI và 20 tài liệu trong bốn course pack hư cấu. README là tài liệu hướng dẫn,
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
- `source_kind`: `synthetic` hoặc `official_public`; `publisher`, `source_url` (null cho synthetic).
- `collected_at`: mốc ghi nhận collection có timezone; `published_at`: ngày nguồn công bố hoặc null
  nếu không xác định được. Không thay ngày xuất bản bằng ngày thu thập.
- `version`, `sha256`, `bytes`: version corpus artifact và checksum của bytes UTF-8 đã lưu.
- `rights`: ghi nhận quyền nguồn; public access không đồng nghĩa open license.
- `authority`, `temporal_scope`: phạm vi tin cậy và thời gian áp dụng.
- `course_id`: `db`, `ml`, `en`, `se` cho course pack, null cho nhóm khác.
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

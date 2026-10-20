# Course packs & public courseware

Phần mô phỏng cũ: **HƯ CẤU / FICTIONAL.** Đây là tài liệu gốc do dự án soạn bằng tiếng Việt cho demo hội đồng,
không phải syllabus/rubric học phần chính thức HaUI. Mỗi pack có năm tài liệu:
`syllabus.md`, `notes.md`, `assignments.md`, `rubric.md`, `faq.md`.

| Course ID | Tên fixture / mã | Assignment trong demo |
| --- | --- | --- |
| db | Databases / FICTION-DB | Database Schema; Database Mini Project |
| ml | Machine Learning / FICTION-ML | Regression Lab; Evaluation Report |
| en | Communication / FICTION-EN | Project Presentation |
| se | Software Engineering / RAG-only | Software Project; Engineering Review |

`manifest.json.course_mapping` là crosswalk dùng chung cho ba course của scenario. External course ID
thực tế được prefix bằng `normal-`, `crunch-` hoặc `disrupted-`. Course ID ở đây chỉ dùng cho
corpus; không tạo thêm trường domain hoặc đổi provider identity. Pack `se` phục vụ riêng RAG v1,
không được đưa vào LMS scenario hoặc các learning engine.

Notes hỗ trợ hiểu khái niệm và tự kiểm tra. Brief mô tả đầu ra để sinh viên tự làm; rubric dùng
thang điểm hư cấu; FAQ giải thích hành vi hiện có. Pack không chứa đáp án hoàn chỉnh cho bài nộp.
Deadline/estimate lấy từ academic.json theo scenario, không ghi một deadline chung trái fixture.

RAG v1 load các file đã đăng ký qua manifest, chunk theo heading và retrieve với hard filter theo
course. Chúng không được đưa vào prompt decomposition, Risk/NBA/Planner/Replanner hoặc LMS fixture.


## Public originals (2026-10-19)

Ngoài các pack trên, kho có 12 file gốc từ MIT OpenCourseWare và Dive into Deep Learning,
ở các thư mục `ai`, `ml`, `la`, `stats`, `automation`. Các file `mit-*.pdf` và `d2l-*.md`
thuộc `open_educational`, không phải nội dung hư cấu. Xem [danh sách nguồn và giấy phép](../../README.md#học-liệu-công-khai-bổ-sung-ngày-2026-10-19).
Sáu PDF và sáu Markdown giữ nguyên byte nguồn; không đổi các deadline/assignment LMS mô phỏng.
UI năm môn mới lọc public-only; muốn kiểm thử fixture ML cũ qua API thì bỏ `public_only`.

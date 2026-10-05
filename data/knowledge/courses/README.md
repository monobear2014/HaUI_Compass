# Fictional course packs v1

**HƯ CẤU / FICTIONAL.** Đây là tài liệu gốc do dự án soạn bằng tiếng Việt cho demo hội đồng,
không phải syllabus/rubric học phần chính thức HaUI. Mỗi pack có năm tài liệu:
`syllabus.md`, `notes.md`, `assignments.md`, `rubric.md`, `faq.md`.

| Course ID | Tên fixture / mã | Assignment trong demo |
| --- | --- | --- |
| db | Databases / FICTION-DB | Database Schema; Database Mini Project |
| ml | Machine Learning / FICTION-ML | Regression Lab; Evaluation Report |
| en | Communication / FICTION-EN | Project Presentation |

`manifest.json.course_mapping` là crosswalk dùng chung cho cả ba scenario. External course ID
thực tế được prefix bằng `normal-`, `crunch-` hoặc `disrupted-`. Course ID ở đây chỉ dùng cho
corpus; không tạo thêm trường domain hoặc đổi provider identity.

Notes hỗ trợ hiểu khái niệm và tự kiểm tra. Brief mô tả đầu ra để sinh viên tự làm; rubric dùng
thang điểm hư cấu; FAQ giải thích hành vi hiện có. Pack không chứa đáp án hoàn chỉnh cho bài nộp.
Deadline/estimate lấy từ academic.json theo scenario, không ghi một deadline chung trái fixture.

Những file này có thể dùng làm nguồn knowledge trong milestone tương lai sau khi review quyền,
chunking/citation/evaluation. Hiện chúng chưa được load, retrieve hoặc đưa vào prompt.

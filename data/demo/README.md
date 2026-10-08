# Synthetic student/academic data v1

Tất cả student, course, assignment, task, submission và thời gian trong nhóm này đều hư cấu.
Ba profile trong `students.json` là mô tả để trình bày, không phải StudentState mới hoặc model
behavioral inference. Chúng không đi vào engine.

## Fixture gốc

Snapshot được export từ `scenario_data` tại `NOW = 2026-10-05T02:00:00+00:00`, tương ứng 09:00
Hà Nội. Mỗi scenario có 3 course, **5 assignment**, 5 submission status `not_submitted` và
4 task ban đầu. Database Mini Project là assignment thứ năm và chưa có task; một số runbook cũ
mô tả bốn assignment/task chỉ phản ánh bốn assignment có task.

| Scenario | Task effort | Tổng study windows | Mục đích |
| --- | --- | --- | --- |
| normal | 225 phút | 420 phút | Tuần khả thi, candidate confirmation |
| crunch | 375 phút | 180 phút | Capacity thiếu, evidence minh bạch |
| disrupted | 225 phút | 270 phút | Ghi execution, reflection, explicit remaining effort và replan |

Đây là facts từ fixture, không seed risk badge/NBA/output plan. Assignment estimate cho capstone
không tự trở thành Task effort. Risk/Planner vẫn chạy từ facts qua use case hiện có.

`student-workspace.json` giữ identity gốc `mock-lms/showcase-*`, UUID task và assignment, period,
window, estimate và status. Task UUID lặp giữa các scenario là thiết kế fixture được cô lập theo
student/container; không gộp chúng thành một workspace. File này là snapshot tham khảo,
**không phải payload import được hỗ trợ**. Không chứa execution/reflection giả đã xác nhận.

## JSON/CSV import

`academic.json` theo `haui-compass-academic-import-v1`. `academic.csv` dùng đúng header canonical.
Hai representation có cùng nội dung academic; namespace lần lượt là `json` và `csv`.
Student ID trong import là `pilot-student` để tương thích frontend hiện tại. Validator kiểm tra
qua cả HTTP DTO và application dataset để phát hiện duplicate/orphan/timestamp/duration errors.

Import chỉ tạo academic records. Task không được tạo tự động; cần thao tác Create study task
hoặc confirmation flow hiện có. Import file không clone seeded scenario hoặc revision history.
Không thay đổi task estimate bằng actual execution time.

Có thể chọn file ở Academic Data hoặc gửi qua route hiện có theo
[academic import contract](../../docs/pilot/academic-import-v1.md). Cùng source/student, import
khác dataset có thể conflict; không xóa nguồn có task phụ thuộc để ép thay thế. Dùng phiên demo
riêng cho phần import. Không reset live demo đang dùng để kiểm tra corpus.

# Hợp đồng dữ liệu tối thiểu — pilot HaUI Compass

**Trạng thái:** đề xuất ánh xạ vào boundary đã IMPLEMENTED; nguồn HaUI và quyền
truy cập chưa xác nhận. Không yêu cầu HaUI đổi schema hoặc domain model của mình.
Xem [đề nghị truy cập](haui-integration-access-request.md).

## Contract hiện có

Nguồn chuẩn là [application/ports/lms.py](../../apps/api/src/haui_compass/application/ports/lms.py).
`LMSProvider` chỉ đọc dữ liệu theo sinh viên, không nhận credential trong method:

| Method                                                  | Kết quả                           |
| ------------------------------------------------------- | --------------------------------- |
| `get_courses(student)`                                  | `tuple[LMSCourseRecord, ...]`     |
| `get_assignments(student, *, courses=None)`             | `tuple[LMSAssignmentRecord, ...]` |
| `get_submission_statuses(student, *, assignments=None)` | `tuple[LMSSubmissionRecord, ...]` |

`student` là `ExternalRef(provider, id)` đã được ràng buộc với danh tính được cấp
quyền; không dùng ID sinh viên do client tự khai để thay thế kiểm tra ủy quyền.
Filter `None` nghĩa là tất cả trong phạm vi sinh viên; filter rỗng nghĩa là không
có mục nào. Student/course/assignment không biết trong phạm vi đó trả
`LMSNotFoundError`, không giả thành kết quả rỗng; adapter cần ánh xạ lỗi auth/outage
an toàn riêng. Kết quả là tuple bất biến, thứ tự xác định, ID có namespace provider.

Luồng dự kiến cho một adapter được phê duyệt:

```text
Nguồn HaUI được xác nhận → adapter tương lai (auth + chuẩn hóa payload)
                            ├→ LMSCourseRecord ──────→ mapper → Course
                            ├→ LMSAssignmentRecord ─→ mapper → Assignment
                            └→ LMSSubmissionRecord ─→ boundary (chưa vào domain)
                                                        ↓
                                              HaUI Compass application
```

Payload vendor, cookie, token và tên trường riêng dừng ở adapter; không đi vào
domain. Provider abstraction và mapper đã có; adapter HaUI chưa được triển khai.

## Ánh xạ theo trường

| Dữ liệu HaUI đề nghị                 | Yêu cầu nguồn                                  | Boundary hiện tại                      | Quy tắc                                                |
| ------------------------------------ | ---------------------------------------------- | -------------------------------------- | ------------------------------------------------------ |
| ID sinh viên hoặc subject được duyệt | Ngữ cảnh truy cập bắt buộc; ưu tiên giả danh   | `student: ExternalRef`                 | ID ổn định và ràng buộc quyền; không cần hồ sơ cá nhân |
| ID học phần/lớp học phần             | Bắt buộc                                       | `LMSCourseRecord.ref`                  | Chuỗi không rỗng; xác nhận loại thực thể và phạm vi ID |
| Tên học phần                         | Bắt buộc                                       | `LMSCourseRecord.name`                 | Chuỗi không rỗng                                       |
| Mã học phần                          | Tùy chọn                                       | `LMSCourseRecord.code`                 | Không có → `None`; code chưa map vào domain `Course`   |
| ID bài tập                           | Bắt buộc                                       | `LMSAssignmentRecord.ref`              | Chuỗi ổn định, không rỗng                              |
| ID học phần của bài tập              | Bắt buộc                                       | `LMSAssignmentRecord.course_ref`       | Tham chiếu đúng học phần, cùng namespace với bài tập   |
| Tiêu đề bài tập                      | Bắt buộc                                       | `LMSAssignmentRecord.title`            | Chuỗi không rỗng                                       |
| Hạn nộp có hiệu lực với sinh viên    | Bắt buộc cung cấp hoặc xác nhận không có hạn   | `LMSAssignmentRecord.deadline`         | Timestamp có múi giờ → UTC; không có hạn → `None`      |
| ID bài tập của trạng thái nộp        | Bắt buộc                                       | `LMSSubmissionRecord.assignment_ref`   | Tham chiếu đúng bài tập của chính sinh viên            |
| Trạng thái nộp                       | Bắt buộc có dữ liệu và semantics được xác nhận | `LMSSubmissionRecord.status`           | Ánh xạ theo bảng dưới; không đủ bằng chứng → `UNKNOWN` |
| Thời điểm nộp                        | Tùy chọn                                       | `LMSSubmissionRecord.submitted_at`     | Có múi giờ → UTC; không có → `None`                    |
| Ước lượng thời gian làm bài          | Không yêu cầu từ HaUI                          | `LMSAssignmentRecord.estimated_effort` | Adapter thật trả `None`; không suy từ tín chỉ/điểm     |

HaUI cung cấp ID gốc; namespace provider do Compass chọn theo nguồn được duyệt.
Không mặc định ID nguồn bằng ID domain. [Mapper hiện tại](../../apps/api/src/haui_compass/application/lms_mapping.py)
suy ID domain xác định từ `ExternalRef`; không ghép ID bằng tên học phần.
Nếu nhiều hệ thống cùng tham gia, cần liên kết có thẩm quyền; contract hiện yêu
cầu bài tập và học phần của nó có cùng namespace.

## Trạng thái nộp và thời gian

| Giá trị boundary                  | Bằng chứng nguồn cần có                                                                         |
| --------------------------------- | ----------------------------------------------------------------------------------------------- |
| `NOT_SUBMITTED` (`not_submitted`) | Nguồn xác nhận chưa nộp; `submitted_at` phải là `None`                                          |
| `SUBMITTED` (`submitted`)         | Nguồn xác nhận đã nộp và không muộn; thời điểm nộp có thể thiếu                                 |
| `LATE` (`late`)                   | Nguồn xác nhận đã nộp muộn, hoặc quy tắc được duyệt đối chiếu thời điểm nộp với hạn có hiệu lực |
| `UNKNOWN` (`unknown`)             | Nguồn không đủ thông tin hoặc trạng thái chưa ánh xạ được                                       |

Không coi thiếu bản ghi là chưa nộp. Quá hạn nhưng chưa nộp không phải `LATE`.
Cần HaUI xác nhận bản nháp, nộp lại, gia hạn theo sinh viên/nhóm, timestamp lần
nộp nào và phân biệt due date với thời điểm đóng nộp. Không đoán timezone khi
nguồn thiếu offset; phải thống nhất timezone chính thức trước khi chuẩn hóa.

## Giới hạn hiện tại

- Mapper bỏ bài tập không có hạn với `NO_DEADLINE`; không tự đặt hạn. Contract
  nhận được `None` không có nghĩa là planner hiện lên lịch được bài đó.
- Submission record tồn tại ở boundary; chưa có domain submission entity và
  chưa dùng trạng thái nộp để tự thay đổi task/progress trong planner.
- Timetable/enrollment record và `fetched_at`/freshness field chưa có trong port.
  Timetable là trao đổi tùy chọn, không gán thành bài tập. Metadata nguồn/độ mới
  là yêu cầu thiết kế cho pilot tương lai, không phải trường đã IMPLEMENTED.
- Auth/authorization production và importer chưa triển khai. Student-scoped
  signature của port không tự đảm bảo quyền truy cập dữ liệu thật.

## Fallback có thể ánh xạ — chưa triển khai importer

| Định dạng đề xuất | Điều kiện phù hợp                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CSV               | Các bảng course/assignment/submission có ID liên kết và phạm vi sinh viên rõ; ID đọc dưới dạng chuỗi; timestamp có offset hoặc timezone chính thức           |
| JSON export       | Có các trường tương đương bảng ánh xạ; namespace và quan hệ ID được xác nhận                                                                                 |
| ICS               | Chỉ ánh xạ hạn bài tập khi nguồn xác nhận UID, liên kết course và semantics thời điểm tương ứng hạn nộp; `DTSTART`/`DTEND` của buổi học không tự là deadline |

ICS thường không đủ cho trạng thái nộp, enrollment hoặc toàn bộ contract; cần
nguồn bổ sung được duyệt, hoặc ghi rõ coverage thiếu. Lịch học thuần túy chưa map
vào port hiện tại. Nhập tay cũng cần ID ổn định trong namespace manual và thể hiện
trạng thái chưa biết khi không có bằng chứng chính thức. Giữ nguồn/độ mới và xác
nhận của người dùng ở lớp quản lý import tương lai, không tự thêm vào record.

Mọi fallback phải được gọi đúng là **nhập tay/import được phê duyệt**, không phải
tích hợp LMS trực tiếp. Không yêu cầu điểm, file bài nộp, dữ liệu nhạy cảm, dữ liệu
người khác hoặc mật khẩu; không thực hiện thao tác ghi lên HaUI.

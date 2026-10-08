# Đề nghị quyền truy cập tích hợp cho pilot HaUI Compass

**Ngày:** 29/09/2026. **Trạng thái:** đề xuất để trao đổi; chưa được HaUI phê duyệt.

## Mục đích và hiện trạng

HaUI Compass là dự án hỗ trợ sinh viên lập kế hoạch học tập, theo dõi thực hiện,
phản tư và chọn hành động học tập tiếp theo với lý do rõ ràng. Pilot đề xuất đánh
giá khả năng sử dụng dữ liệu học phần, bài tập, hạn nộp và trạng thái nộp bài của
chính sinh viên để cung cấp ngữ cảnh học tập chính xác.

**IMPLEMENTED:** nền tảng ứng dụng/domain, vòng lặp học tập xác định, giao diện
phát triển và abstraction `LMSProvider` với dữ liệu mock hư cấu.
**PLANNED:** tích hợp HaUI thực tế, xác thực/ủy quyền production và vận hành pilot
với dữ liệu thật. Đây là đề nghị tiếp cận kỹ thuật, không phải tuyên bố hệ thống
đã được triển khai tại HaUI hay được phép xử lý dữ liệu sinh viên.

## Quyền truy cập và dữ liệu tối thiểu đề nghị

Đề nghị cơ chế **chỉ đọc, theo từng sinh viên tham gia**, giới hạn trong các học
phần được duyệt. Không yêu cầu quyền quản trị hoặc quyền ghi vào hệ thống học vụ.

| Nhóm                                | Trường tối thiểu                                                                              |
| ----------------------------------- | --------------------------------------------------------------------------------------------- |
| Học phần/lớp học phần của sinh viên | ID ngoài hệ thống ổn định, tên; mã học phần nếu có                                            |
| Bài tập                             | ID ngoài hệ thống ổn định, ID học phần liên quan, tiêu đề, hạn nộp hoặc xác nhận không có hạn |
| Trạng thái nộp bài của sinh viên    | ID bài tập, trạng thái nộp; thời điểm nộp nếu có                                              |
| Tùy chọn, nếu có nguồn chính thức   | Thời khóa biểu/lịch học; thảo luận riêng vì contract hiện chưa có timetable record            |

Cần một tham chiếu sinh viên ổn định hoặc ngữ cảnh danh tính được HaUI phê duyệt
để giới hạn dữ liệu và liên kết các bản ghi; ưu tiên định danh giả danh nếu đủ.
Không cần họ tên, ngày sinh, thông tin liên hệ hoặc hồ sơ sinh viên đầy đủ.
Chi tiết trường và quy tắc ánh xạ: [data contract](haui-integration-data-contract.md).

**Không đề nghị:** điểm số (trừ khi được phê duyệt riêng), dữ liệu tài chính,
kỷ luật, sức khỏe, thông tin sinh viên khác, thông tin chỉ dành cho cán bộ,
mật khẩu sinh viên, nội dung/file bài nộp hoặc toàn bộ tài liệu khóa học.
Không yêu cầu HaUI cung cấp ước lượng thời gian làm bài (`estimated_effort`).

## Phương thức tích hợp ưu tiên

Đề nghị HaUI cho biết phương thức có thể cấp, theo thứ tự ưu tiên:

1. API chính thức có tài liệu.
2. API nội bộ được nhà trường phê duyệt cho pilot.
3. Export/feed chính thức với trường và chu kỳ cập nhật được thống nhất.
4. Tích hợp theo chuẩn nếu có; cần xác nhận chuẩn đó cung cấp đủ dữ liệu cần thiết.
5. Bộ dữ liệu/export pilot được nhà trường phê duyệt.

Đề nghị tài liệu phiên bản, schema hoặc mẫu đã khử định danh, phân trang, lỗi,
giới hạn gọi và cách nhận biết dữ liệu thay đổi. Không đề xuất scraping hoặc
tự động hóa đăng nhập trình duyệt trong gói này.

## Câu hỏi về xác thực và vận hành API

- Cơ chế xác thực được cho phép là gì? Có SSO, OIDC, SAML hoặc OAuth không;
  danh tính đăng nhập có cung cấp quyền đọc API hay cần cấp quyền riêng?
- Có service account được giới hạn phạm vi hoặc quyền truy cập do sinh viên
  ủy quyền không? Cách cấp, thu hồi và kiểm tra phạm vi sinh viên như thế nào?
- Token có thời hạn, cơ chế gia hạn/thu hồi, audience và scopes/permissions nào?
- Có sandbox, tài khoản test và dữ liệu tổng hợp không? Đề nghị không gửi mật
  khẩu/token qua tài liệu hoặc email; thống nhất kênh cấp quyền riêng.
- API/export chạy ở môi trường nào, base URL nào, phiên bản nào? Có yêu cầu VPN,
  mạng nội bộ hoặc hosting trong hạ tầng HaUI không?
- Rate limits, chu kỳ đồng bộ cho phép, cửa sổ bảo trì và đầu mối hỗ trợ là gì?
- Quy trình cấp quyền production, người phê duyệt và tiêu chí nghiệm thu là gì?

## Câu hỏi về hệ thống có thẩm quyền

[Discovery](../research/haui-lms-discovery.md) nhận diện nhiều bề mặt hệ thống;
tài liệu công khai chưa xác nhận nguồn dữ liệu và quyền tích hợp hiện hành.
Không mặc định Moodle, One HaUI, MyHaUI, TMS hoặc EOP là nguồn có thẩm quyền.

| Dữ liệu        | Đề nghị HaUI xác nhận                                                                                          |
| -------------- | -------------------------------------------------------------------------------------------------------------- |
| Học phần       | Hệ thống nào quản lý đăng ký/lớp học phần của sinh viên? Quan hệ với khóa học trực tuyến và ID liên kết là gì? |
| Bài tập        | Hệ thống nào sở hữu hoạt động của từng học phần, kể cả học phần trên nền tảng chuyên biệt?                     |
| Hạn nộp        | Nguồn nào cung cấp hạn thực tế của sinh viên, gồm gia hạn, múi giờ, không có hạn và thời điểm đóng nộp?        |
| Trạng thái nộp | Nguồn nào có thẩm quyền? Phân biệt bản nháp, đã nộp, nộp muộn, nộp lại và trạng thái không xác định thế nào?   |
| Thời khóa biểu | Nguồn nào có thẩm quyền, có export/feed chính thức và nằm trong phạm vi pilot không?                           |

Nếu dữ liệu nằm ở nhiều hệ thống, cần quy tắc liên kết ID được xác nhận; không
ghép học phần chỉ bằng tên. Lịch học/lịch thi không thay thế hạn nộp bài tập.

## Nguyên tắc bảo mật và riêng tư đề xuất

Các nguyên tắc sau là **điều kiện cho pilot, PLANNED đối với tích hợp thật**;
chưa phải bằng chứng rằng kiểm soát production đã được triển khai đầy đủ:

- Least privilege; quyền đọc theo sinh viên và học phần được duyệt; không truy
  cập chéo sinh viên, không mạo danh cán bộ.
- Không thu thập/lưu mật khẩu sinh viên; không lưu raw session cookies.
  Không log credential, token, cookie hoặc payload cá nhân đầy đủ.
- Kênh truyền được bảo vệ; chỉ người phụ trách được duyệt truy cập dữ liệu và
  bí mật dịch vụ nếu phương thức được cấp cần chúng.
- Chuẩn hóa timestamp có múi giờ sang UTC; không tự đoán múi giờ hoặc hạn nộp.
- Truy cập có thể kiểm toán bằng mục đích, phạm vi, thời điểm và kết quả, với
  metadata tối thiểu; quy định retention cho audit và dữ liệu phải được duyệt.
- Lưu dữ liệu tối thiểu trong thời gian đã thống nhất; xác định cách xóa khi hết
  pilot, sinh viên rút tham gia hoặc quyền bị thu hồi.
- Không chia sẻ dữ liệu với bên thứ ba không liên quan. Không gửi dữ liệu học vụ
  thật tới nhà cung cấp AI trong pilot này; việc mở rộng cần phê duyệt riêng.
- Thống nhất cơ sở xử lý/đồng ý tham gia, vị trí hosting, trách nhiệm xử lý sự cố
  và yêu cầu riêng tư trước khi đưa dữ liệu thật vào hệ thống.

Không tuyên bố sở hữu chứng nhận bảo mật hoặc tuân thủ chưa được xác minh.

## Phạm vi pilot đề xuất

Số sinh viên tình nguyện/test, số học phần và ngày bắt đầu/kết thúc sẽ do hai bên
thống nhất; chưa ấn định số lượng hoặc thời hạn. Bắt đầu bằng dữ liệu tổng hợp
hoặc sandbox; chỉ dùng dữ liệu thật sau phê duyệt và kiểm tra kiểm soát truy cập.

Pilot chỉ đọc, có thời hạn cố định sau khi thống nhất: không sửa điểm, không
nộp/sửa/xóa bài, không có thao tác ghi LMS và không có quyền cán bộ. Mục tiêu
nghiệm thu là dữ liệu đúng sinh viên, ID liên kết đúng, hạn nộp chính xác và
trạng thái nộp ánh xạ có bằng chứng; không tuyên bố cải thiện kết quả học tập.

## Boundary kỹ thuật và điều kiện bắt đầu

HaUI Compass đã có provider abstraction; **HaUI không cần áp dụng domain model
nội bộ của chúng tôi**. Adapter tương lai sẽ ánh xạ payload được cấp sang
`LMSCourseRecord`, `LMSAssignmentRecord`, `LMSSubmissionRecord`; payload riêng
nhà cung cấp và xác thực nằm ngoài domain. Contract hiện không có timetable,
freshness field hoặc domain submission entity; không hứa đồng bộ timetable hay
sử dụng trạng thái nộp để lập kế hoạch trong phiên bản hiện tại.

Readiness hiện tại: **NEEDS INSTITUTIONAL ACCESS**. Các câu trả lời bắt buộc và
quy tắc phân loại nằm tại [readiness checklist](haui-integration-readiness-checklist.md).
Gói này không triển khai adapter, auth hoặc importer.

Nếu không được cấp tích hợp trực tiếp, đề nghị pilot nhập tay/import được nhà
trường phê duyệt: CSV/JSON có thể ánh xạ vào contract; ICS chỉ dùng khi nội dung
và liên kết ID phù hợp, không mặc định lịch học là bài tập. Đây là fallback đề
xuất, chưa có importer; phải hiển thị nguồn và độ mới dữ liệu, không gọi là
tích hợp LMS trực tiếp.

## Tài liệu kèm theo

- [Data contract](haui-integration-data-contract.md).
- [Readiness checklist](haui-integration-readiness-checklist.md).
- [Thư đề nghị](haui-integration-request-message.md).
- [Product scope](../PROJECT.md) và [discovery](../research/haui-lms-discovery.md).

# Checklist sẵn sàng tích hợp HaUI Compass

**Ngày đánh giá:** 29/09/2026. **Hiện trạng:** **NEEDS INSTITUTIONAL ACCESS**.
Nguồn: [discovery](../research/haui-lms-discovery.md), [đề nghị truy cập](haui-integration-access-request.md)
và [data contract](haui-integration-data-contract.md). Chưa có bằng chứng cấp quyền
hoặc tài liệu tích hợp chính thức; các mục dưới đây chưa được xác nhận.

## Câu trả lời bắt buộc trước GO cho pilot tích hợp trực tiếp

Chỉ đánh dấu khi có tài liệu/xác nhận của người có thẩm quyền; ghi owner, ngày
xác nhận, bằng chứng và giới hạn áp dụng. Bằng chứng cần được khử định danh,
không chứa token, mật khẩu, raw cookie hoặc dữ liệu sinh viên thật.

- [ ] Xác nhận hệ thống có thẩm quyền cho học phần, bài tập, hạn nộp và trạng thái
      nộp; timetable xác nhận riêng nếu nằm trong scope. Không mặc định nguồn là
      Moodle, One HaUI, MyHaUI, TMS hoặc EOP.
- [ ] Xác nhận phương thức tích hợp được duyệt và tài liệu API/feed/export,
      phiên bản, môi trường và đầu mối kỹ thuật.
- [ ] Ghi rõ cơ chế auth: SSO/OIDC/SAML/OAuth nếu có, service account hoặc student
      delegated access, scopes, token lifetime/gia hạn/thu hồi và giới hạn sinh viên.
- [ ] Có sandbox/test access được duyệt và dữ liệu tổng hợp/đã khử định danh;
      thống nhất kênh cấp quyền, không lưu credential trong checklist.
- [ ] Có endpoint/export học phần của sinh viên, ID ổn định và tên; biết quan hệ
      giữa đăng ký học phần và khóa học trực tuyến.
- [ ] Có dữ liệu bài tập/hạn nộp, liên kết course ID, timezone và quy tắc gia hạn,
      không có hạn, thời điểm đóng nộp được xác nhận.
- [ ] Có dữ liệu trạng thái nộp theo sinh viên; xác nhận bản nháp/nộp lại/nộp muộn,
      `UNKNOWN`, timestamp nếu có và ánh xạ vào bốn giá trị boundary.
- [ ] Có quy tắc liên kết ID giữa các hệ thống nếu cần; không ghép bằng tên.
- [ ] Làm rõ phê duyệt riêng tư, căn cứ xử lý/đồng ý tham gia, vị trí hosting,
      retention/xóa, rút tham gia, kiểm toán, sự cố và phạm vi bên nhận dữ liệu.
- [ ] Làm rõ rate limits, lịch đồng bộ, phân trang, lỗi, thay đổi phiên bản và
      đầu mối hỗ trợ khi API/export gián đoạn.
- [ ] Xác định người có thẩm quyền cho phép pilot và quy trình production riêng;
      số người/học phần, thời gian cố định và tiêu chí dừng/nghiệm thu được thống nhất.
- [ ] Xác định kế hoạch và trách nhiệm bảo đảm least privilege, student-scoped
      access, không lưu password/raw cookie, không log credential, không ghi LMS;
      thực thi/kiểm tra các kiểm soát bắt buộc trước khi dùng dữ liệu thật.
- [ ] Xác nhận coverage/giới hạn: submission chưa vào domain, timetable chưa có
      record, auth production chưa triển khai; không hứa chức năng chưa có.

## Phiếu phản hồi và bằng chứng

| Hạng mục                        | Người/đơn vị xác nhận | Bằng chứng/phiên bản | Ngày và điều kiện |
| ------------------------------- | --------------------- | -------------------- | ----------------- |
| Nguồn dữ liệu và liên kết ID    | Chưa xác nhận         | Chưa có              | Chưa xác nhận     |
| Phương thức, auth và sandbox    | Chưa xác nhận         | Chưa có              | Chưa xác nhận     |
| Coverage và semantics trường    | Chưa xác nhận         | Chưa có              | Chưa xác nhận     |
| Quyền riêng tư và kiểm soát     | Chưa xác nhận         | Chưa có              | Chưa xác nhận     |
| Owner/phạm vi pilot và vận hành | Chưa xác nhận         | Chưa có              | Chưa xác nhận     |

## Quy tắc phân loại readiness

| Phân loại                             | Điều kiện và ý nghĩa                                                                                                                                                                |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **NEEDS INSTITUTIONAL ACCESS**        | Một hoặc nhiều câu trả lời bắt buộc chưa có; chưa GO cho adapter hoặc dữ liệu thật. Đây là trạng thái hiện tại                                                                      |
| **READY FOR AUTHORIZED PILOT DESIGN** | Tất cả mục bắt buộc đã được xác nhận, phương thức trực tiếp được duyệt và coverage đủ; có thể GO cho thiết kế/triển khai pilot trong phạm vi đã cấp, chưa có nghĩa production-ready |
| **APPROVED IMPORT PILOT ONLY**        | Không có quyền tích hợp trực tiếp nhưng nhập tay/export được duyệt, coverage và giới hạn rõ, quyền riêng tư/phạm vi được thống nhất; không đánh dấu API hoặc auth đã sẵn sàng       |
| **NO-GO FOR REQUESTED INTEGRATION**   | HaUI từ chối quyền, không có phương thức được phép hoặc điều kiện bắt buộc không thể đáp ứng; thiếu câu trả lời đơn thuần vẫn là NEEDS INSTITUTIONAL ACCESS                         |

READY cho thiết kế không tự cho phép dùng dữ liệu thật trước khi kiểm soát được
thực thi/kiểm tra. Timetable tùy chọn không chặn pilot tối thiểu; không đủ một
trong ba nhóm course/assignment/submission phải ghi coverage thiếu và xin duyệt
scope thu hẹp riêng. Fallback importer vẫn PLANNED; không bắt đầu implementation
trong branch tài liệu này.

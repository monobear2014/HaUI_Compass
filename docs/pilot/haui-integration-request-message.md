# Dự thảo thư đề nghị trao đổi tích hợp HaUI Compass

**Trạng thái:** bản nháp để gửi; chưa gửi. Người nhận/đơn vị cụ thể chưa xác nhận.

**Tiêu đề:** Đề nghị trao đổi quyền truy cập dữ liệu học tập cho pilot HaUI Compass

Kính gửi Quý đơn vị phụ trách hệ thống học vụ/đào tạo trực tuyến của HaUI,

Chúng tôi đang phát triển HaUI Compass, dự án hỗ trợ sinh viên lập kế hoạch và
theo dõi học tập. Chúng tôi mong được trao đổi về một pilot nghiên cứu nhỏ,
chỉ đọc dữ liệu của sinh viên tình nguyện hoặc tài khoản test, trong số học phần
và thời hạn do hai bên thống nhất.

Dữ liệu tối thiểu cần có gồm học phần (ID, tên, mã nếu có), bài tập (ID, học phần,
tiêu đề, hạn nộp) và trạng thái nộp bài của chính sinh viên (thời điểm nộp nếu có).
Chúng tôi không yêu cầu điểm số, hồ sơ tài chính/kỷ luật/sức khỏe, dữ liệu sinh
viên khác, thông tin chỉ dành cho cán bộ hoặc mật khẩu sinh viên; không ghi vào
LMS và không tự động nộp bài.

Kính mong Quý đơn vị hướng dẫn đầu mối có thẩm quyền, nguồn dữ liệu chính thức
cho từng nhóm thông tin và cơ chế truy cập được phép. Chúng tôi ưu tiên API có
tài liệu, tiếp theo là API nội bộ được duyệt, export/feed chính thức, tích hợp
theo chuẩn nếu phù hợp, hoặc bộ dữ liệu pilot được nhà trường phê duyệt.

Chúng tôi cũng mong được làm rõ cơ chế xác thực/phân quyền, khả năng cấp sandbox
hoặc tài khoản test, rate limits và yêu cầu về riêng tư, hosting, lưu giữ/xóa dữ
liệu và quy trình phê duyệt. Xin không gửi mật khẩu hoặc token qua email; kênh
cấp quyền sẽ được thống nhất riêng nếu pilot được chấp thuận.

Gói tài liệu kèm theo gồm đề nghị kỹ thuật, hợp đồng dữ liệu tối thiểu và checklist
sẵn sàng tích hợp. Dự án hiện có abstraction provider và dữ liệu mock; tích hợp
HaUI thực tế cùng xác thực production vẫn đang ở giai đoạn đề xuất.

Rất mong nhận được hướng dẫn hoặc một buổi trao đổi kỹ thuật phù hợp.
Trân trọng cảm ơn Quý đơn vị.

## Tài liệu đính kèm khi gửi

- [Đề nghị kỹ thuật](haui-integration-access-request.md).
- [Hợp đồng dữ liệu](haui-integration-data-contract.md).
- [Checklist sẵn sàng tích hợp](haui-integration-readiness-checklist.md).

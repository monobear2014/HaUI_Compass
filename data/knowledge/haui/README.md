# Official public HaUI source collection v1

Ba bản chụp text từ website HaUI công khai, truy cập ngày 05/10/2026. Không đăng nhập LMS.

| File | Nguồn | Phạm vi |
| --- | --- | --- |
| training-model.txt | [Mô hình đào tạo](https://www.haui.edu.vn/vn/html/mo-hinh-va-chuong-trinh-dao-tao) | Overview không có ngày xuất bản xác định |
| student-financial-support.txt | [Hỗ trợ tài chính và học bổng](https://www.haui.edu.vn/vn/hoc-bong-hoc-phi/ho-tro-tai-chinh-va-hoc-bong-danh-cho-sinh-vien-haui/68191) | Bài công bố 11/09/2026 08:54, giờ Hà Nội |
| admissions-2025.txt | [Tuyển sinh đại học năm 2025](https://www.haui.edu.vn/vn/page/ts/detail/66572) | Tài liệu lịch sử năm 2025, không hướng dẫn tuyển sinh hiện hành |

## Cách thu thập

HTTP GET công khai bằng curl; nội dung HTML được kiểm tra có title/article đúng. Helper stdlib
HTMLParser lấy container bài viết, chuẩn hóa khoảng trắng và bỏ menu, script, CSS. Ảnh/diagram,
liên kết attachment và layout bảng không được bảo toàn; bảng được flatten thành dòng text.
View counter của bài hỗ trợ tài chính được bỏ bởi helper và kiểm tra thủ công. Checksum trong manifest áp dụng cho
text đã lưu, không phải raw HTML. Không có OCR hoặc PDF extraction trong milestone này.

Không thêm nội dung dự án tự viết vào các text nguồn. Những giải thích của dự án nằm trong README,
notes của manifest hoặc course pack hư cấu. Các title, thời gian và text không chứng minh toàn bộ
văn bản được trích dẫn/attachment đã được thu thập.

## Giới hạn thẩm quyền và quyền sử dụng

Public information snapshot khác với tài liệu pháp quy đã xác minh hiệu lực. Với câu hỏi về
học bổng/tuyển sinh cụ thể, cần kiểm tra bản nguồn và văn bản áp dụng mới nhất; corpus không
đưa kết luận quyền lợi của một sinh viên. Ngày xuất bản chưa biết được ghi null.

Footer website giữ bản quyền HaUI. Chưa xác lập open license hoặc quyền redistribution/training.
Collection này phục vụ review nguồn và demo có citation; không tuyên bố đã được HaUI cấp phép,
không đại diện bộ quy chế đầy đủ, và không kết nối dữ liệu LMS thật. Corpus v1 chưa có quy chế
đào tạo theo tín chỉ hoặc sổ tay sinh viên đã được kiểm chứng; chỉ bổ sung khi thu được nguồn phù hợp.

# Cơ sở dữ liệu (Databases) — notes

> HƯ CẤU / FICTIONAL — HaUI Compass course pack v1. Do dự án biên soạn cho demo hội đồng; không phải tài liệu học phần HaUI chính thức.

Mã liên kết: `db`. Tên fixture: Databases. Ngôn ngữ: tiếng Việt. Phiên bản: 1.0. Ngày soạn: 2026-10-05.

## Thực thể và khóa
Thực thể mô tả đối tượng cần quản lý. Khóa chính nhận diện duy nhất một bản ghi. Khóa ngoại biểu diễn tham chiếu tới khóa của bảng khác. Hãy phân biệt thuộc tính mô tả với thuộc tính nhận diện: tên người thường không đủ làm khóa.

## Ví dụ luyện tập độc lập
Một cửa hàng hư cấu quản lý Product(product_id, label) và StockMovement(movement_id, product_id, quantity). Khóa ngoại product_id giúp kiểm tra mỗi lần nhập/xuất kho tham chiếu sản phẩm tồn tại. Đây là ví dụ luyện tập, không phải lời giải Database Schema.

## Phụ thuộc hàm và chuẩn hóa
Nếu A xác định duy nhất B, viết A → B. Khi một thông tin xuất hiện ở nhiều dòng, hãy kiểm tra nguy cơ cập nhật không đồng nhất. Trước khi tách bảng, ghi rõ khóa ứng viên và phụ thuộc dựa trên yêu cầu; không suy đoán chỉ từ vài dòng mẫu.

## Tự kiểm tra
- Một quan hệ có bắt buộc hay tùy chọn?
- Hai giá trị trùng tên có thể chỉ hai thực thể khác nhau không?
- Xóa một bản ghi cha sẽ ảnh hưởng những dữ liệu nào?
- Bạn có ví dụ dữ liệu khiến giả định khóa bị sai không?

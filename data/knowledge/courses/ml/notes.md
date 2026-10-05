# Học máy (Machine Learning) — notes

> HƯ CẤU / FICTIONAL — HaUI Compass course pack v1. Do dự án biên soạn cho demo hội đồng; không phải tài liệu học phần HaUI chính thức.

Mã liên kết: `ml`. Tên fixture: Machine Learning. Ngôn ngữ: tiếng Việt. Phiên bản: 1.0. Ngày soạn: 2026-10-05.

## Baseline và cách chia dữ liệu
Baseline là mốc so sánh đơn giản. Với bài toán hồi quy, có thể so sánh với dự đoán giá trị trung bình từ train. Fit bộ biến đổi trên train rồi áp dụng cho validation/test để tránh đưa thông tin tương lai vào huấn luyện.

## Ví dụ tự luyện
Tạo dữ liệu y = 2x + nhiễu bằng seed cố định; chia tập trước khi chuẩn hóa. Đổi độ nhiễu và quan sát MAE, RMSE. Đây là thí nghiệm tự luyện không có dữ liệu thật và không phải đáp án notebook để nộp.

## Metric
MAE là trung bình độ lớn sai số; RMSE tăng ảnh hưởng của sai số lớn do bình phương. Khi so sánh hai model, dùng cùng cách chia tập và cùng đơn vị mục tiêu. Một metric tốt trên một tập nhỏ không chứng minh chất lượng tổng quát.

## Leakage
Những ví dụ cần kiểm tra: chuẩn hóa bằng toàn bộ dữ liệu; dùng biến được biết sau thời điểm dự đoán; chọn model dựa trên test lặp đi lặp lại. Ghi lại cách bạn ngăn từng dạng leakage.

## Phản tư
Tách thời gian đã làm khỏi phần việc còn lại. 90 phút recorded không có nghĩa đã hoàn tất 90 phút effort theo estimate.

# Nền tảng Machine Learning

Tài liệu synthetic phục vụ đánh giá Compass Assistant, không phải học liệu chính thức của HaUI.

## Softmax
[SOURCE:softmax]
Softmax biến một vector logits thành phân phối xác suất trên các lớp. Hàm lấy exponential của từng logit để mọi giá trị dương, rồi chia cho tổng các exponential để các xác suất có tổng bằng một. Khi tính toán nên trừ logit lớn nhất trước khi lấy exponential để tránh overflow mà không làm đổi kết quả. Softmax thường dùng cho bài toán phân loại đa lớp loại trừ lẫn nhau. Một hạn chế là chênh lệch logit lớn có thể tạo dự đoán quá tự tin; softmax không tự bảo đảm mô hình chính xác hơn.

## Cross Entropy
[SOURCE:cross-entropy]
Cross entropy cho phân loại đa lớp là negative log probability mà mô hình gán cho nhãn đúng. Loss tăng mạnh khi mô hình tự tin vào lớp sai. Khi huấn luyện, cross entropy thường đi cùng đầu ra softmax, nhưng loss và hàm chuẩn hóa vẫn là hai khái niệm khác nhau. Giá trị loss trung bình được tính trên batch; tài liệu này không tuyên bố một ngưỡng loss chung cho mọi bộ dữ liệu.

## Gradient Descent
[SOURCE:gradient-descent]
Gradient descent cập nhật tham số theo hướng ngược gradient của hàm loss. Learning rate điều khiển độ lớn mỗi bước: quá lớn có thể làm loss dao động hoặc phân kỳ, quá nhỏ làm hội tụ chậm. Mini-batch gradient descent ước lượng gradient từ một nhóm mẫu và thường cân bằng chi phí tính toán với độ nhiễu của cập nhật.

## Chia dữ liệu và đánh giá
[SOURCE:evaluation-split]
Tập training dùng để học tham số. Tập validation dùng để chọn siêu tham số và so sánh phiên bản mô hình. Tập test chỉ dùng cho đánh giá cuối cùng và không được dùng để chọn siêu tham số. Với dữ liệu mất cân bằng, cần xem precision, recall và F1 thay vì chỉ accuracy. Data leakage xảy ra nếu thông tin từ validation hoặc test đi vào quá trình huấn luyện.

## Regularization
[SOURCE:regularization]
L2 regularization cộng một penalty theo bình phương trọng số vào objective để hạn chế trọng số quá lớn. Dropout ngẫu nhiên tắt một phần activation trong lúc training. Early stopping dừng khi metric validation không còn cải thiện. Ba kỹ thuật này có thể giảm overfitting nhưng không thay thế việc kiểm tra chất lượng và cách chia dữ liệu.

## K-means
[SOURCE:kmeans]
K-means là thuật toán phân cụm không giám sát. Thuật toán lặp giữa gán mỗi điểm vào centroid gần nhất và cập nhật centroid bằng trung bình các điểm được gán. Cần chọn trước số cụm k; kết quả nhạy với khởi tạo và thang đo đặc trưng. K-means không tạo nhãn lớp có ý nghĩa nếu không có diễn giải từ người phân tích.

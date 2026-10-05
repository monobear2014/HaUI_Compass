# Kỹ nghệ phần mềm (Software Engineering) — faq

> HƯ CẤU / FICTIONAL — HaUI Compass course pack v1.1. Do dự án biên soạn cho demo RAG; không phải tài liệu học phần HaUI chính thức.

Mã liên kết RAG: `se`. Ngôn ngữ: tiếng Việt. Phiên bản: 1.0. Ngày soạn: 2026-10-05.

## Project yêu cầu testing những gì?
Cần unit test cho domain/service, integration test cho API–repository boundary và regression test cho lỗi đã sửa. End-to-end test chỉ cần cho user flow quan trọng. Test không được phụ thuộc external API trong đường chạy bình thường.

## Có bắt buộc coverage 100% không?
Không. Course pack không đặt ngưỡng coverage. Ưu tiên test các invariant, boundary và failure path quan trọng thay vì tối đa hóa một con số.

## Rubric đánh giá implementation ra sao?
Implementation chiếm 35 điểm hư cấu: đúng behavior, dễ đọc, xử lý lỗi rõ và dependency hợp lý. Điểm này không được hệ thống tự tính từ số commit hoặc số dòng code.

## Đây có phải yêu cầu môn học HaUI thật không?
Không. Toàn bộ pack là tài liệu demo hư cấu và chỉ dùng để kiểm thử retrieval/citation.

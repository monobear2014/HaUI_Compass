# Hướng dẫn đồ án phần mềm synthetic

## Sản phẩm bàn giao
[SOURCE:deliverables]
Nhóm nộp repository mã nguồn, README hướng dẫn cài đặt, báo cáo kiến trúc, kế hoạch kiểm thử và video demo tối đa tám phút. README phải ghi phiên bản runtime và các biến môi trường cần thiết nhưng không chứa secret thật. Báo cáo cần liên kết quyết định thiết kế với yêu cầu. Mỗi thành viên ghi phần đóng góp trong phụ lục.

## Kiến trúc
[SOURCE:architecture]
Đồ án dùng kiến trúc modular monolith: domain rules không phụ thuộc framework, application service điều phối use case, adapter chịu trách nhiệm HTTP và persistence. Dependency đi từ adapter vào interface do application sở hữu. Nhóm phải vẽ sơ đồ container và giải thích ít nhất hai trade-off, nhưng không bắt buộc chuyển sang microservice.

## Kiểm thử
[SOURCE:testing]
Test plan phải có unit test cho domain rule, integration test cho database adapter và API contract test cho endpoint chính. Mỗi lỗi production giả lập cần một regression test. Báo cáo coverage theo branch cho module domain, nhưng coverage cao không thay thế assertion có ý nghĩa. E2E test chỉ cần cho ba luồng người dùng quan trọng nhất.

## Git và review
[SOURCE:git-review]
Mỗi thay đổi đi qua pull request nhỏ, có mô tả mục tiêu, cách kiểm tra và rủi ro. Ít nhất một thành viên khác review trước khi merge. Không commit credential, file môi trường hoặc dữ liệu cá nhân. Commit message dùng động từ ở thể mệnh lệnh; lịch sử có thể squash khi merge.

## Triển khai
[SOURCE:deployment]
Nhóm chuẩn bị một môi trường staging tách khỏi dữ liệu thật. Pipeline chạy lint, typecheck, unit test rồi integration test trước bước deploy. Release phải có health check và phương án rollback về artifact trước đó. Fixture không yêu cầu Kubernetes, không quy định nhà cung cấp cloud và không cho phép ghi secret vào image.

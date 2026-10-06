# Demo Showcase v0.2

## Mục tiêu

Demo trả lời câu hỏi: **“Sinh viên nên làm gì tiếp theo, tại sao, và hệ thống thích nghi thế nào khi kế hoạch thay đổi?”**

Toàn bộ tên sinh viên, môn học, assignment, task, deadline và lịch học trong demo là dữ liệu hư cấu. Demo chạy in-memory với đồng hồ cố định tại 09:00 ngày 05/10/2026 theo giờ Hà Nội, vì vậy cùng một scenario luôn tạo cùng kết quả. Đây không phải dữ liệu HaUI, tích hợp HaUI LMS hoặc hệ thống production.

## Chuẩn bị

Yêu cầu Python 3.12+, `uv`, Node.js 20.9+ và npm.

Terminal 1:

```bash
cd apps/api
uv run --extra dev uvicorn haui_compass.api.demo:app --host 127.0.0.1 --port 8001
```

Terminal 2:

```bash
cd apps/web
npm ci
COMPASS_API_URL=http://127.0.0.1:8001 npm run dev
```

Mở `http://127.0.0.1:3000`. Scenario mặc định là **Deadline Crunch**. Bộ chọn scenario nằm ở đầu mỗi trang. “Reset this scenario” thay toàn bộ container in-memory bằng fixture mới; task status, executions, reflections, plan revisions và dữ liệu import phát sinh trong session cũ không được giữ lại.

## Ba scenario

### Normal Week

- Ba môn, bốn assignment và bốn task.
- Tổng effort 225 phút; ba study window có tổng capacity 420 phút.
- Risk Engine trả LOW cho tất cả assignment.
- Weekly Planner xếp đủ toàn bộ effort và không tạo `UnplannedTask`.

Thông điệp: khi workload vừa capacity, Compass vẫn cho một next action rõ ràng và tạo kế hoạch khả thi mà không phóng đại rủi ro.

### Deadline Crunch

- Ba môn, bốn assignment gần deadline; tổng effort 375 phút và capacity 180 phút.
- Database Schema có HIGH risk: 150 phút remaining effort và 60 phút capacity trước deadline.
- Regression Lab có MEDIUM risk: 105 phút effort và 120 phút capacity, tương ứng slack ratio khoảng 14%, dưới heuristic 25% hiện hành.
- Weekly Planner để lại 195 phút `UnplannedTask` với reason `insufficient_capacity`.

Thông điệp: Risk Engine, NBA ranking và planner cùng dùng các facts rõ ràng, nhưng giải quyết ba việc khác nhau: đánh giá constraint, chọn một hành động tiếp theo và xếp effort vào lịch.

### Disrupted Week

- Bắt đầu với một plan hợp lệ, không có work chưa xếp.
- Presenter hoàn thành Database Schema, ghi 90 phút cho Regression Lab vốn được estimate 60 phút, phản ánh workload quá nặng và topic khó.
- Presenter cập nhật remaining effort của Regression Lab lên 90 phút, bỏ một study window rồi replan.
- Revision 2 giữ các block vẫn hợp lệ, loại work đã hoàn thành, đổi các block chịu tác động và lưu typed reasons cùng parent revision.

Thông điệp: Compass giữ lại phần kế hoạch còn đúng, thay đổi phần không còn đúng và lưu dấu vết `Plan → Execute → Reflect → Replan`.

## Kịch bản trình bày

AI Task Decomposition v0.3 extends this showcase with a separate
[assignment-to-confirmed-task flow](ai-task-decomposition-v0.3.md).

### Flow 1 — Deadline pressure

1. Chọn **Deadline Crunch**.
2. Mở **Academic Data**. Chỉ ra ba course, bốn assignment/task hư cấu, deadline và estimate.
3. Nhấn **Today → Risk & next action**.
4. Trên **Today**, chỉ ra task “Draft the relational schema”, badge HIGH RISK và explanation tiếng Việt.
5. Mở **Decision evidence**. Chỉ ra `deciding_dimension = risk`, reason code `effort_exceeds_capacity`, 150 phút effort và 60 phút capacity.
6. Trong **Assignment risk**, mở Regression Lab để chỉ ra MEDIUM risk và `low_slack`.
7. Mở **Weekly Plan**. Chỉ ra các block đã xếp và phần “Needs attention”: tổng cộng 195 phút không vừa capacity.

Expected output: Database Schema là NBA; risk levels gồm HIGH, MEDIUM và LOW; planner tạo `UnplannedTask` mà không giấu effort.

### Flow 2 — Plan disruption

1. Chọn **Disrupted Week**. Việc chọn scenario tự reset state.
2. Trên **Today**, record task đầu tiên với outcome **Completed**. Với đồng hồ demo cố định, có thể dùng 07:00–07:25 giờ Hà Nội.
3. Task Regression Lab trở thành next action. Record **Partial**, dùng 07:30–09:00 để tạo actual duration 90 phút.
4. Mở **Reflect**. Chọn Regression Lab, workload **Too heavy**, nhập topic `Regression assumptions`, rồi nhấn **Review reflection**.
5. Chỉ ra factual candidate “estimated 60 min → recorded 90 min” và hai candidate tự báo cáo. Chọn các signal cần lưu rồi nhấn **Save confirmed reflection**.
6. Mở **Weekly Plan** → **Adjust & replan**. Đổi remaining effort của Regression Lab từ 60 thành 90 phút, bỏ study window thứ hai, rồi nhấn **Create revised plan**.
7. Trong **Plan updated**, chỉ ra before/after và các reason `Task completed`, `Remaining effort changed`, `Study window changed`. Mở **Blocks kept unchanged** để cho thấy block hợp lệ được giữ nguyên.
8. Mở **History**. Revision 1 và Revision 2 cùng tồn tại; mở từng revision để xem snapshot.
9. Nhấn **Reset this scenario**. History trở lại một initial revision và task status trở lại ban đầu.

Expected output: revision 2 trỏ về revision 1; task đã hoàn thành không còn future block; ít nhất một block được giữ nguyên và ít nhất một block thay đổi; confirmed reflection xuất hiện trong audit dưới dạng informational context.

## Ranh giới deterministic và AI

Các quyết định sau hoàn toàn deterministic và có test tái lập: risk level/reason codes/evidence; NBA task, ordering và deciding dimension; deadline/capacity math; task transition; weekly scheduling; `UnplannedTask`; adaptive replanning; plan revision history.

Explanation nhận đúng output đã tính gồm recommendation, assignment, risk signal, reason codes, evidence và deciding dimension. Provider chỉ trả text, không có trường để đổi task, level hoặc ranking. Bản demo hiện dùng `TemplateExplanationProvider`, chạy offline và hiển thị nhãn **Template · offline**. Port hỗ trợ provider AI tùy chọn; timeout, exception, output rỗng/sai kiểu hoặc dài quá giới hạn đều fallback về template. Chưa có vendor SDK hoặc API key nào được cấu hình trong milestone này.

`Decision evidence` luôn được hiển thị tách khỏi explanation để hội đồng kiểm tra quyết định gốc.

## Limitations phải nói rõ

- Không có authentication, authorization, multi-user concurrency hoặc durability qua process restart.
- Không kết nối HaUI LMS và không dùng dữ liệu sinh viên thật.
- Không có predictive ML và không claim predictive accuracy.
- Heuristic risk 25% là quy tắc MVP minh bạch, chưa được validate bằng student outcomes.
- Assignment capacity trong fixture là tổng study-window overlap trước deadline; nó là input risk riêng cho từng assignment, không phải capacity được đặt trước độc quyền cho assignment đó.
- Remaining effort nhập khi replan chỉ ảnh hưởng revised plan. Risk/NBA hiện vẫn đọc task estimate đã persist và assignment capacity của scenario.
- Execution duration không tự động trừ remaining effort.
- Confirmed reflection là informational trong Replanner v0; nó được audit nhưng chưa tự thay đổi placement.
- Đây là demo showcase, không phải bằng chứng về production readiness hoặc kết quả học tập đã được kiểm chứng.

## Kiểm tra nhanh trước buổi demo

```bash
cd apps/api
uv run --extra dev pytest
uv run --extra dev ruff check .
uv run --extra dev ruff format --check .
uv run --extra dev mypy

cd ../web
npm run typecheck
npm run lint
npm run build
npm test
```

Các test PostgreSQL cần `HAUI_COMPASS_TEST_DATABASE_URL`; nếu không cấu hình, pytest skip nhóm đó. Showcase không cần PostgreSQL hoặc internet.

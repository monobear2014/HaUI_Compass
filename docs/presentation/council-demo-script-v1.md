# Council Demo Script v1

**Thời lượng mục tiêu:** khoảng 5 phút.

**Dữ liệu:** hoàn toàn hư cấu, in-memory, có thể reset.

**Thông điệp xuyên suốt:** quyết định quan trọng là deterministic; AI chỉ hỗ trợ ngôn ngữ và đề xuất có kiểm soát.

## Mở đầu, 20 giây

“Em xin trình bày HaUI Compass, một technical demo hỗ trợ sinh viên trả lời câu hỏi: *việc cụ thể nào nên làm tiếp theo, và vì sao?* Toàn bộ dữ liệu hôm nay là hư cấu. Đây chưa phải là hệ thống triển khai cho sinh viên thật, chưa kết nối LMS HaUI và chưa có kết quả đo lường học tập.”

“Luồng em sẽ cho thấy là: lập kế hoạch, thực hiện, phản ánh, điều chỉnh, rồi lập kế hoạch lại.”

## Màn hình Academic Data, 60 giây

“Em chọn **Normal Week**. Ở đây có các môn học, assignment, deadline và task hư cấu. Em mở **Database Mini Project**. Assignment này chưa có task được xác nhận.”

“Khi nhấn **Suggest tasks with AI**, hệ thống trả về các candidate task có estimate và rationale. Badge hiện tại là **[chọn đúng badge đang thấy]**.”

Nếu badge là **AI · online**, nói:

“Ở lần chạy này, model online tạo đề xuất ngôn ngữ. Output đã đi qua strict schema và validation của application. Tuy vậy, model chưa tạo task và không quyết định ưu tiên.”

Nếu badge là **Template · offline**, nói:

“Ở lần chạy này, demo đang dùng deterministic offline fallback. Luồng đầy đủ vẫn hoạt động khi không có Internet hoặc không có credential. Đây là một chế độ vận hành được thiết kế sẵn.”

“Em sửa candidate đầu tiên thành `Clarify rubric and project scope`, đổi estimate thành 40 phút, rồi bỏ chọn candidate thứ hai. Sau đó em nhấn **Add selected tasks**.”

“Điểm quan trọng ở đây: AI chỉ đề xuất. Chỉ các candidate mà sinh viên chọn, có thể chỉnh sửa, rồi xác nhận mới đi qua task-creation boundary và trở thành dữ kiện bền vững. Candidate chưa xác nhận không thể ảnh hưởng Risk, Next Best Action hay Weekly Plan.”

## Màn hình Today và Decision Evidence, 70 giây

“Tiếp theo em chọn **Deadline Crunch** và mở **Today → Risk & next action**. Hệ thống đề xuất `Draft the relational schema` và hiển thị **HIGH RISK**.”

“Phần explanation là ngôn ngữ hiển thị. Để kiểm tra quyết định gốc, em mở **Decision evidence**.”

“Ở đây, deciding dimension là `risk`; reason code là `effort_exceeds_capacity`; assignment còn 150 phút effort trong khi capacity trước deadline là 60 phút. Đây là các fact deterministic.”

“Em cũng có thể mở Regression Lab: nó là MEDIUM risk với `low_slack`. Rule low slack hiện dùng ngưỡng 25%. Đây là heuristic minh bạch của MVP, chưa phải mô hình dự báo đã được hiệu chỉnh bằng dữ liệu sinh viên.”

“Như vậy, AI không tính risk, không chọn task, và không đổi deadline hay capacity. Nếu model được dùng, nó chỉ diễn đạt lại kết quả đã tính.”

## Màn hình Weekly Plan, 35 giây

“Em mở **Weekly Plan**. Planner xếp effort vào các study window đã được khai báo rõ ràng. Với scenario này, phần **Needs attention** vẫn hiển thị 195 phút unplanned work.”

“Hệ thống không tự tạo thêm thời gian và cũng không che phần workload không vừa capacity. Planner là deterministic, deadline-first, và giữ unplanned work dưới dạng dữ liệu có kiểu.”

## Màn hình Disrupted Week, execution, reflection và replan, 100 giây

“Bây giờ em chuyển sang **Disrupted Week**. Em record task đầu tiên là completed. Sau đó em record Regression Lab là partial trong 90 phút, trong khi estimate ban đầu là 60 phút.”

“Em vào **Reflect**, chọn Regression Lab, chọn workload là **Too heavy**, nhập `Regression assumptions`, rồi review. Hệ thống hiển thị candidate factual: estimate 60 phút, recorded 90 phút. Các signal vẫn chưa là durable fact cho đến khi em chọn và bấm **Save confirmed reflection**.”

“Sau đó em vào **Weekly Plan**, chọn **Adjust & replan**, nhập explicit remaining effort cho Regression Lab là 90 phút và bỏ một study window. Em nhấn **Create revised plan**.”

“Kết quả hiển thị before/after và các typed reasons: task completed, remaining effort changed, và study window changed. Khi mở **Blocks kept unchanged**, ta thấy hệ thống giữ những block còn hợp lệ thay vì xếp lại toàn bộ tuần.”

“Em mở **History** để thấy revision 1 và revision 2 cùng tồn tại. Plan history là append-only. Cuối cùng, em reset scenario. Trạng thái quay về fixture ban đầu, gồm task, execution, reflection, plan revision và cả candidate session.”

## Kết, 25 giây

“Tóm lại, HaUI Compass hiện chứng minh một foundation có thể kiểm tra: **Plan → Execute → Reflect → Adapt → Plan Again**. Deterministic engines sở hữu risk, ưu tiên và scheduling. AI chỉ hỗ trợ ngôn ngữ trong boundary có validation, fallback và xác nhận của người dùng.”

“Bước tiếp theo không phải là tuyên bố hiệu quả học tập. Bước tiếp theo là approval, privacy và data governance, LMS integration hẹp, rồi pilot với người dùng thật để đánh giá heuristic và trải nghiệm.”

## Presenter recovery lines

- Nếu model online lỗi: “Provider online không khả dụng ở lần chạy này. Đây là lý do demo có deterministic fallback; luồng xác nhận, risk, plan và replan vẫn hoạt động như vừa thấy.”
- Nếu được hỏi tại sao không dùng ChatGPT tự lập kế hoạch: “Vì deadline, capacity, ordering và state change là các quyết định cần tái lập và audit. Model chỉ nên hỗ trợ phần ngôn ngữ khi chưa có evidence cho phép giao quyền quyết định.”
- Nếu được hỏi về dữ liệu thật: “Demo hiện không dùng dữ liệu sinh viên thật. Đó là giới hạn được công bố rõ và là điều kiện trước pilot, không phải điều em muốn che giấu.”

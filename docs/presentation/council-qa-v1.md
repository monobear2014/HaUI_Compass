# Council Q&A Bank v1

**Use:** trả lời ngắn trước, chỉ đi sâu khi hội đồng hỏi tiếp. Mỗi câu trả lời phải giữ các nhãn
implemented, demo-only và planned rõ ràng.

## Product

### 1. Vì sao sinh viên cần hệ thống này khi đã có LMS?

- **Trả lời ngắn:** LMS quản lý thông tin học vụ; HaUI Compass demo cách chuyển các fact đó thành một next action và plan có thể giải thích.
- **Giải thích sâu:** current loop dùng task, deadline, explicit capacity, execution và plan history. LMS vẫn là nguồn authoritative cho course, assignment, deadline và submission status.
- **Không nên claim:** “LMS hiện tại không hữu ích” hoặc “Compass đã tích hợp HaUI LMS thật.”

### 2. Khác gì với một todo app?

- **Trả lời ngắn:** Todo app thường lưu danh sách; Compass tạo risk evidence, có thứ tự deterministic, lập lịch theo study window và lưu revision khi replan.
- **Giải thích sâu:** NBA không dùng điểm mơ hồ. Nó so sánh risk, deadline, trạng thái in-progress và stable identifiers. Planner không giấu effort không vừa capacity.
- **Không nên claim:** “Todo app không thể làm những việc này.”

### 3. Điểm khác biệt cốt lõi của demo là gì?

- **Trả lời ngắn:** Mỗi recommendation có evidence; AI không được giao quyền thay đổi fact hoặc quyết định.
- **Giải thích sâu:** UI tách Decision Evidence khỏi generated explanation. Candidate task chỉ vào deterministic loop sau khi sinh viên chỉnh và confirm.
- **Không nên claim:** “AI luôn đúng.”

### 4. Sản phẩm hiện phục vụ ai?

- **Trả lời ngắn:** Demo hiện minh họa student workflow với dữ liệu hư cấu.
- **Giải thích sâu:** Lecturer dashboard, real-user workflow, authentication và authorization đều là planned scope.
- **Không nên claim:** “Đã triển khai cho sinh viên hoặc giảng viên HaUI.”

## AI

### 5. AI nằm ở đâu trong HaUI Compass?

- **Trả lời ngắn:** AI có hai capability hiện tại: đề xuất candidate task và diễn đạt recommendation đã được tính.
- **Giải thích sâu:** Cả hai đi qua application-owned ports; OpenAI Responses adapter là infrastructure tùy chọn. Offline template là required fallback.
- **Không nên claim:** “Toàn bộ hệ thống là một LLM agent.”

### 6. Tại sao không để ChatGPT tự lập kế hoạch?

- **Trả lời ngắn:** Deadline, capacity, ordering và state change cần tái lập và audit được, nên current demo dùng deterministic engines.
- **Giải thích sâu:** Model output có thể không ổn định hoặc invent facts. Planner/Risk/NBA không import model SDK và không gọi LLM.
- **Không nên claim:** “LLM không thể lập kế hoạch.”

### 7. Hallucination được xử lý thế nào?

- **Trả lời ngắn:** External output không được tin trực tiếp: strict schema, application validation, user confirmation và fallback tạo nhiều lớp kiểm soát.
- **Giải thích sâu:** Candidate phải có 1–5 item, title/estimate bounded, unique; invalid provider output bị thay toàn bộ bằng fallback. Explanation không có trường để đổi recommendation.
- **Không nên claim:** “Hallucination bị loại bỏ hoàn toàn.”

### 8. Tại sao gọi đây là AI system khi Risk Engine không phải ML?

- **Trả lời ngắn:** Đây là một system có AI capability được đặt trong boundary rõ ràng, còn các quyết định có rule minh bạch vẫn là deterministic.
- **Giải thích sâu:** Không phải mọi thành phần của AI system cần là ML. Architecture phân công theo loại bài toán và mức độ evidence hiện có.
- **Không nên claim:** “Risk Engine là AI dự đoán.”

### 9. Nếu mất Internet thì sao?

- **Trả lời ngắn:** Demo vẫn chạy đầy đủ bằng deterministic offline templates.
- **Giải thích sâu:** Provider disabled, missing credential, timeout, provider error hoặc invalid output đều có fallback. Risk, NBA, Planner và Replanner vốn không phụ thuộc network.
- **Không nên claim:** “Mọi tính năng tương lai đều offline.”

### 10. Online LLM có được bật mặc định không?

- **Trả lời ngắn:** Không. Configuration mặc định là offline và online mode cần enable cùng server-side credential.
- **Giải thích sâu:** Browser không nhận API key và không chọn provider. Preflight chỉ gọi provider khi presenter yêu cầu explicit live check.
- **Không nên claim:** “Model online đã được đánh giá live trong milestone này.”

### 11. Model có làm bài thay sinh viên không?

- **Trả lời ngắn:** Không trong flow hiện tại. Candidate là decomposition steps, không phải graded submission content.
- **Giải thích sâu:** Prompt và fallback yêu cầu action steps; dataset kiểm tra obvious submission content. Đây là một scoped safeguard, không phải academic-integrity program hoàn chỉnh.
- **Không nên claim:** “Hệ thống đã giải quyết toàn bộ vấn đề academic integrity.”

## Algorithms

### 12. Risk được tính thế nào?

- **Trả lời ngắn:** Engine xem open tasks, deadline, remaining effort, capacity trước deadline và slack.
- **Giải thích sâu:** Thứ tự rule là: no remaining work; deadline passed; missing effort/capacity; no capacity; effort exceeds capacity; low slack; sufficient slack. Output chứa level, reason code và evidence.
- **Không nên claim:** “Risk là xác suất trễ hạn.”

### 13. Vì sao dùng threshold slack 25%?

- **Trả lời ngắn:** Đây là MVP heuristic minh bạch để nhận biết reserve time thấp.
- **Giải thích sâu:** Rule so sánh slack/remaining effort bằng exact arithmetic. Nó có version trong policy và tests, nhưng chưa được calibration bằng outcome thật.
- **Không nên claim:** “25% là ngưỡng tối ưu cho sinh viên HaUI.”

### 14. Next Best Action chọn task bằng cách nào?

- **Trả lời ngắn:** Nó chọn task open đầu tiên sau khi sort theo risk, deadline, in-progress status, assignment ID và task ID.
- **Giải thích sâu:** UNKNOWN risk được policy xử lý như MEDIUM mặc định, không coi là safe. Evidence ghi deciding dimension phân biệt task thắng với runner-up.
- **Không nên claim:** “NBA dùng weighted score hoặc học từ hành vi.”

### 15. Weekly Planner hoạt động thế nào?

- **Trả lời ngắn:** Planner deadline-first phân bổ explicit task effort vào explicit study windows.
- **Giải thích sâu:** Overlapping/touching windows được merge để không double-count capacity. Task dài có thể split thành nhiều block; effort không vừa trở thành typed UnplannedTask.
- **Không nên claim:** “Planner hiểu lịch cá nhân thật hoặc tự tạo thời gian.”

### 16. Replanning hoạt động thế nào?

- **Trả lời ngắn:** Replanner giữ history, freeze past/crossing blocks, preserve future blocks còn hợp lệ và chỉ schedule residual work.
- **Giải thích sâu:** Remaining effort là explicit input cho từng open task. Execution duration và confirmed reflection là audit context trong v0, không tự suy diễn estimate mới.
- **Không nên claim:** “Replanner tự học thói quen hoặc tự sửa estimate.”

## Architecture

### 17. Vì sao dùng modular monolith?

- **Trả lời ngắn:** Scope hiện tại cần một system dễ test và dễ trace hơn là distributed deployment.
- **Giải thích sâu:** Domain, engines, application, API và infrastructure có dependency direction rõ. Các component consequential giữ pure và test độc lập.
- **Không nên claim:** “Microservices luôn sai.”

### 18. Vì sao chưa dùng microservices?

- **Trả lời ngắn:** Chưa có workload hoặc ownership boundary chứng minh chi phí vận hành microservices là hợp lý.
- **Giải thích sâu:** Split sớm sẽ thêm network, deployment, observability và consistency complexity khi core policy vẫn đang được validate.
- **Không nên claim:** “Hệ thống sẽ không bao giờ tách service.”

### 19. Ports and Adapters mang lại lợi ích gì?

- **Trả lời ngắn:** Application phụ thuộc vào contract mình cần, không phụ thuộc trực tiếp vào OpenAI, PostgreSQL hay LMS vendor.
- **Giải thích sâu:** In-memory and PostgreSQL adapters dùng chung repository contracts; optional LLM adapter thay được mà không đưa vendor type vào engines/domain.
- **Không nên claim:** “Ports tự động làm hệ thống production-ready.”

### 20. Vì sao append-only plan history quan trọng?

- **Trả lời ngắn:** Người dùng và presenter có thể thấy baseline, revision và typed reason thay vì chỉ thấy plan mới nhất.
- **Giải thích sâu:** StoredStudyPlan lưu revision, parent record và ReplanningResult; stale baseline được phát hiện để tránh silent fork trong contract.
- **Không nên claim:** “Đã có full multi-user audit/compliance system.”

## Data and privacy

### 21. Dữ liệu demo lấy từ đâu?

- **Trả lời ngắn:** Từ three reproducible fictional scenarios và mock LMS provider.
- **Giải thích sâu:** Demo API seeds in-memory container; scenario reset atomically thay container mới. Không có dữ liệu sinh viên thật trong flow này.
- **Không nên claim:** “Đã có kết nối dữ liệu HaUI.”

### 22. Có dùng dữ liệu thật của HaUI không?

- **Trả lời ngắn:** Không. Demo và LLM evaluation dataset đều fictional.
- **Giải thích sâu:** Đây là lựa chọn scope và privacy trước pilot. Live provider input trong preflight cũng là fictional.
- **Không nên claim:** “Đã thu thập hoặc phân tích dữ liệu sinh viên.”

### 23. Privacy sẽ xử lý thế nào trong tương lai?

- **Trả lời ngắn:** Cần identity, authorization, data minimization, retention/deletion rules và pilot approval trước khi dùng dữ liệu thật.
- **Giải thích sâu:** PROJECT.md định hướng student private data tách khỏi lecturer aggregates; implementation production của các boundary này vẫn planned.
- **Không nên claim:** “Privacy/GDPR compliance đã hoàn tất.”

### 24. PostgreSQL đã được dùng trong demo chưa?

- **Trả lời ngắn:** Không. Council demo dùng in-memory fixture để reproducible và reset được.
- **Giải thích sâu:** PostgreSQL adapter, migrations và contract tests đã tồn tại, nhưng 14 tests cần real database URL nên skipped trong verification hiện tại.
- **Không nên claim:** “PostgreSQL path đã được verified trong môi trường này.”

## Evaluation

### 25. 1532 backend tests chứng minh điều gì?

- **Trả lời ngắn:** Chúng cho bằng chứng regression cho domain invariants, engines, use cases, API boundaries và demo flow.
- **Giải thích sâu:** Test count không đo product value. 14 PostgreSQL tests skipped khi không cấu hình real database, nên phải nói rõ condition này.
- **Không nên claim:** “1532 tests chứng minh system không có bug.”

### 26. 20/20 Playwright chứng minh điều gì?

- **Trả lời ngắn:** Các browser flows quan trọng của development workspace đã pass trong môi trường kiểm tra đó.
- **Giải thích sâu:** Test bao gồm showcase, candidate confirmation, execution, reflection, replan, history và reset. Nó không phải accessibility certification hoặc production load test.
- **Không nên claim:** “UI sẵn sàng cho mọi thiết bị và mọi người dùng.”

### 27. 28/28 LLM offline eval có ý nghĩa gì?

- **Trả lời ngắn:** Nó chứng minh deterministic fallback và contract checks pass trên 28 fictional cases.
- **Giải thích sâu:** 20 decomposition cases và 8 explanation cases kiểm tra bounds, duplicates, reason consistency và invented numerical evidence. Manual rubric chưa được auto-score.
- **Không nên claim:** “Model đạt 100% chất lượng.”

### 28. Tại sao chưa thể khẳng định hệ thống giúp sinh viên học tốt hơn?

- **Trả lời ngắn:** Chưa có real-user pilot, baseline, outcome definition hay study design.
- **Giải thích sâu:** Cần approval, privacy-safe data collection, metrics như plan adherence/on-time submission, và phân tích phù hợp trước bất kỳ outcome claim nào.
- **Không nên claim:** “Explainability tự động tạo ra hiệu quả học tập.”

## Future

### 29. Làm sao tích hợp LMS thật?

- **Trả lời ngắn:** Xây narrow HaUI LMS adapter phía sau existing LMSProvider port sau khi có quyền truy cập và data contract.
- **Giải thích sâu:** Adapter phải normalize courses, assignments, deadlines, submission metadata, source identity và freshness, nhưng không kéo vendor logic vào domain.
- **Không nên claim:** “Chỉ cần thay URL API là xong.”

### 30. Khi nào dùng ML prediction?

- **Trả lời ngắn:** Chỉ sau khi có đủ historical data, target defensible, baseline deterministic và evaluation plan.
- **Giải thích sâu:** Prediction cần calibration, fairness/privacy review, drift monitoring và explanation boundary. Nếu transparent rule đủ tốt thì không cần ML.
- **Không nên claim:** “ML là bước tiếp theo chắc chắn.”

### 31. RAG sẽ được dùng ở đâu?

- **Trả lời ngắn:** RAG là planned supporting capability cho course-material Q&A, không phải core decision engine.
- **Giải thích sâu:** Cần authorized ingestion, source-aware chunks, authorization filters, citations, abstention và retrieval evaluation trước khi đưa vào student workflow.
- **Không nên claim:** “RAG đã có trong demo.”

### 32. Bước tiếp theo thực tế là gì?

- **Trả lời ngắn:** Approval/pilot design, identity and data governance, narrow LMS integration, rồi real-user pilot để đánh giá heuristic.
- **Giải thích sâu:** Sau pilot mới cân nhắc calibration, RAG và behavior-aware ML theo evidence. Roadmap ưu tiên giảm uncertainty trước khi tăng complexity.
- **Không nên claim:** “Có timeline deployment hoặc outcome chắc chắn.”

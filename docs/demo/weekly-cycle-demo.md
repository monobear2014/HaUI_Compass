# Weekly cycle demo (3–5 minutes)

**IMPLEMENTED, development/demo-only.** Fictional data, in-memory demo API, Vietnamese UI.

## Start

```bash
cd apps/api && uv run --extra dev uvicorn haui_compass.api.demo:app --host 127.0.0.1 --port 8001
cd apps/web && COMPASS_API_URL=http://127.0.0.1:8001 npm run dev
```

Open http://127.0.0.1:3000/login → **Điền tài khoản demo** (`demo` / `haui123`) → Sinh viên →
**Để sau, vào không gian học**. The demo starts on **Tuần học mẫu** (Monday 09:00, no plan). To restart, open
**Tuỳ chọn → Kịch bản demo → Đặt lại kịch bản**.

## Script

1. **Plan (~1 min)** — *Hôm nay* shows “Tuần này chưa có kế hoạch” → **Lập kế hoạch tuần**.
   Type a goal, show assignments/deadlines, click **Chia thành bước nhỏ** on “Đồ án nhỏ” and
   **Thêm công việc đã chọn** (AI suggests, the student confirms). Free time is prefilled.
   **Xem kế hoạch đề xuất** → explain risk badges → **Chỉnh sửa** (remove a window) → preview →
   **Duyệt kế hoạch** → **Bắt đầu hôm nay**.
2. **Do (~1 min)** — **Bắt đầu** → **Hoàn thành** → enter e.g. 80 minutes. Progress updates.
   Point out deadline alerts and **Tài liệu & Trợ lý Compass** (cited answers).
3. **Adapt (~1 min)** — click **Sang ngày mai** twice (Wednesday). The missed-session alert
   appears → **Sắp xếp lại lịch** → **Tôi bận** on today's window → **Xem lịch đề xuất**: risk
   before → after and per-task changes; nothing is saved yet → **Áp dụng lịch mới**.
4. **Reflect (~1 min)** — **Sang ngày mai** ×4 (Sunday) → *Phản tư tuần*: summary, strengths,
   areas to improve and Compass reflection prompts. Tick a task, choose **Quá nặng**, add a
   difficult topic → **Xem lại phản hồi** → select notes → **Lưu điều đã chọn**.
5. **Next week (~30 s)** — **Lập kế hoạch tuần sau**: “Gợi ý từ tuần trước” shows carry-over,
   the reduced target and the difficult topic → preview → approve. *Lịch sử kế hoạch* lists goals
   and reflections by week.

## Boundaries

Planner, replanner, risk and next-action decisions are deterministic; the LLM only suggests task
breakdowns and phrases explanations/reflection prompts, with offline fallbacks. Demo time controls
exist only in the opt-in demo API. All demo accounts share one fictional workspace.

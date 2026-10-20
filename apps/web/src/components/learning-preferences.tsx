"use client";

import { useEffect, useState } from "react";
import { api, apiDelete, type Period, type Window } from "@/lib/api";

type Session = {
  weekday: number;
  start_minute: number;
  duration_minutes: number;
};
type Profile = {
  timezone: "Asia/Ho_Chi_Minh";
  weekly_target_minutes: number;
  sessions: Session[];
  difficult_topics: string[];
  confirmed_at?: string;
};
const empty = (): Profile => ({
  timezone: "Asia/Ho_Chi_Minh",
  weekly_target_minutes: 180,
  sessions: [{ weekday: 1, start_minute: 1200, duration_minutes: 60 }],
  difficult_topics: [],
});
const hhmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

export function LearningPreferences({
  period,
  vi,
  onApply,
}: {
  period: Period;
  vi: boolean;
  onApply?: (windows: Window[], target: number, topics: string[]) => void;
}) {
  const [draft, setDraft] = useState<Profile>(empty);
  const [saved, setSaved] = useState<Profile | null>(null);
  const [topics, setTopics] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [retry, setRetry] = useState(0);
  const c = (vn: string, en: string) => (vi ? vn : en);
  useEffect(() => {
    let active = true;
    api<{ preferences: Profile | null }>("learning-preferences")
      .then(({ preferences }) => {
        if (!active) return;
        setSaved(preferences);
        setDraft(preferences || empty());
        setTopics(preferences?.difficult_topics.join("\n") || "");
        setReady(true);
        setError("");
      })
      .catch(() => {
        if (active)
          setError(
            vi
              ? "Chưa tải được sở thích học tập."
              : "Could not load learning preferences.",
          );
      });
    return () => {
      active = false;
    };
  }, [retry, vi]);
  function changeSession(index: number, value: Partial<Session>) {
    setDraft({
      ...draft,
      sessions: draft.sessions.map((session, i) =>
        i === index ? { ...session, ...value } : session,
      ),
    });
    setMessage("");
  }
  async function action(kind: "save" | "delete" | "apply") {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (kind === "save") {
        const { confirmed_at: _, ...value } = draft;
        void _;
        const result = await api<{ preferences: Profile }>(
          "learning-preferences",
          {
            ...value,
            difficult_topics: topics
              .split("\n")
              .map((t) => t.trim())
              .filter(Boolean),
          },
        );
        setSaved(result.preferences);
        setDraft(result.preferences);
        setMessage(
          c(
            "Đã lưu theo xác nhận của bạn. Kế hoạch hiện tại chưa thay đổi.",
            "Saved with your confirmation. Your current plan has not changed.",
          ),
        );
      } else if (kind === "delete") {
        await apiDelete("learning-preferences");
        setSaved(null);
        setDraft(empty());
        setTopics("");
        setMessage(
          c(
            "Đã xoá sở thích đã lưu. Lịch và phản tư cũ vẫn giữ nguyên.",
            "Saved preferences deleted. Existing schedules and reflections are unchanged.",
          ),
        );
      } else {
        const result = await api<{
          preferences: Profile | null;
          study_windows: Window[];
        }>("learning-preferences/preview", period);
        if (!result.preferences || !result.study_windows.length) {
          setMessage(
            c(
              "Không có khung giờ đã lưu phù hợp phần còn lại của tuần. Bạn có thể sửa lịch bên dưới.",
              "No saved sessions fit the rest of this week. Edit the free time below.",
            ),
          );
        } else {
          onApply?.(
            result.study_windows,
            result.preferences.weekly_target_minutes,
            result.preferences.difficult_topics,
          );
          setMessage(
            c(
              "Đã đưa sở thích đã lưu vào bản nháp. Nếu mục tiêu còn trống, các chủ đề khó được gợi ý để ôn. Kiểm tra thời gian rảnh rồi xem và duyệt kế hoạch.",
              "Saved preferences applied to the draft. Difficult topics suggest a revision goal if it was blank. Review your free time, then preview and approve the plan.",
            ),
          );
        }
      }
    } catch {
      setError(
        c(
          "Chưa thực hiện được. Kiểm tra giờ học không trùng, kết thúc trong ngày và tối đa 5 chủ đề (120 ký tự/chủ đề), rồi thử lại.",
          "Could not complete the action. Check non-overlapping sessions ending the same day and up to 5 topics (120 characters each), then retry.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="panel learning-preferences">
      <summary>
        {c("Sở thích học tập của tôi", "My learning preferences")}
      </summary>

      {!ready ? (
        <>
          <p role="status">{error || c("Đang tải…", "Loading…")}</p>
          <button type="button" onClick={() => setRetry((r) => r + 1)}>
            {c("Thử tải lại", "Retry loading")}
          </button>
        </>
      ) : (
        <fieldset disabled={busy} className="form-stack">
          <label>
            {c("Mục tiêu phút học mỗi tuần", "Weekly study target (minutes)")}
            <input
              form="learning-preferences-editor"
              type="number"
              min={15}
              max={2520}
              required
              value={draft.weekly_target_minutes}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  weekly_target_minutes: Number(e.target.value),
                })
              }
            />
          </label>
          {draft.sessions.map((session, index) => (
            <div className="preference-session" key={index}>
              <label>
                {c("Ngày học", "Study day")} {index + 1}
                <select
                  form="learning-preferences-editor"
                  aria-label={`${c("Ngày học", "Study day")} ${index + 1}`}
                  value={session.weekday}
                  onChange={(e) =>
                    changeSession(index, { weekday: Number(e.target.value) })
                  }
                >
                  {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                    <option key={day} value={day}>
                      {vi
                        ? day === 7
                          ? "Chủ nhật"
                          : `Thứ ${day + 1}`
                        : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][
                            day - 1
                          ]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {c("Giờ bắt đầu", "Start time")} {index + 1}
                <input
                  form="learning-preferences-editor"
                  type="time"
                  required
                  value={hhmm(session.start_minute)}
                  onChange={(e) => {
                    const [h, m] = e.target.value.split(":").map(Number);
                    changeSession(index, { start_minute: h * 60 + m });
                  }}
                />
              </label>
              <label>
                {c("Số phút mỗi buổi", "Session minutes")} {index + 1}
                <input
                  form="learning-preferences-editor"
                  type="number"
                  min={15}
                  max={180}
                  required
                  value={session.duration_minutes}
                  onChange={(e) =>
                    changeSession(index, {
                      duration_minutes: Number(e.target.value),
                    })
                  }
                />
              </label>
              <button
                type="button"
                disabled={draft.sessions.length === 1}
                onClick={() =>
                  setDraft({
                    ...draft,
                    sessions: draft.sessions.filter((_, i) => i !== index),
                  })
                }
              >
                {c("Bỏ khung giờ", "Remove session")} {index + 1}
              </button>
            </div>
          ))}
          <button
            type="button"
            disabled={draft.sessions.length >= 14}
            onClick={() =>
              setDraft({
                ...draft,
                sessions: [
                  ...draft.sessions,
                  { weekday: 2, start_minute: 1200, duration_minutes: 60 },
                ],
              })
            }
          >
            {c("Thêm buổi học ưu tiên", "Add preferred session")}
          </button>
          <label>
            {c(
              "Chủ đề tôi thấy khó (mỗi dòng một chủ đề, tối đa 5)",
              "Topics I find difficult (one per line, up to 5)",
            )}
            <textarea
              form="learning-preferences-editor"
              rows={3}
              maxLength={604}
              value={topics}
              onChange={(e) => setTopics(e.target.value)}
            />
          </label>
          {saved && (
            <p>
              {c("Chủ đề đã xác nhận", "Confirmed topics")}:{" "}
              {saved.difficult_topics.join(", ") || c("Chưa có", "None")}
            </p>
          )}
          <div className="button-row">
            <button type="button" onClick={() => void action("save")}>
              {busy
                ? c("Đang xử lý…", "Working…")
                : c("Xác nhận & lưu sở thích", "Confirm & save preferences")}
            </button>
            {saved && (
              <>
                {onApply && (
                  <button type="button" onClick={() => void action("apply")}>
                    {c(
                      "Áp dụng sở thích đã lưu vào bản nháp",
                      "Apply saved preferences to draft",
                    )}
                  </button>
                )}
                <button type="button" onClick={() => void action("delete")}>
                  {c("Xoá sở thích đã lưu", "Delete saved preferences")}
                </button>
              </>
            )}
          </div>
        </fieldset>
      )}
      {ready && error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </details>
  );
}

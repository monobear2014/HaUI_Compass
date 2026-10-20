"use client";

import { useEffect, useState } from "react";
import { ClassInsights, lecturerCsv } from "@/lib/lecturer-insights";
import styles from "./lecturer.module.css";

export function LecturerInsights({
  classId,
  title,
  refreshKey,
}: {
  classId: string;
  title: string;
  refreshKey: string;
}) {
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    data?: ClassInsights;
    error?: string;
  } | null>(null);
  const [course, setCourse] = useState("");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("attention");
  const [exported, setExported] = useState(false);
  const requestKey = `${classId}:${refreshKey}:${attempt}`;
  const pending = result?.key !== requestKey;
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void fetch(
      `/compass-api/lecturer/classes/${encodeURIComponent(classId)}/insights`,
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            response.status === 403
              ? "Bạn chưa được cấp quyền xem lớp này."
              : "Chưa tải được phân tích lớp. Vui lòng thử lại.",
          );
        return response.json() as Promise<ClassInsights>;
      })
      .then((data) => {
        if (!controller.signal.aborted) setResult({ key: requestKey, data });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setResult({
            key: requestKey,
            error: "Chưa tải được phân tích lớp. Vui lòng thử lại.",
          });
      });
    return () => controller.abort();
  }, [open, classId, requestKey]);
  const snapshot = result?.data;
  const detail = snapshot?.detail;
  const assignments = (detail?.assignments || [])
    .filter(
      (a) =>
        (!course || a.course === course) &&
        (!attentionOnly || a.progress.not_submitted > 0 || a.due_soon > 0) &&
        `${a.title} ${a.course}`
          .toLocaleLowerCase()
          .includes(search.trim().toLocaleLowerCase()),
    )
    .sort((a, b) =>
      sort === "course"
        ? a.course.localeCompare(b.course, "vi") ||
          a.title.localeCompare(b.title, "vi")
        : sort === "deadline"
          ? (Date.parse(a.deadline_start || "") || Infinity) -
            (Date.parse(b.deadline_start || "") || Infinity)
          : b.progress.not_submitted - a.progress.not_submitted ||
            b.due_soon - a.due_soon ||
            a.key.localeCompare(b.key),
    );
  function exportCsv() {
    if (
      !snapshot ||
      snapshot.suppressed ||
      pending ||
      result?.error ||
      !assignments.length
    )
      return;
    const url = URL.createObjectURL(
      new Blob([lecturerCsv(title, snapshot.as_of, assignments)], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "compass-bao-cao-lop.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExported(true);
  }
  const date = (value: string | null) =>
    value
      ? new Date(value).toLocaleString("vi-VN", {
          timeZone: "Asia/Ho_Chi_Minh",
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "Không có hạn";
  return (
    <details
      className={styles.insights}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Phân tích bài tập & hỗ trợ lớp</summary>
      {open && (
        <div aria-busy={pending}>
          {pending && <p role="status">Đang cập nhật phân tích lớp…</p>}
          {!pending && result?.error && (
            <div role="alert">
              <p>{result.error}</p>
              <button onClick={() => setAttempt((value) => value + 1)}>
                Tải lại phân tích
              </button>
            </div>
          )}
          {!pending && !result?.error && snapshot?.suppressed && (
            <p>
              Ẩn phân tích để bảo vệ nhóm quá nhỏ hoặc chưa có dữ liệu phù hợp.
            </p>
          )}
          {!pending && !result?.error && detail && (
            <>
              <section
                aria-label={`Gợi ý hỗ trợ · ${title}`}
                className={styles.support}
              >
                <h3>Lớp cần hỗ trợ ở đâu?</h3>
                <ul>
                  <li>
                    <strong>{detail.support.learners_overdue}</strong> sinh viên
                    có bài quá hạn chưa nộp.{" "}
                    {detail.support.learners_overdue > 0
                      ? "Ưu tiên một phiên giải đáp yêu cầu và hướng dẫn nộp bài cho lớp."
                      : "Chưa ghi nhận bài quá hạn chưa nộp."}
                  </li>
                  <li>
                    <strong>{detail.support.learners_due_soon}</strong> sinh
                    viên có bài sắp hạn trong 48 giờ chưa nộp.{" "}
                    {detail.support.learners_due_soon > 0 &&
                      "Nhắc chung về deadline và dành thời gian gỡ vướng."}
                  </li>
                  <li>
                    <strong>{detail.support.learners_without_plan}</strong> sinh
                    viên chưa có kế hoạch đã lưu.{" "}
                    {detail.support.learners_without_plan > 0 &&
                      "Hướng dẫn lớp chia nhỏ bài tập và duyệt kế hoạch tuần."}
                  </li>
                </ul>
              </section>
              <div className={styles.filters}>
                <label>
                  Tìm bài tập
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setExported(false);
                    }}
                  />
                </label>
                <label>
                  Môn học
                  <select
                    aria-label="Môn học"
                    value={course}
                    onChange={(e) => {
                      setCourse(e.target.value);
                      setExported(false);
                    }}
                  >
                    <option value="">Tất cả môn</option>
                    {[...new Set(detail.assignments.map((a) => a.course))].map(
                      (c) => (
                        <option key={c}>{c}</option>
                      ),
                    )}
                  </select>
                </label>
                <label>
                  Sắp xếp
                  <select
                    aria-label="Sắp xếp"
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="attention">Cần chú ý trước</option>
                    <option value="deadline">Deadline gần nhất</option>
                    <option value="course">Theo môn học</option>
                  </select>
                </label>
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={attentionOnly}
                    onChange={(e) => {
                      setAttentionOnly(e.target.checked);
                      setExported(false);
                    }}
                  />
                  Chỉ bài cần chú ý
                </label>
              </div>
              <div className={styles.reportActions}>
                <p role="status">
                  {assignments.length} / {detail.assignments.length} bài tập
                </p>
                <button disabled={assignments.length === 0} onClick={exportCsv}>
                  Xuất CSV theo bộ lọc
                </button>
              </div>
              {exported && (
                <p role="status">
                  Đã tạo báo cáo tổng hợp theo bộ lọc hiện tại.
                </p>
              )}
              {!assignments.length && <p>Không có bài tập phù hợp bộ lọc.</p>}
              <div className={styles.assignmentGrid}>
                {assignments.map((a) => (
                  <article
                    key={a.key}
                    className={styles.assignment}
                    aria-label={a.title}
                  >
                    <p className={styles.eyebrow}>{a.course}</p>
                    <h4>{a.title}</h4>
                    <p>
                      Hạn: {date(a.deadline_start)}
                      {a.deadline_end !== a.deadline_start &&
                        ` → ${date(a.deadline_end)}`}{" "}
                      (UTC+7)
                    </p>
                    {(a.progress.not_submitted > 0 || a.due_soon > 0) && (
                      <p className={styles.attention}>
                        Cần chú ý · {a.progress.not_submitted} lượt quá hạn chưa
                        nộp · {a.due_soon} lượt sắp hạn
                      </p>
                    )}
                    <dl className={styles.assignmentCounts}>
                      {[
                        ["Đã nộp đúng hạn", a.progress.on_time],
                        ["Đã nộp trễ", a.progress.late],
                        ["Quá hạn chưa nộp", a.progress.not_submitted],
                        ["Sắp hạn 48h chưa nộp", a.due_soon],
                        [
                          "Việc đã hoàn thành",
                          `${a.completed_tasks} / ${a.tasks}`,
                        ],
                        ["Phút học ghi nhận", a.study_minutes],
                      ].map(([label, count]) => (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>{count}</dd>
                        </div>
                      ))}
                    </dl>
                    <p>
                      KPI bài này:{" "}
                      {a.progress.on_time_rate === null
                        ? "Chưa có lượt đến hạn"
                        : `${a.progress.on_time_rate}%`}{" "}
                      · {a.progress.on_time_due} / {a.progress.due_obligations}{" "}
                      lượt đã đến hạn.
                    </p>
                  </article>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </details>
  );
}

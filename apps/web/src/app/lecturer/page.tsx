"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import styles from "./lecturer.module.css";
import { LecturerInsights } from "./insights";

type Progress = {
  on_time: number;
  late: number;
  not_submitted: number;
  not_yet_due: number;
  no_deadline: number;
  due_obligations: number;
  on_time_due: number;
  on_time_rate: number | null;
};
type Snapshot = {
  mode?: "fixture" | "live_activity";
  source: string;
  as_of: string;
  minimum_cohort: number;
  classes: {
    class_id: string;
    title: string;
    suppressed: boolean;
    enrollment_count: number | null;
    progress: Progress | null;
    activity?: {
      tasks: number;
      completed_tasks: number;
      study_minutes: number;
      learners_with_plan: number;
      learners_reflected: number;
    } | null;
    comparison?: {
      before_label: string;
      after_label: string;
      before: Progress;
      after: Progress;
      change_percentage_points: number | null;
    } | null;
  }[];
};

export default function LecturerPage() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [selectedClass, setSelectedClass] = useState("");
  const [pending, setPending] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  async function logout() {
    setLoggingOut(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error();
      window.location.replace("/login");
    } catch {
      setError("Chưa đăng xuất được. Vui lòng thử lại.");
      setLoggingOut(false);
    }
  }
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        setPending(true);
        setAttempt((value) => value + 1);
      }
    }, 30_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/compass-api/lecturer/classes", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            response.status === 403
              ? "Tài khoản chưa được cấp quyền giảng viên."
              : "Không tải được tiến độ lớp. Vui lòng thử lại.",
          );
        return response.json() as Promise<Snapshot>;
      })
      .then((snapshot) => {
        if (!controller.signal.aborted) {
          setData(snapshot);
          setError("");
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Không tải được dữ liệu.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setPending(false);
      });
    return () => controller.abort();
  }, [attempt]);
  return (
    <main className={styles.page} lang="vi">
      <header className={styles.header}>
        <Link href="/lecturer" className={styles.brand}>
          <Icon name="compass" size={24} /> HaUI Compass
        </Link>
        <span className={styles.role}>Không gian giảng viên</span>
        <button
          type="button"
          disabled={loggingOut}
          onClick={() => void logout()}
        >
          {loggingOut ? "Đang đăng xuất…" : "Đăng xuất"}
        </button>
      </header>
      <div className={styles.heading}>
        <p className={styles.eyebrow}>THEO DÕI LỚP HỌC</p>
        <h1>Tiến độ lớp học</h1>

        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setPending(true);
            setAttempt((value) => value + 1);
          }}
        >
          {pending ? "Đang làm mới…" : "Làm mới dữ liệu"}
        </button>
      </div>
      <aside className={styles.context} aria-label="Thông tin dữ liệu">
        <span className={styles.simulated}>
          <Icon name="book" size={16} /> Dữ liệu Canvas mô phỏng
        </span>
        {data && (
          <p>
            {data.mode === "live_activity"
              ? "Cập nhật lúc:"
              : "Mốc quan sát cố định:"}{" "}
            <time dateTime={data.as_of}>
              {new Date(data.as_of).toLocaleString("vi-VN", {
                timeZone: "Asia/Ho_Chi_Minh",
              })}
            </time>{" "}
            (UTC+7)
          </p>
        )}

        {data && (
          <p className={styles.source}>
            Nguồn: {data.source}. Chỉ hiển thị nhóm từ {data.minimum_cohort}{" "}
            sinh viên.
          </p>
        )}
      </aside>
      <details className={styles.formula}>
        <summary>Cách tính KPI</summary>
        <p>
          KPI nộp đúng hạn = lượt nộp với submitted_at ≤ due_at của bài đã đến
          hạn / tổng lượt phải nộp của bài đã đến hạn. Hoàn thành task học tập
          không phải là nộp bài.
        </p>
        <p>
          Các số đếm là lượt sinh viên × bài tập; lượt đã nộp sớm của bài chưa
          đến hạn chưa tham gia mẫu số KPI.
        </p>
      </details>
      {error && (
        <div role="alert" className={styles.state}>
          <p>{error}</p>
          <button
            onClick={() => {
              setError("");
              setPending(true);
              setAttempt((value) => value + 1);
            }}
          >
            Thử lại
          </button>
        </div>
      )}
      {!data && !error && (
        <p role="status" className={styles.state}>
          Đang tải tiến độ…
        </p>
      )}
      {data && (
        <>
          {data.classes.length === 0 && (
            <p className={styles.state}>Chưa có lớp được phân công.</p>
          )}
          {data.classes.length > 1 && (
            <label className={styles.classFilter}>
              Lớp đang xem
              <select
                aria-label="Lớp đang xem"
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
              >
                <option value="">Tất cả lớp được phân công</option>
                {data.classes.map((c) => (
                  <option key={c.class_id} value={c.class_id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className={styles.classes}>
            {data.classes
              .filter((c) => !selectedClass || c.class_id === selectedClass)
              .map((course) => (
                <section
                  key={course.class_id}
                  className={styles.card}
                  aria-labelledby={`class-${course.class_id}`}
                >
                  <div className={styles.cardHeading}>
                    <h2 id={`class-${course.class_id}`}>{course.title}</h2>
                    {!course.suppressed && (
                      <span className={styles.enrollment}>
                        {course.enrollment_count} sinh viên
                      </span>
                    )}
                  </div>
                  {course.suppressed ? (
                    <div className={styles.suppressed}>
                      <Icon name="alert" size={20} />
                      <div>
                        <strong>Thống kê được bảo vệ</strong>
                        <p>Ẩn thống kê để bảo vệ nhóm quá nhỏ.</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      {course.activity && (
                        <section
                          aria-label={`Hoạt động học tập · ${course.title}`}
                        >
                          <h3>Hoạt động học tập của lớp</h3>
                          <dl className={styles.counts}>
                            {(
                              [
                                [
                                  "Công việc đã hoàn thành",
                                  `${course.activity.completed_tasks} / ${course.activity.tasks}`,
                                ],
                                [
                                  "Tổng phút học",
                                  course.activity.study_minutes,
                                ],
                                [
                                  "Sinh viên có kế hoạch",
                                  course.activity.learners_with_plan,
                                ],
                                [
                                  "Sinh viên đã phản tư",
                                  course.activity.learners_reflected,
                                ],
                              ] as const
                            ).map(([label, value]) => (
                              <div key={label}>
                                <dt>{label}</dt>
                                <dd>{value}</dd>
                              </div>
                            ))}
                          </dl>
                        </section>
                      )}
                      {!course.progress && (
                        <p>
                          Chưa có dữ liệu nộp bài để tính KPI đúng hạn hoặc so
                          sánh trước/sau. Hoàn thành công việc chưa có nghĩa là
                          đã nộp bài.
                        </p>
                      )}
                      {course.progress && (
                        <>
                          <SubmissionKpi
                            progress={course.progress}
                            title={course.title}
                          />
                          <dl className={styles.counts}>
                            {(
                              [
                                ["Đã nộp đúng hạn", course.progress.on_time],
                                ["Đã nộp trễ", course.progress.late],
                                [
                                  "Chưa nộp · đã đến hạn",
                                  course.progress.not_submitted,
                                ],
                                [
                                  "Chưa nộp · chưa đến hạn",
                                  course.progress.not_yet_due,
                                ],
                                [
                                  "Không có hạn · loại khỏi KPI",
                                  course.progress.no_deadline,
                                ],
                              ] as const
                            ).map(([label, count]) => (
                              <div key={label}>
                                <dt>{label}</dt>
                                <dd>{count}</dd>
                              </div>
                            ))}
                          </dl>
                          <p className={styles.unit}>
                            Đơn vị: lượt sinh viên × bài tập.
                          </p>
                        </>
                      )}
                      {data.mode === "live_activity" && (
                        <LecturerInsights
                          classId={course.class_id}
                          title={course.title}
                          refreshKey={data.as_of}
                        />
                      )}
                      {course.comparison && (
                        <section
                          aria-label={`So sánh trước và sau · ${course.title}`}
                        >
                          <h3>Trước / sau sử dụng · dữ liệu mô phỏng</h3>
                          <dl className={styles.counts}>
                            {(
                              [
                                [
                                  course.comparison.before_label,
                                  course.comparison.before,
                                ],
                                [
                                  course.comparison.after_label,
                                  course.comparison.after,
                                ],
                              ] satisfies [string, Progress][]
                            ).map(([label, period]) => {
                              return (
                                <div key={label}>
                                  <dt>{label}</dt>
                                  <dd>
                                    {period.on_time_rate === null
                                      ? "Chưa đủ dữ liệu"
                                      : `${period.on_time_rate}%`}
                                  </dd>
                                  <small>
                                    {period.on_time_due} /{" "}
                                    {period.due_obligations} lượt đã đến hạn
                                  </small>
                                </div>
                              );
                            })}
                          </dl>
                          <p>
                            Chênh lệch:{" "}
                            {course.comparison.change_percentage_points === null
                              ? "Chưa đủ dữ liệu"
                              : `${course.comparison.change_percentage_points > 0 ? "+" : ""}${course.comparison.change_percentage_points} điểm phần trăm`}
                            .
                          </p>
                        </section>
                      )}
                    </>
                  )}
                </section>
              ))}
          </div>
        </>
      )}
    </main>
  );
}

function SubmissionKpi({
  progress,
  title,
}: {
  progress: Progress;
  title: string;
}) {
  const rate = progress.on_time_rate;
  const noDenominator = rate === null || progress.due_obligations === 0;
  // API contract: percentage points (0–100), never a fraction (0–1).
  // Do not recalculate or clamp an invalid response into a plausible KPI.
  const valid =
    !noDenominator &&
    typeof rate === "number" &&
    Number.isFinite(rate) &&
    rate >= 0 &&
    rate <= 100;
  return (
    <div className={styles.kpi}>
      <p className={styles.kpiLabel}>KPI nộp đúng hạn</p>
      <strong className={valid ? styles.rate : styles.unavailable}>
        {valid
          ? `${rate}%`
          : noDenominator
            ? "Chưa có bài đến hạn"
            : "Tỷ lệ chưa khả dụng"}
      </strong>
      <p className={styles.fraction}>
        <strong>
          {progress.on_time_due} / {progress.due_obligations}
        </strong>{" "}
        lượt phải nộp đã đến hạn.
      </p>
      {valid && (
        <progress
          className={styles.progress}
          max={100}
          value={rate}
          aria-label={`Tỷ lệ nộp đúng hạn · ${title}`}
          aria-valuetext={`${rate}% · ${progress.on_time_due} trên ${progress.due_obligations} lượt phải nộp đã đến hạn`}
        />
      )}
    </div>
  );
}

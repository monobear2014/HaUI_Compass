"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import styles from "./lecturer.module.css";

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
  source: string;
  as_of: string;
  minimum_cohort: number;
  classes: {
    class_id: string;
    title: string;
    suppressed: boolean;
    enrollment_count: number | null;
    progress: Progress | null;
  }[];
};

export default function LecturerPage() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
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
      .then(setData)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Không tải được dữ liệu.",
          );
      });
    return () => controller.abort();
  }, [attempt]);
  return (
    <main className={styles.page} lang="vi">
      <header className={styles.header}>
        <Link href="/learn" className={styles.brand}>
          <Icon name="compass" size={24} /> HaUI Compass
        </Link>
        <span className={styles.role}>Không gian giảng viên</span>
      </header>
      <div className={styles.heading}>
        <p className={styles.eyebrow}>THEO DÕI LỚP HỌC</p>
        <h1>Tiến độ lớp học</h1>
        <p>Theo dõi lượt nộp bài và tỷ lệ đúng hạn của từng lớp.</p>
      </div>
      <aside className={styles.context} aria-label="Thông tin dữ liệu">
        <span className={styles.simulated}>
          <Icon name="book" size={16} /> Dữ liệu Canvas mô phỏng
        </span>
        {data && (
          <p>
            Mốc quan sát cố định:{" "}
            <time dateTime={data.as_of}>
              {new Date(data.as_of).toLocaleString("vi-VN", {
                timeZone: "Asia/Ho_Chi_Minh",
              })}
            </time>{" "}
            (UTC+7)
          </p>
        )}
        <p>
          Đây là snapshot mô phỏng, không phải bằng chứng cải thiện thực nghiệm.
        </p>
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
              setAttempt(attempt + 1);
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
          <div className={styles.classes}>
            {data.classes.map((course) => (
              <section
                key={course.class_id}
                className={styles.card}
                aria-labelledby={`class-${course.class_id}`}
              >
                <div className={styles.cardHeading}>
                  <h2 id={`class-${course.class_id}`}>{course.title}</h2>
                  {!course.suppressed && course.progress && (
                    <span className={styles.enrollment}>
                      {course.enrollment_count} sinh viên
                    </span>
                  )}
                </div>
                {course.suppressed || !course.progress ? (
                  <div className={styles.suppressed}>
                    <Icon name="alert" size={20} />
                    <div>
                      <strong>Thống kê được bảo vệ</strong>
                      <p>Ẩn thống kê để bảo vệ nhóm quá nhỏ.</p>
                    </div>
                  </div>
                ) : (
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

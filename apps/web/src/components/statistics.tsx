"use client";

import Link from "next/link";
import { date, minutes, time } from "@/lib/api";
import { studyStatistics } from "@/lib/study-statistics";
import { usePreferences } from "./preferences";
import { useWorkspace } from "./workspace";
import { Icon } from "./icons";
import styles from "./statistics.module.css";

export function Statistics() {
  const { context, history, recommendation, refresh, loading } = useWorkspace();
  const { language } = usePreferences();
  const vi = language === "vi";
  const locale = vi ? "vi-VN" : "en-GB";
  if (!context) return null;
  const stats = studyStatistics(context, history);
  const rec = recommendation?.recommendation;
  const next =
    rec?.kind === "recommendation"
      ? context.tasks.find(
          (task) => task.id === rec.task_id && task.status !== "completed",
        )
      : undefined;
  const hours = (seconds: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
      seconds / 3600,
    );
  const weekday = (instant: string) =>
    date(instant, { weekday: "short" }, locale);
  const riskLevel = (id: string) =>
    recommendation?.assignment_risks.find((risk) => risk.assignment_id === id)
      ?.level;
  const riskText = (level?: string) =>
    ({
      high: vi ? "Rủi ro cao" : "High risk",
      medium: vi ? "Cần chú ý" : "Needs attention",
      low: vi ? "Trong tầm kiểm soát" : "On track",
      unknown: vi ? "Chưa đủ dữ liệu" : "Not enough data",
    })[level || "unknown"] || (vi ? "Chưa đủ dữ liệu" : "Not enough data");
  const revisions = history.slice(-4);
  const maxSeconds = Math.max(3600, ...stats.days.map((day) => day.seconds));
  return (
    <div className={styles.page} data-language={language}>
      <header className={styles.heading}>
        <div>
          <p>
            {date(
              context.now,
              { weekday: "long", day: "numeric", month: "long" },
              locale,
            )}
          </p>
          <h1>
            {vi
              ? "Việc học của bạn, rõ ràng hơn."
              : "Your learning, at a glance."}
          </h1>
        </div>
        <button
          className={styles.refresh}
          disabled={loading}
          onClick={() => void refresh()}
          aria-label={vi ? "Làm mới tổng quan" : "Refresh overview"}
        >
          <Icon name="refresh" size={18} />
        </button>
      </header>

      <section
        className={`${styles.card} ${styles.progressCard}`}
        aria-labelledby="progress-title"
      >
        <div className={styles.progressSummary}>
          <div>
            <h2 id="progress-title" className={styles.question}>
              {vi ? "Tôi đang ở đâu?" : "Where am I now?"}
            </h2>
            <p className={styles.fraction}>
              <strong data-testid="completed-tasks">{stats.completed}</strong>
              <span>
                {" "}
                / {stats.total} {vi ? "việc đã hoàn thành" : "tasks completed"}
              </span>
              <span className={styles.percentage}>
                {" "}
                · {stats.percent === null ? "—" : `${stats.percent}%`}
              </span>
            </p>
          </div>
          <div className={styles.weekSummary}>
            <p>
              <strong data-testid="planned-hours">
                {hours(stats.plannedSeconds)}
              </strong>{" "}
              {vi ? "giờ dự kiến tuần này" : "planned hours this week"}
            </p>
            <span>
              {vi
                ? "Không phải thời gian học thực tế."
                : "Not actual recorded study time."}
            </span>
          </div>
        </div>
        {stats.percent === null ? (
          <p className={styles.small}>
            {vi ? "Chưa có việc để tính tiến độ." : "No tasks to measure yet."}
          </p>
        ) : (
          <div
            className={styles.overallTrack}
            role="progressbar"
            aria-label={
              vi ? "Tiến độ hoàn thành việc học" : "Study task completion"
            }
            aria-valuenow={stats.percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span style={{ width: `${stats.percent}%` }} />
          </div>
        )}
        <p className={styles.progressNote}>
          {stats.inProgress} {vi ? "đang làm" : "in progress"} ·{" "}
          {stats.total - stats.completed - stats.inProgress}{" "}
          {vi ? "chưa bắt đầu" : "not started"}
          <span>
            {vi
              ? "Tiến độ công việc, không phải điểm môn học."
              : "Task progress, not a course grade."}
          </span>
        </p>
      </section>

      <div className={styles.dailyGrid}>
        <section
          className={`${styles.card} ${styles.todayCard}`}
          aria-labelledby="today-title"
          data-testid="overview-today"
        >
          <div className={styles.cardHeading}>
            <div>
              <p className={styles.question}>
                {vi ? "Hôm nay nên học gì?" : "What should I do today?"}
              </p>
              <h2 id="today-title" className={styles.title}>
                {vi ? "Kế hoạch hôm nay" : "Today's plan"}
              </h2>
            </div>
            <Link className={styles.todayAction} href="/today">
              {vi ? "Mở việc hôm nay" : "Open Today"}
              <Icon name="arrow" size={14} />
            </Link>
          </div>
          {stats.todayBlocks.length ? (
            <>
              <ol className={styles.todaySessions}>
                {stats.todayBlocks.slice(0, 3).map((block, index) => (
                  <li
                    key={`${block.task_id}-${block.starts_at}-${index}`}
                    data-completed={block.task.status === "completed"}
                  >
                    <span
                      className={styles.sessionState}
                      aria-label={
                        block.task.status === "completed"
                          ? vi
                            ? "Đã hoàn thành"
                            : "Completed"
                          : block.task.status === "in_progress"
                            ? vi
                              ? "Đang làm"
                              : "In progress"
                            : vi
                              ? "Chưa bắt đầu"
                              : "Not started"
                      }
                    >
                      <Icon
                        name={
                          block.task.status === "completed" ? "check" : "clock"
                        }
                        size={16}
                      />
                    </span>
                    <time dateTime={block.starts_at}>
                      {time(block.starts_at, locale)}
                    </time>
                    <div>
                      <strong>{block.task.title}</strong>
                      <small>
                        {block.task.course} ·{" "}
                        {minutes(
                          (Date.parse(block.ends_at) -
                            Date.parse(block.starts_at)) /
                            1000,
                        )}{" "}
                        {vi ? "phút dự kiến" : "planned min"}
                      </small>
                    </div>
                  </li>
                ))}
              </ol>
              <Link className={styles.more} href="/plan">
                {stats.todayBlocks.length > 3
                  ? vi
                    ? `Xem cả ${stats.todayBlocks.length} phiên hôm nay`
                    : `View all ${stats.todayBlocks.length} sessions today`
                  : vi
                    ? "Xem cả tuần"
                    : "View the week"}
                <Icon name="arrow" size={14} />
              </Link>
            </>
          ) : (
            <div className={styles.empty}>
              <p>
                {stats.plan
                  ? vi
                    ? "Hôm nay chưa có phiên học được xếp giờ."
                    : "No sessions scheduled today."
                  : vi
                    ? "Chưa có kế hoạch được lưu."
                    : "No saved plan yet."}
              </p>
              <Link href="/plan">
                {vi ? "Lập kế hoạch tuần" : "Make a weekly plan"}
                <Icon name="arrow" size={14} />
              </Link>
            </div>
          )}
          <section
            className={styles.suggestion}
            aria-labelledby="suggestion-title"
          >
            <Icon name="compass" size={22} />
            <div>
              <h3 id="suggestion-title">
                {vi ? "HaUI Compass gợi ý" : "HaUI Compass suggests"}
              </h3>
              <p>
                {next
                  ? vi
                    ? `Bắt đầu với “${next.title}”.`
                    : `Start with “${next.title}”.`
                  : vi
                    ? "Chưa có việc được gợi ý lúc này."
                    : "There is no suggested task right now."}
              </p>
              {next && (
                <span>
                  {next.course} · {minutes(next.estimated_duration_seconds)}{" "}
                  {vi ? "phút ước tính" : "estimated min"}
                </span>
              )}
            </div>
          </section>
        </section>

        <section
          className={styles.card}
          aria-labelledby="deadlines-title"
          data-testid="overview-deadlines"
        >
          <p className={styles.question}>
            {vi ? "Sắp đến hạn gì?" : "What is coming next?"}
          </p>
          <h2 id="deadlines-title" className={styles.title}>
            {vi ? "Hạn nộp gần nhất" : "Deadlines"}
          </h2>
          {stats.deadlines.length ? (
            <ul className={styles.deadlines}>
              {stats.deadlines.slice(0, 3).map((assignment) => (
                <li key={assignment.assignment_id}>
                  <Icon name="plan" size={19} />
                  <div>
                    <strong>{assignment.title}</strong>
                    <small>{assignment.course}</small>
                    <span
                      className={styles.deadlineDate}
                      data-overdue={
                        Date.parse(assignment.deadline) <
                        Date.parse(context.now)
                      }
                    >
                      {date(
                        assignment.deadline,
                        {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                        locale,
                      )}
                      {Date.parse(assignment.deadline) <
                        Date.parse(context.now) && (
                        <> · {vi ? "Đã qua hạn" : "Overdue"}</>
                      )}
                    </span>
                    <span
                      className={styles.risk}
                      data-level={
                        riskLevel(assignment.assignment_id) || "unknown"
                      }
                    >
                      {riskText(riskLevel(assignment.assignment_id))}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.empty}>
              {vi
                ? "Không còn bài tập cần theo dõi hạn nộp."
                : "No open assignment deadlines."}
            </p>
          )}
          <Link className={styles.more} href="/academic">
            {stats.deadlines.length > 3
              ? vi
                ? `Xem tất cả ${stats.deadlines.length} bài tập`
                : `See all ${stats.deadlines.length} assignments`
              : vi
                ? "Mở môn học & bài tập"
                : "Open assignments"}
            <Icon name="arrow" size={14} />
          </Link>
        </section>
      </div>

      <section aria-labelledby="courses-title">
        <div className={styles.sectionHeading}>
          <h2 id="courses-title">
            {vi ? "Các môn đang học" : "Your current courses"}
          </h2>
          <Link href="/academic">
            {vi ? "Quản lý môn học" : "Manage courses"}
            <Icon name="arrow" size={14} />
          </Link>
        </div>
        {stats.courses.length ? (
          <div className={styles.courses}>
            {stats.courses.map((course, index) => (
              <article
                className={`${styles.card} ${styles.course}`}
                key={course.name}
              >
                <span
                  className={styles.courseAccent}
                  style={{
                    background: ["#c8aedb", "#91ada2", "#d7c57d", "#dcaa97"][
                      index % 4
                    ],
                  }}
                />
                <span className={styles.muted}>
                  {course.assignments} {vi ? "bài tập" : "assignments"}
                </span>
                <h3>{course.name}</h3>
                <div className={styles.courseProgress}>
                  <span>
                    {course.completed}/{course.total}{" "}
                    {vi ? "việc đã xong" : "tasks done"}
                  </span>
                  <strong>
                    {course.percent === null ? "—" : `${course.percent}%`}
                  </strong>
                </div>
                {course.percent === null ? (
                  <p className={styles.small}>
                    {vi
                      ? "Chưa có việc được chia nhỏ."
                      : "No study tasks added yet."}
                  </p>
                ) : (
                  <progress
                    max={100}
                    value={course.percent}
                    aria-label={`${course.name}: ${course.percent}%`}
                  />
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className={`${styles.card} ${styles.empty}`}>
            <p>
              {vi
                ? "Chưa có môn học trong không gian này."
                : "No courses in this workspace yet."}
            </p>
            <Link href="/academic">
              {vi ? "Thêm bài tập đầu tiên" : "Add your first assignment"}
              <Icon name="plus" size={15} />
            </Link>
          </div>
        )}
      </section>

      <details className={styles.analytics} data-testid="overview-analytics">
        <summary>
          {vi
            ? "Xem thống kê & lịch sử kế hoạch"
            : "View statistics & plan history"}
          <Icon name="arrow" size={16} />
        </summary>
        <div className={styles.analyticsGrid}>
          <section className={styles.card} aria-labelledby="hours-title">
            <div className={styles.cardHeading}>
              <div>
                <p className={styles.question}>
                  {vi ? "Kế hoạch mới nhất" : "Latest saved plan"}
                </p>
                <h2 id="hours-title" className={styles.title}>
                  {vi ? "Thời gian dự kiến" : "Scheduled study hours"}
                </h2>
              </div>
              <Link href="/plan">
                {vi ? "Mở kế hoạch" : "Open plan"}
                <Icon name="arrow" size={14} />
              </Link>
            </div>
            <p className={styles.small}>
              {date(
                stats.days[0].start,
                { day: "numeric", month: "short" },
                locale,
              )}{" "}
              –{" "}
              {date(
                stats.days[6].start,
                { day: "numeric", month: "short" },
                locale,
              )}{" "}
              · {vi ? "Theo ngày tại Hà Nội" : "Calendar days in Hanoi"}
            </p>
            <dl
              className={styles.chart}
              aria-label={
                vi ? "Số giờ được xếp theo ngày" : "Scheduled hours by day"
              }
            >
              {stats.days.map((day) => (
                <div key={day.start}>
                  <dt>{weekday(day.start)}</dt>
                  <dd>
                    <span>{hours(day.seconds)}h</span>
                    <div className={styles.track} aria-hidden="true">
                      <i
                        style={{
                          height: `${(day.seconds / maxSeconds) * 100}%`,
                        }}
                      />
                    </div>
                  </dd>
                </div>
              ))}
            </dl>
            {!stats.blocks.length && (
              <p className={styles.empty}>
                {vi
                  ? "Chưa có phiên học được xếp trong tuần này."
                  : "No study sessions scheduled this week."}
              </p>
            )}
          </section>
          <section className={styles.card} aria-labelledby="revisions-title">
            <div className={styles.cardHeading}>
              <div>
                <p className={styles.question}>
                  {vi
                    ? "Kế hoạch thay đổi ra sao?"
                    : "How has my plan changed?"}
                </p>
                <h2 id="revisions-title" className={styles.title}>
                  {vi ? "Lịch sử điều chỉnh" : "Plan revisions"}
                </h2>
              </div>
              <Link href="/history">
                {vi ? "Xem lịch sử" : "View history"}
                <Icon name="arrow" size={14} />
              </Link>
            </div>
            {revisions.length ? (
              <ol className={styles.roadmap}>
                {revisions.map((plan, index) => (
                  <li
                    key={plan.record_id}
                    className={
                      index === revisions.length - 1 ? styles.current : ""
                    }
                  >
                    <span className={styles.node}>
                      {index === revisions.length - 1 ? (
                        <span />
                      ) : (
                        <Icon name="check" size={13} />
                      )}
                    </span>
                    <strong>
                      {vi ? "Bản" : "Revision"} {plan.revision}
                    </strong>
                    <small>
                      {date(
                        plan.saved_at,
                        { day: "numeric", month: "short" },
                        locale,
                      )}
                    </small>
                  </li>
                ))}
              </ol>
            ) : (
              <p className={styles.empty}>
                {vi
                  ? "Các lần điều chỉnh sẽ xuất hiện sau khi bạn lưu kế hoạch."
                  : "Revisions will appear after you save a plan."}
              </p>
            )}
          </section>
        </div>
      </details>
      <details className={styles.sources}>
        <summary>
          {vi
            ? "Số liệu này được tính như thế nào?"
            : "How are these numbers calculated?"}
        </summary>
        <p>
          {vi
            ? "Tiến độ = số việc có trạng thái hoàn thành / tổng số việc hiện có; không phải điểm môn học. Phiên hôm nay và thời gian tuần lấy từ kế hoạch mới nhất, tách theo ngày tại múi giờ Hà Nội. Dấu hoàn thành lấy từ trạng thái công việc, không phải nút đánh dấu nhanh. Gợi ý và rủi ro lấy từ hệ thống; không suy đoán điểm thi. Bảng điểm, GPA và tín chỉ chưa được kết nối."
            : "Progress is completed tasks divided by current tasks, not a course grade. Today's sessions and weekly hours come from the latest saved plan, clipped to calendar days in Hanoi. Completion marks reflect task status, not quick-toggle checkboxes. Suggestions and risk come from the recommendation service; exam results are not inferred. Transcript, GPA and credit data are not connected."}
        </p>
      </details>
    </div>
  );
}

"use client";

import { usePreferences } from "../preferences";
import { content } from "./content";
import { BrowserFrame, CIcon, PanelTitle } from "./primitives";
import styles from "./compass.module.css";

export function TodayPreview() {
  const { language } = usePreferences();
  const vi = language === "vi";
  return (
    <>
      <PanelTitle icon="clock">
        {vi ? "Việc nên làm tiếp theo" : "Your next action"}
      </PanelTitle>
      <div className={styles.previewMeta}>
        <span>
          {vi ? "CƠ SỞ DỮ LIỆU · BÀI TẬP DEMO" : "DATABASES · DEMO ASSIGNMENT"}
        </span>
        <span className={styles.warningPill}>
          {vi ? "Cần chú ý deadline" : "Deadline needs attention"}
        </span>
      </div>
      <div className={`${styles.taskPreview} ${styles.taskActive}`}>
        <span className={styles.taskRadio} />
        <div>
          <strong>
            {vi ? "Phác thảo mô hình dữ liệu" : "Draft the relational schema"}
          </strong>
          <small>
            <CIcon name="clock" size={12} />
            {vi
              ? "Một phiên tập trung · 45 phút"
              : "One focused session · 45 min"}
          </small>
        </div>
      </div>
      <details className={styles.citation}>
        <summary>
          <CIcon name="eye" size={14} />
          {vi ? "Vì sao nên bắt đầu ở đây?" : "Why start with this?"}
          <CIcon name="plus" size={13} />
        </summary>
        <p>
          {vi
            ? "Ví dụ minh họa: deadline đến gần và bài tập còn nhiều việc. Bắt đầu với một bước cụ thể giúp giảm áp lực; dữ liệu và lý do thực tế được xem trong Việc hôm nay."
            : "Illustrative example: the deadline is approaching and work remains. A concrete first step reduces pressure; see Today's work for actual data and reasons."}
        </p>
      </details>
    </>
  );
}

export function PlannerPreview() {
  const { language } = usePreferences();
  const vi = language === "vi";
  return (
    <>
      <PanelTitle icon="plan">
        {vi ? "Kế hoạch tuần" : "Weekly plan"}
      </PanelTitle>
      <div className={styles.previewMeta}>
        <span>
          {vi ? "XẾP THEO KHUNG GIỜ RẢNH" : "PLANNED AROUND YOUR FREE TIME"}
        </span>
        <code>{vi ? "Bản đề xuất" : "Proposal"}</code>
      </div>
      <div className={`${styles.taskPreview} ${styles.taskActive}`}>
        <span className={styles.taskRadio} />
        <div>
          <strong>
            {vi ? "Phác thảo mô hình dữ liệu" : "Draft the relational schema"}
          </strong>
          <small>
            <CIcon name="clock" size={12} />
            {vi ? "Thứ hai · 19:00–19:45" : "Monday · 19:00–19:45"}
          </small>
        </div>
      </div>
      <div className={styles.taskPreview}>
        <span className={styles.taskRadio} />
        <div>
          <strong>
            {vi ? "Kiểm thử ràng buộc dữ liệu" : "Test data constraints"}
          </strong>
          <small>
            <CIcon name="clock" size={12} />
            {vi ? "Thứ ba · 19:00–19:30" : "Tuesday · 19:00–19:30"}
          </small>
        </div>
      </div>
      <span className={styles.sourcePill}>
        <CIcon name="check" size={13} />
        {vi ? "Bạn xem lại và xác nhận" : "Review and confirm first"}
      </span>
    </>
  );
}

export function CitedPreview({ compact = false }: { compact?: boolean }) {
  const { language } = usePreferences();
  const c = content[language];
  return (
    <div className={styles.citedPreview}>
      {!compact && (
        <PanelTitle icon="chat">
          {language === "vi" ? "Hỏi đáp tài liệu" : "Document Q&A"}
        </PanelTitle>
      )}
      <div className={styles.questionBubble}>
        <CIcon name="quote" size={16} />
        <p>{c.question}</p>
      </div>
      <div className={styles.answerBubble}>
        <p>{c.answer}</p>
        <details className={styles.citation}>
          <summary>
            <CIcon name="file" size={14} />
            {c.source}
            <CIcon name="plus" size={13} />
          </summary>
          <p>{c.sourceExcerpt}</p>
        </details>
      </div>
    </div>
  );
}

export function ReflectionPreview() {
  const { language } = usePreferences();
  const vi = language === "vi";
  return (
    <>
      <PanelTitle icon="reflect">
        {vi ? "Phản hồi sau học" : "Reflect after studying"}
      </PanelTitle>
      <div className={styles.reflectionStats}>
        <div>
          <small>{vi ? "Dự kiến" : "Estimated"}</small>
          <strong>45 {vi ? "phút" : "min"}</strong>
        </div>
        <div>
          <small>{vi ? "Đã học" : "Actual"}</small>
          <strong>60 {vi ? "phút" : "min"}</strong>
        </div>
      </div>
      <div className={styles.noteBox}>
        <CIcon name="reflect" />
        <div>
          <strong>
            {vi ? "Phần nào cần thêm thời gian?" : "What needs more time?"}
          </strong>
          <p>
            {vi
              ? "Mô hình dữ liệu khó hơn dự kiến. Xem lại phần việc còn lại trước khi đề xuất kế hoạch mới."
              : "The data model was harder than expected. Review the remaining work before requesting a new plan."}
          </p>
        </div>
      </div>
      <span className={styles.sourcePill}>
        <CIcon name="check" size={13} />
        {vi ? "Chọn tín hiệu bạn muốn lưu" : "Select signals before saving"}
      </span>
    </>
  );
}

export function BreakdownPreview() {
  const { language } = usePreferences();
  const vi = language === "vi";
  return (
    <>
      <PanelTitle icon="spark">
        {vi ? "Chia nhỏ assignment" : "Break down an assignment"}
      </PanelTitle>
      <p className={styles.previewMuted}>
        Database Mini Project ·{" "}
        {vi ? "Gợi ý minh họa" : "Illustrative suggestions"}
      </p>
      {(vi
        ? [
            "Đọc yêu cầu và ghi lại giả định",
            "Phác thảo mô hình dữ liệu",
            "Tạo dữ liệu mẫu và kiểm thử",
          ]
        : [
            "Read requirements and note assumptions",
            "Draft a data model",
            "Create sample data and test",
          ]
      ).map((title, i) => (
        <div className={styles.taskPreview} key={title}>
          <span className={styles.taskRadio} />
          <div>
            <strong>{title}</strong>
            <small>
              {[20, 45, 30][i]}{" "}
              {vi ? "phút · có thể sửa ước lượng" : "min · editable estimate"}
            </small>
          </div>
        </div>
      ))}
      <span className={styles.sourcePill}>
        <CIcon name="check" size={13} />
        {vi
          ? "Chỉ thêm các bước bạn xác nhận"
          : "Only confirmed steps become tasks"}
      </span>
    </>
  );
}

export function CoursesPreview() {
  const { language } = usePreferences();
  const vi = language === "vi";
  return (
    <>
      <PanelTitle icon="book">
        {vi ? "Môn học & bài tập" : "Courses & assignments"}
      </PanelTitle>
      <div className={styles.syllabusFile}>
        <span className={styles.iconTile}>
          <CIcon name="file" />
        </span>
        <div>
          <strong>{vi ? "Cơ sở dữ liệu" : "Databases"}</strong>
          <p className={styles.previewMuted}>Database Mini Project</p>
        </div>
      </div>
      <div className={styles.previewTags}>
        <span className={styles.sourcePill}>
          {vi ? "Nhập tay" : "Manual entry"}
        </span>
        <span className={styles.neutralPill}>CSV / JSON</span>
      </div>
      <p className={styles.previewMuted}>
        {vi
          ? "Deadline và ước lượng do bạn cung cấp. Không phải dữ liệu LMS chính thức."
          : "Deadlines and estimates are student-provided, not official LMS data."}
      </p>
    </>
  );
}

export function DoingPreview() {
  const { language } = usePreferences();
  const vi = language === "vi";
  return (
    <>
      <PanelTitle icon="clock">
        {vi ? "Ghi nhận phiên học" : "Record a study session"}
      </PanelTitle>
      <p className={styles.previewMuted}>
        {vi ? "Phác thảo mô hình dữ liệu" : "Draft the relational schema"}
      </p>
      <div className={styles.timer}>
        45 <small>{vi ? "phút" : "min"}</small>
      </div>
      <div className={styles.sourcePill}>
        <CIcon name="check" size={14} />
        {vi ? "Thời gian thực tế bạn nhập" : "Actual time you enter"}
      </div>
    </>
  );
}

export function ReplanPreview() {
  const { language } = usePreferences();
  const vi = language === "vi";
  return (
    <>
      <PanelTitle icon="reflect">
        {vi ? "Xem thay đổi kế hoạch" : "Review plan changes"}
      </PanelTitle>
      <div className={styles.reflectionStats}>
        <div>
          <small>{vi ? "Trước" : "Before"}</small>
          <strong>{vi ? "Thứ ba" : "Tuesday"}</strong>
        </div>
        <div>
          <small>{vi ? "Đề xuất mới" : "Proposal"}</small>
          <strong>{vi ? "Thứ tư" : "Wednesday"}</strong>
        </div>
      </div>
      <div className={styles.noteBox}>
        <CIcon name="plan" />
        <div>
          <strong>
            {vi ? "Khung giờ đã thay đổi" : "Availability changed"}
          </strong>
          <p>
            {vi
              ? "Xem phần việc được chuyển và lý do. Đề xuất chưa được áp dụng cho đến khi bạn xác nhận."
              : "Review moved tasks and reasons. The proposal is not applied until you confirm."}
          </p>
        </div>
      </div>
    </>
  );
}

export function ProductPreview({ index }: { index: number }) {
  return (
    <BrowserFrame>
      <div className={styles.previewCanvas}>
        {index === 0 ? (
          <TodayPreview />
        ) : index === 1 ? (
          <PlannerPreview />
        ) : index === 2 ? (
          <ReflectionPreview />
        ) : index === 3 ? (
          <BreakdownPreview />
        ) : (
          <CitedPreview />
        )}
      </div>
    </BrowserFrame>
  );
}

export function StepPreview({ index }: { index: number }) {
  return (
    <BrowserFrame>
      <div className={styles.stepCanvas}>
        {index === 0 ? (
          <CoursesPreview />
        ) : index === 1 ? (
          <TodayPreview />
        ) : index === 2 ? (
          <PlannerPreview />
        ) : index === 3 ? (
          <DoingPreview />
        ) : index === 4 ? (
          <ReflectionPreview />
        ) : (
          <ReplanPreview />
        )}
      </div>
    </BrowserFrame>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { StudyDocument, DocumentStudyProgress } from "@/lib/documents";
import { fileSize } from "@/lib/documents";
import { usePreferences } from "../preferences";
import { Icon } from "../icons";
import { ToolArtwork } from "./document-journey";
import styles from "./learning-home.module.css";

type LearningDocument = StudyDocument & { progress: DocumentStudyProgress };

export function LearningHome({
  name,
  documents,
}: {
  name: string;
  documents: LearningDocument[];
}) {
  const { language } = usePreferences();
  const vi = language === "vi";
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const visible = useMemo(
    () =>
      documents.filter(
        (doc) =>
          doc.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()) &&
          (filter === "all" || doc.kind === filter),
      ),
    [documents, query, filter],
  );
  const recent = [...documents].sort((a, b) =>
    (b.progress.updatedAt || b.createdAt).localeCompare(
      a.progress.updatedAt || a.createdAt,
    ),
  )[0];
  return (
    <div className={styles.page}>
      <header className={styles.welcome}>
        <div>
          <p className={styles.eyebrow}>
            {vi ? "MỘT CHÚT MỖI NGÀY" : "A LITTLE EVERY DAY"}
          </p>
          <h1>{vi ? "Hôm nay, mình học gì?" : "What will you learn today?"}</h1>
          <p>
            {vi
              ? `Chào ${name}. Bắt đầu từ tài liệu của bạn, theo nhịp của bạn.`
              : `Hi ${name}. Your materials, your pace.`}
          </p>
        </div>
        <span className={styles.welcomeArt}>
          <Icon name="compass" size={54} />
          <span className={styles.spark}>✦</span>
        </span>
      </header>
      <section
        className={styles.start}
        aria-label={vi ? "Điểm bắt đầu" : "Start here"}
      >
        <div>
          <span className={styles.eyebrow}>
            {recent
              ? vi
                ? "TIẾP NỐI VIỆC HỌC"
                : "PICK UP WHERE YOU LEFT OFF"
              : vi
                ? "GÓC HỌC TẬP CỦA BẠN"
                : "YOUR STUDY CORNER"}
          </span>
          <h2>
            {recent?.name ||
              (vi
                ? "Mang tài liệu vào. Bắt đầu học."
                : "Bring a file. Start learning.")}
          </h2>
          <p>
            {recent
              ? vi
                ? recent.kind === "pdf"
                  ? "Mở bản gốc để tiếp tục đọc tài liệu của bạn."
                  : "Đọc, ôn thẻ và tự kiểm tra trong cùng một bộ học tập."
                : recent.kind === "pdf"
                  ? "Open the original file to continue reading."
                  : "Read, review flashcards and recall in one study set."
              : vi
                ? "Thêm bài giảng hoặc ghi chú để tạo bộ học tập đầu tiên."
                : "Add lecture notes or a reading to create your first study set."}
          </p>
          <Link
            className="primary"
            href={
              recent
                ? `/study-set/${recent.id}`
                : "/onboarding/upload?next=%2Flearn"
            }
          >
            {recent
              ? vi
                ? "Tiếp tục học"
                : "Continue learning"
              : vi
                ? "Thêm tài liệu"
                : "Add materials"}
            <Icon name="arrow" size={17} />
          </Link>
        </div>
        <span className={styles.startArt}>
          <ToolArtwork kind="book" />
        </span>
      </section>
      <div className={styles.sectionHead}>
        <h2>{vi ? "Bộ học tập của bạn" : "Your study sets"}</h2>
        <span>
          {documents.length} {vi ? "tài liệu" : "materials"}
        </span>
      </div>
      <div className={styles.toolbar}>
        <label className={styles.search}>
          <Icon name="search" size={17} />
          <input
            type="search"
            aria-label={vi ? "Tìm tài liệu" : "Search materials"}
            placeholder={
              vi ? "Tìm tài liệu của bạn…" : "Search your materials…"
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label={vi ? "Loại tài liệu" : "Material type"}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">
            {vi ? "Tất cả tài liệu" : "All materials"}
          </option>
          <option value="text">TXT / Markdown</option>
          <option value="pdf">PDF</option>
        </select>
        <Link className="secondary" href="/onboarding/upload?next=%2Flearn">
          <Icon name="plus" size={16} />
          {vi ? "Thêm tài liệu" : "Add materials"}
        </Link>
      </div>
      <div className={styles.sets}>
        <Link className={styles.create} href="/onboarding/upload?next=%2Flearn">
          <span>
            <Icon name="plus" size={25} />
          </span>
          <strong>{vi ? "Tạo bộ học tập" : "Create a study set"}</strong>
          <small>
            {vi
              ? "Bắt đầu với PDF, TXT hoặc Markdown"
              : "Start with PDF, TXT or Markdown"}
          </small>
        </Link>
        {visible.map((doc, index) => {
          const total =
            doc.kind === "text" ? Math.max(doc.headings.length, 1) : 0;
          const percent = total
            ? Math.round((doc.progress.mastered.length / total) * 100)
            : null;
          return (
            <article className={styles.set} key={doc.id}>
              <Link href={`/study-set/${doc.id}`} className={styles.setMain}>
                <span className={styles.setIcon} data-color={index % 4}>
                  <Icon name="book" size={25} />
                </span>
                <h3>{doc.name}</h3>
                <p>
                  {doc.kind === "pdf" ? "PDF" : "TXT / Markdown"} ·{" "}
                  {fileSize(doc.size)} ·{" "}
                  {total
                    ? `${total} ${vi ? "chủ đề" : "topics"}`
                    : vi
                      ? "Đọc bản gốc"
                      : "Original document"}
                </p>
                <div className={styles.progressLabel}>
                  <span>{vi ? "Đã nhớ" : "Mastered"}</span>
                  <strong>{percent === null ? "—" : `${percent}%`}</strong>
                </div>
                <div className={styles.track}>
                  <span style={{ width: `${percent || 0}%` }} />
                </div>
              </Link>
              <div className={styles.setActions}>
                <Link href={`/documents/${doc.id}`}>
                  {vi ? "Đọc tài liệu" : "Read material"}
                </Link>
                <Link href={`/study-set/${doc.id}`}>
                  {vi ? "Mở bộ học tập" : "Open study set"}
                  <Icon name="arrow" size={14} />
                </Link>
              </div>
            </article>
          );
        })}
      </div>
      {query && visible.length === 0 && (
        <p role="status" className={styles.empty}>
          {vi
            ? "Không có tài liệu phù hợp. Thử tên khác nhé."
            : "No matching materials. Try another name."}
        </p>
      )}
      <section
        className={styles.connections}
        aria-label={vi ? "Sắp xếp việc học" : "Organize your learning"}
      >
        <h2>{vi ? "Để việc học nhẹ nhàng hơn" : "Make room for learning"}</h2>
        <div>
          {[
            {
              href: "/today",
              icon: "today",
              title: vi ? "Việc hôm nay" : "Today's focus",
              detail: vi
                ? "Chọn việc cần làm trước."
                : "Find your next priority.",
            },
            {
              href: "/plan",
              icon: "plan",
              title: vi ? "Kế hoạch tuần" : "Weekly plan",
              detail: vi
                ? "Dành thời gian cho từng việc."
                : "Make time for each task.",
            },
            {
              href: "/knowledge",
              icon: "ask",
              title: vi ? "Hỏi tài liệu" : "Ask with sources",
              detail: vi
                ? "Tra cứu kho tài liệu mẫu, có nguồn."
                : "Ask the demo library with citations.",
            },
          ].map((item) => (
            <Link key={item.href} href={item.href}>
              <span>
                <Icon name={item.icon} size={23} />
              </span>
              <div>
                <h3>{item.title}</h3>
                <p>{item.detail}</p>
              </div>
              <Icon name="arrow" size={17} />
            </Link>
          ))}
        </div>
      </section>
      <details className={styles.notice}>
        <summary>
          {vi ? "Về dữ liệu trong bản demo" : "About this demo's data"}
        </summary>
        <p>
          {vi
            ? "Tài liệu và tiến độ tự đánh giá được lưu riêng theo tài khoản. Kế hoạch, bài tập và thống kê sử dụng kịch bản học tập mẫu. Trợ lý Compass trong bộ học tập trả lời từ tệp TXT/Markdown đã tải lên và dẫn nguồn để đối chiếu. PDF hỗ trợ đọc bản gốc; chưa trích xuất văn bản."
            : "Your materials and self-reported progress belong to your account. Planning, assignments and statistics use sample learning scenarios. Compass in each study set answers from that uploaded TXT/Markdown file with citations. PDF supports reading the original; text extraction is not connected."}
        </p>
      </details>
    </div>
  );
}

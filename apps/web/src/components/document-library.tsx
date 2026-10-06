"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePreferences } from "./preferences";
import { type StudyDocument, fileSize } from "@/lib/documents";
import styles from "./document-library.module.css";

export function DocumentLibrary() {
  const { language } = usePreferences();
  const vi = language === "vi";
  const [documents, setDocuments] = useState<StudyDocument[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/documents", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("unavailable");
        const result = await response.json();
        if (!controller.signal.aborted) {
          setDocuments(result.documents);
          setFailed(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [attempt]);
  return (
    <section
      className={`${styles.library} panel`}
      aria-label={vi ? "Tài liệu đã tải lên" : "Uploaded documents"}
    >
      <div className={styles.header}>
        <div>
          <h2>{vi ? "Tài liệu của bạn" : "Your documents"}</h2>
          <p>
            {vi
              ? "Mở lại để đọc. Hỏi đáp bên dưới dùng bộ nguồn có sẵn, không dùng các tệp này."
              : "Reopen your files to read. Q&A below uses its existing corpus, not these uploads."}
          </p>
        </div>
        <Link
          className="button secondary"
          href="/onboarding/upload?next=%2Fknowledge"
        >
          {vi ? "Thêm tài liệu" : "Add documents"}
        </Link>
      </div>
      {failed ? (
        <p role="alert">
          {vi ? "Chưa tải được danh sách." : "Could not load your documents."}{" "}
          <button
            className="button secondary"
            onClick={() => {
              setFailed(false);
              setAttempt((value) => value + 1);
            }}
          >
            {vi ? "Thử lại" : "Retry"}
          </button>
        </p>
      ) : documents === null ? (
        <p role="status">{vi ? "Đang tải…" : "Loading…"}</p>
      ) : documents.length ? (
        <details>
          <summary>
            {vi
              ? `Xem ${documents.length} tài liệu`
              : `View ${documents.length} documents`}
          </summary>
          <ul>
            {documents.map((doc) => (
              <li key={doc.id}>
                <Link href={`/documents/${doc.id}`}>
                  <span>{doc.name}</span>
                  <small>{fileSize(doc.size)}</small>
                </Link>
                <Link
                  className={styles.studyLink}
                  href={`/study-set/${doc.id}`}
                >
                  {vi ? "Ôn tập" : "Study"}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      ) : (
        <p>
          {vi
            ? "Chưa có tài liệu. Bạn có thể thử với tài liệu mẫu ở trang tải lên."
            : "No uploads yet. You can try a sample on the upload page."}
        </p>
      )}
    </section>
  );
}

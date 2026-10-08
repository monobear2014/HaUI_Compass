"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePreferences } from "../preferences";
import { CIcon, CompassPreferences } from "./primitives";
import {
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENT_FILES,
  SAMPLE_DOCUMENT,
  fileSize,
  type StudyDocument,
} from "@/lib/documents";
import base from "./onboarding.module.css";
import styles from "./document-journey.module.css";

function JourneyFrame({
  back,
  children,
  ready = false,
}: {
  back: string;
  children: React.ReactNode;
  ready?: boolean;
}) {
  const { language, theme } = usePreferences();
  return (
    <main
      className={`${base.page} ${styles.page} ${ready ? styles.readyPage : ""}`}
      data-theme={theme}
    >
      <Link className={base.back} href={back}>
        <CIcon name="back" />
        {language === "vi" ? "Quay lại" : "Back"}
      </Link>
      <div className={base.preferences}>
        <CompassPreferences />
      </div>
      {children}
      <footer className={styles.brand}>HaUI Compass</footer>
    </main>
  );
}

function JourneyDrawing() {
  return (
    <svg
      className={styles.drawing}
      viewBox="0 0 180 110"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <ellipse
        cx="91"
        cy="100"
        rx="47"
        ry="3"
        fill="currentColor"
        opacity=".12"
        stroke="none"
      />
      <path
        d="M28 83c20-8 39-4 58 5 21-9 40-13 62-5l-5-42c-19-7-39-3-57 5-18-8-39-12-58-5z"
        fill="var(--onboard-card)"
      />
      <path d="M86 47v41M39 51l27 3m-26 8 30 4m-29 8 23 3m42-14 26-7m-26 19 26-7" />
      <circle cx="103" cy="31" r="24" fill="var(--onboard-bg)" />
      <path d="m114 19-7 17-17 7 7-17zM114 19 97 26l10 10" />
      <path d="M55 15v12m-6-6h12M146 21v8m-4-4h8m-125 35-8 4m130 6 10 3" />
    </svg>
  );
}

const errorMessages: Record<string, [string, string]> = {
  file_count: [
    "Chọn từ 1 đến 3 tài liệu mỗi lần.",
    "Choose 1–3 files at a time.",
  ],
  file_size: [
    "Mỗi tài liệu cần có nội dung và không quá 5 MB.",
    "Each file must be non-empty and no larger than 5 MB.",
  ],
  ingestion_failed: [
    "Không thể xử lý tài liệu. Hãy kiểm tra nội dung và tải lại.",
    "Document ingestion failed. Check the content and upload again.",
  ],
  unsupported_format: [
    "Chỉ hỗ trợ PDF, TXT và Markdown (.md, .markdown).",
    "Only PDF, TXT and Markdown (.md, .markdown) are supported.",
  ],
  invalid_pdf: [
    "Tệp này không có định dạng PDF hợp lệ. Hãy chọn lại.",
    "This file does not have a valid PDF signature. Choose another file.",
  ],
  invalid_text: [
    "Tài liệu cần là văn bản UTF-8 có nội dung.",
    "Text files must contain readable UTF-8 text.",
  ],
  storage_full: [
    "Đã đạt giới hạn demo: 100 tài liệu hoặc 50 MB mỗi tài khoản.",
    "Demo storage limit reached: 100 files or 50 MB per account.",
  ],
  unauthorized: [
    "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.",
    "Your session has expired. Please sign in again.",
  ],
};

export function DocumentUpload({ nextPath }: { nextPath: string }) {
  const { language } = usePreferences();
  const vi = language === "vi";
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = encodeURIComponent(nextPath);
  function addFiles(selected: File[]) {
    if (busy) return;
    const combined = [...files];
    for (const file of selected) {
      if (!/\.(pdf|txt|md|markdown)$/i.test(file.name)) {
        setError("unsupported_format");
        return;
      }
      if (!file.size || file.size > MAX_DOCUMENT_BYTES) {
        setError("file_size");
        return;
      }
      if (
        !combined.some(
          (f) =>
            f.name === file.name &&
            f.size === file.size &&
            f.lastModified === file.lastModified,
        )
      )
        combined.push(file);
    }
    if (combined.length > MAX_DOCUMENT_FILES) {
      setError("file_count");
      return;
    }
    setError(null);
    setFiles(combined);
  }
  async function upload() {
    if (busy || !files.length) return;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      files.forEach((file) => body.append("files", file));
      const response = await fetch("/api/documents", {
        method: "POST",
        body,
        signal: AbortSignal.timeout(60_000),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "unavailable");
        setBusy(false);
        return;
      }
      const documents = result.documents as StudyDocument[];
      router.push(
        `/onboarding/ready?next=${next}&ids=${documents.map((doc) => doc.id).join(",")}`,
      );
    } catch {
      setError("unavailable");
      setBusy(false);
    }
  }
  return (
    <JourneyFrame back={nextPath}>
      <section className={styles.uploadContent}>
        <JourneyDrawing />
        <p className={styles.eyebrow}>
          {vi ? "GÓC HỌC TẬP CỦA BẠN" : "YOUR STUDY CORNER"}
        </p>
        <h1>
          {vi
            ? "Bắt đầu từ tài liệu của bạn."
            : "Start with your study material."}
        </h1>
        <p className={styles.subtitle}>
          {vi
            ? "Thêm bài giảng, ghi chú hoặc tài liệu bạn muốn học."
            : "Bring your lecture notes, readings, or something you want to learn."}
        </p>
        <div
          className={`${styles.dropzone} ${dragging ? styles.dragging : ""}`}
          aria-busy={busy}
          onDragOver={(event) => {
            event.preventDefault();
            if (!busy) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            addFiles(Array.from(event.dataTransfer.files));
          }}
        >
          <span className={styles.uploadIcon}>
            <CIcon name="up" size={28} />
          </span>
          <h2>{vi ? "Thả tài liệu vào đây" : "Drop your files here"}</h2>
          <p>
            {vi
              ? "hoặc chọn tài liệu từ máy tính"
              : "or choose files from your computer"}
          </p>
          <input
            className={styles.fileInput}
            ref={input}
            type="file"
            tabIndex={-1}
            aria-hidden="true"
            multiple
            accept=".pdf,.txt,.md,.markdown"
            disabled={busy}
            aria-label={vi ? "Tệp cần tải lên" : "Files to upload"}
            onChange={(event) => {
              addFiles(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
          />
          <button
            className={styles.choose}
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            <CIcon name="plus" size={17} />
            {vi ? "Chọn tài liệu" : "Choose files"}
          </button>
          <span className={styles.hint}>
            PDF, TXT, MD ·{" "}
            {vi ? "Tối đa 3 tệp, 5 MB/tệp" : "Up to 3 files, 5 MB each"}
          </span>
        </div>
        {files.length > 0 && (
          <ul
            className={styles.selected}
            aria-label={vi ? "Tài liệu đã chọn" : "Selected files"}
          >
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`}>
                <CIcon name="file" />
                <span>
                  <strong>{file.name}</strong>
                  <small>{fileSize(file.size)}</small>
                </span>
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`${vi ? "Bỏ" : "Remove"} ${file.name}`}
                  onClick={() => {
                    setFiles(files.filter((_, i) => i !== index));
                    setError(null);
                  }}
                >
                  <CIcon name="close" size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p className={styles.error} role="alert">
            {errorMessages[error]?.[vi ? 0 : 1] ??
              (vi
                ? "Chưa thể lưu tài liệu. Vui lòng thử lại."
                : "Could not save your files. Please try again.")}
            {error === "unauthorized" && (
              <>
                {" "}
                <Link href={`/login?next=${next}`}>
                  {vi ? "Đăng nhập" : "Sign in"}
                </Link>
              </>
            )}
          </p>
        )}
        <div className={styles.uploadActions}>
          <button
            className={styles.primary}
            disabled={busy || !files.length}
            onClick={upload}
          >
            {busy
              ? vi
                ? "Đang lưu tài liệu…"
                : "Saving your files…"
              : vi
                ? "Tải lên và tiếp tục"
                : "Upload & continue"}
            <CIcon name="arrow" size={18} />
          </button>
          <button
            className={styles.textButton}
            disabled={busy}
            onClick={() =>
              addFiles([
                new File([SAMPLE_DOCUMENT.content], SAMPLE_DOCUMENT.name, {
                  type: "text/markdown",
                  lastModified: 0,
                }),
              ])
            }
          >
            {vi ? "Thử với tài liệu mẫu" : "Try a sample document"}
          </button>
          <Link
            className={`${styles.skip} ${busy ? styles.busyLink : ""}`}
            aria-disabled={busy}
            tabIndex={busy ? -1 : undefined}
            href={nextPath}
            onClick={(event) => {
              if (busy) event.preventDefault();
            }}
          >
            {vi ? "Để sau, vào không gian học" : "I'll do this later"}
          </Link>
        </div>
        <p className={styles.privacy}>
          <CIcon name="shield" size={14} />
          {vi
            ? "Tài liệu được lưu theo tài khoản. Khi hỏi Compass, các đoạn liên quan được dùng để tạo câu trả lời."
            : "Files are saved under your account. When you ask Compass, relevant excerpts are used to generate an answer."}
        </p>
        <details className={styles.disclosure}>
          <summary>
            {vi
              ? "Tài liệu này sẽ dùng như thế nào?"
              : "How will my files be used?"}
          </summary>
          <p>
            {vi
              ? "Bạn có thể mở PDF và đọc TXT/Markdown. Trợ lý trả lời từ tài liệu của bạn, hỗ trợ PDF có văn bản với trích dẫn theo trang. OCR và tự tạo kế hoạch chưa được hỗ trợ."
              : "You can reopen PDFs and read TXT/Markdown. Compass answers from your files, including text-based PDFs with page citations. OCR and automatic planning are not supported."}
          </p>
        </details>
      </section>
    </JourneyFrame>
  );
}

export function ToolArtwork({ kind }: { kind: string }) {
  return (
    <svg
      viewBox="0 0 180 130"
      fill="none"
      stroke="#292b28"
      strokeWidth="2.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <ellipse cx="92" cy="115" rx="42" ry="5" fill="#292b28" stroke="none" />
      {kind === "chat" ? (
        <>
          <path
            d="M77 65c0-17 15-30 34-30s34 13 34 30c0 9-4 16-10 22l8 13-21-6c-33 8-45-13-45-29z"
            fill="white"
          />
          <path
            d="M35 52c0-17 15-30 34-30s34 13 34 30S88 82 69 82l-25 8 7-14c-10-5-16-13-16-24z"
            fill="white"
          />
          <path d="M53 52h1m14 0h1m14 0h1" strokeWidth="6" />
        </>
      ) : kind === "book" ? (
        <>
          <path d="M34 33h13v68h86V33h13v73H34z" fill="white" />
          <path
            d="M90 32c-14-10-29-12-43-7v69c15-5 29-3 43 7 14-10 28-12 43-7V25c-14-5-29-3-43 7z"
            fill="white"
          />
          <path d="M90 32v69M57 39l20 7m-20 10 20 7m-20 10 20 7m23-34 20-7m-20 24 20-7m-20 24 20-7" />
        </>
      ) : kind === "notes" ? (
        <>
          <rect x="61" y="36" width="75" height="67" rx="5" fill="white" />
          <rect x="44" y="22" width="75" height="67" rx="5" fill="white" />
          <path d="M64 14v35a7 7 0 0 1-14 0V25a4 4 0 0 1 8 0v23m8 16h36m-36 11h26" />
        </>
      ) : (
        <>
          <rect x="37" y="45" width="73" height="49" rx="4" fill="white" />
          <rect x="55" y="23" width="73" height="49" rx="4" fill="white" />
          <rect x="75" y="54" width="73" height="49" rx="4" fill="white" />
          <path d="M68 40h1m-1 11h20m0 19h1m-1 11h41m-41 10h28" />
        </>
      )}
    </svg>
  );
}

export function DocumentReady({
  documents,
  nextPath,
}: {
  documents: StudyDocument[];
  nextPath: string;
}) {
  const { language } = usePreferences();
  const vi = language === "vi";
  const first = documents[0];
  const headings = documents
    .flatMap((doc) => doc.headings.map((heading) => ({ heading, doc })))
    .slice(0, 4);
  const steps = headings.length
    ? headings
    : documents.map((doc) => ({ doc, heading: doc.name }));
  return (
    <JourneyFrame
      ready
      back={`/onboarding/upload?next=${encodeURIComponent(nextPath)}`}
    >
      <div className={styles.readyContent}>
        <header className={styles.readyHeader}>
          <JourneyDrawing />
          <h1>{vi ? "Cùng bắt đầu học nhé!" : "Let's start learning!"}</h1>
          <p className={styles.subtitle}>
            {vi
              ? "Tài liệu của bạn đã sẵn sàng. Chọn một điểm bắt đầu."
              : "Your files are ready. Pick a place to start."}
          </p>
        </header>
        <div className={styles.columns}>
          <section className={styles.panel}>
            <div className={styles.panelHeading}>
              <h2>{vi ? "Tài liệu của bạn" : "Learning material"}</h2>
              <span
                className={styles.check}
                aria-label={vi ? "Đã lưu" : "Saved"}
              >
                <CIcon name="check" size={22} />
              </span>
            </div>
            <ul className={styles.fileRows}>
              {documents.map((doc) => (
                <li key={doc.id}>
                  <Link href={`/documents/${doc.id}`}>
                    <CIcon name="file" size={20} />
                    <span title={doc.name}>{doc.name}</span>
                    <CIcon name="check" size={14} />
                  </Link>
                </li>
              ))}
            </ul>
            <p className={styles.panelNote}>
              {vi
                ? "Đã lưu vào tài khoản của bạn."
                : "Saved under your account."}
            </p>
          </section>
          <section className={styles.panel}>
            <div className={styles.panelHeading}>
              <h2>{vi ? "Lộ trình đọc" : "Reading plan"}</h2>
              <span className={styles.suggestion}>
                {vi ? "Gợi ý" : "Suggested"}
              </span>
            </div>
            <ol className={styles.readingRows}>
              {steps.map(({ heading, doc }, i) => (
                <li key={`${doc.id}-${i}`}>
                  <Link href={`/documents/${doc.id}`}>
                    <span className={styles.number}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span title={heading}>{heading}</span>
                    <CIcon name="arrow" size={15} />
                  </Link>
                </li>
              ))}
            </ol>
            <p className={styles.panelNote}>
              {headings.length
                ? vi
                  ? "Các mục lấy từ tiêu đề trong tài liệu Markdown. Bạn tự chọn thứ tự học."
                  : "Sections from your Markdown headings. Choose your own learning order."
                : vi
                  ? "Bắt đầu bằng việc đọc tài liệu. Trợ lý hỗ trợ PDF có văn bản; chưa hỗ trợ OCR hoặc tạo kế hoạch AI."
                  : "Start by reading your files. The assistant supports text-based PDF, without OCR or AI planning."}
            </p>
            <Link className={styles.planLink} href="/plan">
              {vi ? "Mở kế hoạch tuần" : "Open weekly plan"}
              <CIcon name="arrow" size={16} />
            </Link>
            {first.kind === "text" && (
              <Link className={styles.planLink} href={`/study-set/${first.id}`}>
                {vi ? "Mở bộ học tập" : "Open study set"}
                <CIcon name="arrow" size={16} />
              </Link>
            )}
          </section>
          <section className={`${styles.panel} ${styles.toolsPanel}`}>
            <div className={styles.panelHeading}>
              <h2>{vi ? "Công cụ học" : "Study tools"}</h2>
              <span className={styles.toolsCount}>
                {first.kind === "text"
                  ? vi
                    ? "4 khả dụng"
                    : "4 available"
                  : vi
                    ? "2 khả dụng"
                    : "2 available"}
              </span>
            </div>
            <div className={styles.tools}>
              {[
                {
                  kind: "recall",
                  label: vi ? "Tự kiểm tra" : "Recall quiz",
                  color: "lavender",
                  enabled: first.kind === "text",
                  href: `/study-set/${first.id}?mode=recall`,
                },
                {
                  kind: "book",
                  label: vi ? "Đọc tài liệu" : "Read",
                  color: "yellow",
                  enabled: true,
                  href: `/documents/${first.id}`,
                },
                {
                  kind: "notes",
                  label: vi ? "Lập kế hoạch" : "Plan my week",
                  color: "green",
                  enabled: true,
                  href: "/plan",
                },
                {
                  kind: "cards",
                  label: "Flashcards",
                  color: "cyan",
                  enabled: first.kind === "text",
                  href: `/study-set/${first.id}?mode=cards`,
                },
              ].map((tool) => {
                const contents = (
                  <>
                    <span className={`${styles.artwork} ${styles[tool.color]}`}>
                      <ToolArtwork kind={tool.kind} />
                    </span>
                    <span className={styles.toolLabel}>
                      <CIcon
                        name={
                          tool.kind === "book"
                            ? "book"
                            : tool.kind === "recall"
                              ? "check"
                              : "file"
                        }
                        size={16}
                      />
                      {tool.label}
                    </span>
                    {!tool.enabled && (
                      <small>
                        {(tool.kind === "cards" || tool.kind === "recall") &&
                        first.kind === "pdf"
                          ? vi
                            ? "Chưa tạo từ PDF"
                            : "Not generated from PDF"
                          : vi
                            ? "Sắp có"
                            : "Coming soon"}
                      </small>
                    )}
                  </>
                );
                return tool.enabled ? (
                  <Link
                    className={styles.tool}
                    key={tool.kind}
                    href={tool.href}
                  >
                    {contents}
                  </Link>
                ) : (
                  <button className={styles.tool} key={tool.kind} disabled>
                    {contents}
                  </button>
                );
              })}
            </div>
            <p className={styles.panelNote}>
              {vi
                ? "Mở bộ học tập để hỏi Trợ lý Compass về tài liệu TXT/Markdown của bạn."
                : "Open your study set to ask Compass about your TXT/Markdown material."}
            </p>
          </section>
        </div>
        <div className={styles.continueRow}>
          <Link className={styles.primary} href={`/study-set/${first.id}`}>
            {vi ? "Tiếp tục" : "Continue"}
          </Link>
          <span className={styles.handwritten}>
            <svg
              viewBox="0 0 115 46"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              aria-hidden="true"
            >
              <path d="M110 27C70 45 43 27 50 10c7-18 32-3 21 13C56 45 22 41 7 23m0 0 1 13m-1-13 14 1" />
            </svg>
            {vi ? "Bắt đầu hành trình của bạn" : "Start your learning journey"}
          </span>
        </div>
      </div>
    </JourneyFrame>
  );
}

// Render only headings and plain paragraphs, never uploaded HTML.
function ReadingContent({
  text,
  markdown,
}: {
  text: string;
  markdown: boolean;
}) {
  if (!markdown) return <pre className={styles.textContent}>{text}</pre>;
  const blocks: React.ReactNode[] = [];
  let paragraph: string[] = [];
  let code: string[] = [];
  let fence: string | null = null;
  function flush() {
    if (!paragraph.length) return;
    blocks.push(<p key={blocks.length}>{paragraph.join("\n")}</p>);
    paragraph = [];
  }
  for (const line of text.split(/\r?\n/)) {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (
      marker &&
      (!fence || (marker[0] === fence[0] && marker.length >= fence.length))
    ) {
      flush();
      if (fence) {
        blocks.push(
          <pre key={blocks.length}>
            <code>{code.join("\n")}</code>
          </pre>,
        );
        code = [];
        fence = null;
      } else fence = marker;
    } else if (fence) code.push(line);
    else {
      const heading = /^ {0,3}(#{1,6})[\t ]+(.+?)[\t ]*#*[\t ]*$/.exec(line);
      if (heading) {
        flush();
        blocks.push(
          heading[1].length === 1 ? (
            <h2 key={blocks.length}>{heading[2]}</h2>
          ) : (
            <h3 key={blocks.length}>{heading[2]}</h3>
          ),
        );
      } else if (!line.trim()) flush();
      else paragraph.push(line);
    }
  }
  flush();
  if (fence)
    blocks.push(
      <pre key={blocks.length}>
        <code>{code.join("\n")}</code>
      </pre>,
    );
  return <div className="reader-content">{blocks}</div>;
}

export function DocumentReader({
  document,
  text,
  initialPage = 1,
}: {
  document: StudyDocument;
  text: string | null;
  initialPage?: number;
}) {
  const { language } = usePreferences();
  const vi = language === "vi";
  return (
    <article className="material-reader">
      <Link className="secondary" href={`/study-set/${document.id}`}>
        <CIcon name="back" size={17} />
        {vi ? "Quay lại bộ học tập" : "Back to study set"}
      </Link>
      <p className={styles.eyebrow}>
        {vi ? "TÀI LIỆU CỦA BẠN" : "YOUR DOCUMENT"} · {fileSize(document.size)}
      </p>
      <h1>{document.name}</h1>
      <p className={styles.subtitle}>
        {vi
          ? "Tài liệu bạn tải lên · không phải nguồn đã được HaUI xác minh."
          : "Your upload · not a source verified by HaUI."}
      </p>
      {document.kind === "text" && (
        <Link className="secondary" href={`/study-set/${document.id}`}>
          {vi ? "Ôn tập tài liệu này" : "Study this material"}
          <CIcon name="arrow" size={17} />
        </Link>
      )}
      {text !== null ? (
        <ReadingContent
          text={text}
          markdown={/\.(md|markdown)$/i.test(document.name)}
        />
      ) : (
        <>
          <iframe
            className={styles.pdf}
            src={`/api/documents/${document.id}#page=${initialPage}`}
            title={document.name}
          />
          <p className={styles.panelNote}>
            {vi
              ? "Nếu trình duyệt không hiển thị PDF, hãy mở hoặc tải tệp bên dưới."
              : "If your browser cannot display the PDF, open or download the file below."}
          </p>
        </>
      )}
      <a
        className="secondary"
        href={`/api/documents/${document.id}`}
        target="_blank"
        rel="noreferrer"
      >
        {vi ? "Mở tệp gốc" : "Open original file"}
        <CIcon name="arrow" size={17} />
      </a>
    </article>
  );
}

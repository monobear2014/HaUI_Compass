"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import type { DocumentStudyProgress, StudyDocument } from "@/lib/documents";
import { usePreferences } from "../preferences";
import { CIcon } from "./primitives";
import styles from "./study-set.module.css";
import { ToolArtwork } from "./document-journey";
import { AssistantPanel } from "./assistant-panel";
import type {
  ChatMessage,
  ChatSession,
  MessageCitation,
} from "@/lib/compass-chat-types";

type Topic = { id: string; title: string; content: string };
type Mode = "read" | "cards" | "recall";

function topicsFor(document: StudyDocument, text: string | null): Topic[] {
  if (!text || document.kind === "pdf") return [];
  if (!/\.(md|markdown)$/i.test(document.name)) {
    return [{ id: "topic-0", title: document.name, content: text.trim() }];
  }
  const headings: { title: string; contentStart: number; lineStart: number }[] =
    [];
  let fence: string | null = null;
  let offset = 0;
  for (const line of text.matchAll(/[^\n]*(?:\n|$)/g)) {
    if (!line[0]) continue;
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line[0])?.[1];
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length)
        fence = null;
    } else if (!fence) {
      const heading = /^ {0,3}#{1,6}[\t ]+(.+?)[\t ]*#*[\t ]*(?:\n|$)/.exec(
        line[0],
      );
      if (heading && headings.length < 12) {
        headings.push({
          title: heading[1].trim(),
          lineStart: offset,
          contentStart: offset + line[0].length,
        });
      }
    }
    offset += line[0].length;
  }
  if (!headings.length)
    return [
      {
        id: "topic-0",
        title: document.name,
        content: text.trim(),
      },
    ];
  return headings.map((heading, index) => {
    const next = headings[index + 1];
    const end = next ? next.lineStart : text.length;
    return {
      id: `topic-${index}`,
      title: heading.title.replace(/[\t ]+#+$/, "").trim(),
      content: text.slice(heading.contentStart, end).trim(),
    };
  });
}

export function StudySet({
  document,
  text,
  initialProgress,
  initialMode,
  initialSessions,
  initialMessages,
  initialSessionId,
}: {
  document: StudyDocument;
  text: string | null;
  initialProgress: DocumentStudyProgress;
  initialMode?: string;
  initialSessions: ChatSession[];
  initialMessages: ChatMessage[];
  initialSessionId?: string;
}) {
  const { language } = usePreferences();
  const vi = language === "vi";
  const topics = useMemo(() => topicsFor(document, text), [document, text]);
  const [covered, setCovered] = useState(initialProgress.covered);
  const [mastered, setMastered] = useState(initialProgress.mastered);
  const [active, setActive] = useState(() => {
    const index = topics.findIndex(
      (topic) => !initialProgress.mastered.includes(topic.id),
    );
    return Math.max(0, index);
  });
  const [mode, setMode] = useState<Mode>(
    initialMode === "cards" || initialMode === "recall" ? initialMode : "read",
  );
  const [answerShown, setAnswerShown] = useState(false);
  const [recall, setRecall] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [source, setSource] = useState<{
    content: string;
    heading: string | null;
  } | null>(null);
  const [sourceError, setSourceError] = useState(false);
  const sourceRef = useRef<HTMLElement>(null);
  const citationRequest = useRef(0);
  async function navigateCitation(citation: MessageCitation) {
    const request = ++citationRequest.current;
    setSource(null);
    if (citation.document_id !== document.id) {
      window.location.assign(
        `/study-set/${citation.document_id}?chunk=${citation.chunk_id}`,
      );
      return;
    }
    setSourceError(false);
    try {
      const response = await fetch(
        `/api/documents/${document.id}/chunks/${citation.chunk_id}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("source_unavailable");
      const result = await response.json();
      if (request !== citationRequest.current) return;
      setSource(result.chunk);
      chooseMode("read");
      const index = topics.findIndex(
        (topic) => topic.title === citation.heading,
      );
      if (index >= 0) setActive(index);
      // Wait for the source card to render before scrolling and focusing it.
      requestAnimationFrame(() =>
        sourceRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        }),
      );
      requestAnimationFrame(() =>
        sourceRef.current?.focus({ preventScroll: true }),
      );
    } catch {
      if (request === citationRequest.current) setSourceError(true);
    }
  }
  const topic = topics[active];
  const total = topics.length;
  const percent = total ? Math.round((mastered.length / total) * 100) : null;

  async function updateProgress(nextCovered: string[], nextMastered: string[]) {
    setSaving(true);
    setError(false);
    try {
      const response = await fetch(`/api/documents/${document.id}/progress`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ covered: nextCovered, mastered: nextMastered }),
      });
      if (!response.ok) throw new Error("Unable to save");
      const result = await response.json();
      setCovered(result.progress.covered);
      setMastered(result.progress.mastered);
      return true;
    } catch {
      setError(true);
      return false;
    } finally {
      setSaving(false);
    }
  }

  function chooseMode(next: Mode) {
    setMode(next);
    setAnswerShown(false);
    setRecall("");
  }

  async function mark(status: "covered" | "mastered") {
    if (!topic) return;
    const nextCovered = [...new Set([...covered, topic.id])];
    const nextMastered =
      status === "mastered"
        ? [...new Set([...mastered, topic.id])]
        : mastered.filter((id) => id !== topic.id);
    const saved = await updateProgress(nextCovered, nextMastered);
    if (saved && status === "mastered" && active < topics.length - 1) {
      setActive(active + 1);
      setAnswerShown(false);
      setRecall("");
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.back} href="/learn">
          <CIcon name="back" size={17} />
          {vi ? "Tất cả bộ học tập" : "All study sets"}
        </Link>
        <p className={styles.eyebrow}>
          {vi ? "BỘ HỌC TẬP CỦA BẠN" : "YOUR STUDY SET"}
        </p>
        <h1>{document.name}</h1>
        <p className={styles.subtitle}>
          {vi
            ? "Đọc theo từng mục, tự nhớ lại rồi đánh dấu phần đã nắm."
            : "Read one section, recall it in your own words and track what you know."}
        </p>
        <div className={styles.headerActions}>
          <Link className={styles.secondary} href={`/documents/${document.id}`}>
            <CIcon name="book" size={17} />
            {vi ? "Đọc tài liệu gốc" : "Read original material"}
          </Link>
          <Link
            className={styles.secondary}
            href="/onboarding/upload?next=%2Flearn"
          >
            <CIcon name="plus" size={17} />
            {vi ? "Thêm tài liệu" : "Add materials"}
          </Link>
        </div>
      </header>

      <section
        className={styles.progressCard}
        aria-label={vi ? "Tiến độ bộ học tập" : "Study set progress"}
      >
        <div className={styles.progressStats}>
          <div>
            <span>{vi ? "Chủ đề" : "Topics"}</span>
            <strong>{total}</strong>
          </div>
          <div>
            <span>{vi ? "Đã xem" : "Covered"}</span>
            <strong>{covered.length}</strong>
          </div>
          <div>
            <span>{vi ? "Đã nhớ" : "Mastered"}</span>
            <strong>{mastered.length}</strong>
          </div>
          <strong className={styles.percent}>
            {percent === null ? "—" : `${percent}%`}
          </strong>
        </div>
        <div
          className={styles.track}
          role="progressbar"
          aria-label={vi ? "Tiến độ chủ đề đã nhớ" : "Topics mastered"}
          aria-valuenow={percent ?? 0}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span style={{ width: `${percent ?? 0}%` }} />
        </div>
        <p>
          {vi
            ? "Tiến độ tự đánh giá của bạn, không phải điểm bài kiểm tra."
            : "Your self-reported progress, not a quiz grade."}
        </p>
      </section>

      <div className={styles.layout}>
        <section
          className={styles.main}
          aria-label={vi ? "Hoạt động học" : "Learning activity"}
        >
          {sourceError && (
            <p role="alert" className={styles.error}>
              Chưa mở được nguồn. Hãy thử lại.
            </p>
          )}
          {source && (
            <section
              ref={sourceRef}
              tabIndex={-1}
              className={styles.sourceHighlight}
              aria-label="Đoạn nguồn được trích dẫn"
            >
              <h2>{source.heading ?? document.name}</h2>
              <pre className={styles.sourceText}>{source.content}</pre>
              <button
                className={styles.secondary}
                onClick={() => setSource(null)}
              >
                Đóng đoạn nguồn
              </button>
            </section>
          )}
          {topic ? (
            <>
              <section className={styles.recommendation}>
                <div className={styles.recommendationTop}>
                  <div>
                    <span className={styles.eyebrow}>
                      {vi ? "GỢI Ý TIẾP THEO" : "UP NEXT"}
                    </span>
                    <p>
                      {vi
                        ? `Chủ đề ${active + 1} / ${total}`
                        : `Topic ${active + 1} of ${total}`}
                    </p>
                    <h2>{topic.title}</h2>
                  </div>
                  {covered.includes(topic.id) && (
                    <span className={styles.done}>
                      {mastered.includes(topic.id)
                        ? vi
                          ? "Đã nhớ"
                          : "Mastered"
                        : vi
                          ? "Đã xem"
                          : "Covered"}
                    </span>
                  )}
                </div>
                <div
                  className={styles.modes}
                  role="group"
                  aria-label={vi ? "Cách học" : "Study mode"}
                >
                  {(
                    [
                      ["read", vi ? "Đọc" : "Read"],
                      ["cards", "Flashcards"],
                      ["recall", vi ? "Tự kiểm tra" : "Recall quiz"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      data-mode={id}
                      aria-pressed={mode === id}
                      className={mode === id ? styles.selectedMode : ""}
                      onClick={() => chooseMode(id)}
                    >
                      <span className={styles.modeArtwork}>
                        <ToolArtwork
                          kind={
                            id === "read"
                              ? "book"
                              : id === "cards"
                                ? "cards"
                                : "chat"
                          }
                        />
                      </span>
                      <span>
                        {label}
                        <small>
                          {id === "read"
                            ? vi
                              ? "Hiểu nội dung"
                              : "Understand"
                            : id === "cards"
                              ? vi
                                ? "Ôn từng chủ đề"
                                : "Review topics"
                              : vi
                                ? "Nhớ bằng lời của bạn"
                                : "Recall in your words"}
                        </small>
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              <section className={styles.activity} aria-live="polite">
                <div className={styles.activityHeading}>
                  <span className={styles.eyebrow}>
                    {mode === "read"
                      ? vi
                        ? "ĐỌC THEO MỤC"
                        : "GUIDED READING"
                      : mode === "cards"
                        ? vi
                          ? "THẺ ÔN TẬP"
                          : "FLASHCARD"
                        : vi
                          ? "GỢI NHỚ KHÔNG NHÌN TÀI LIỆU"
                          : "ACTIVE RECALL"}
                  </span>
                  <span>
                    {String(active + 1).padStart(2, "0")} /{" "}
                    {String(total).padStart(2, "0")}
                  </span>
                </div>
                {mode === "read" ? (
                  <>
                    <h2>{topic.title}</h2>
                    <pre className={styles.sourceText}>
                      {topic.content ||
                        (vi
                          ? "Mục này chưa có nội dung bên dưới tiêu đề."
                          : "There is no text under this heading yet.")}
                    </pre>
                    <button
                      className={styles.primary}
                      disabled={saving}
                      onClick={() => void mark("covered")}
                    >
                      {saving
                        ? vi
                          ? "Đang lưu…"
                          : "Saving…"
                        : vi
                          ? "Đã đọc mục này"
                          : "Mark as covered"}
                      <CIcon name="check" size={16} />
                    </button>
                  </>
                ) : mode === "cards" ? (
                  <>
                    <p className={styles.prompt}>{topic.title}</p>
                    {answerShown ? (
                      <pre className={styles.sourceText}>
                        {topic.content ||
                          (vi
                            ? "Không có nội dung trích xuất trong mục này."
                            : "No extracted text is available for this section.")}
                      </pre>
                    ) : (
                      <p className={styles.hint}>
                        {vi
                          ? "Hãy thử giải thích chủ đề này trước khi xem ghi chú trong tài liệu."
                          : "Try explaining this topic before revealing the source notes."}
                      </p>
                    )}
                    <div className={styles.actionRow}>
                      <button
                        className={styles.secondary}
                        onClick={() => setAnswerShown(!answerShown)}
                      >
                        {answerShown
                          ? vi
                            ? "Ẩn ghi chú"
                            : "Hide notes"
                          : vi
                            ? "Lật thẻ · xem ghi chú"
                            : "Flip card · reveal notes"}
                      </button>
                      {answerShown && (
                        <button
                          className={styles.primary}
                          disabled={saving}
                          onClick={() => void mark("mastered")}
                        >
                          {vi ? "Tôi đã nhớ" : "I remembered"}
                          <CIcon name="check" size={16} />
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <h2>
                      {vi
                        ? `Bạn sẽ giải thích “${topic.title}” như thế nào?`
                        : `How would you explain “${topic.title}”?`}
                    </h2>
                    <label className={styles.recallLabel}>
                      {vi
                        ? "Ghi nhanh điều bạn nhớ (không chấm điểm)"
                        : "Jot down what you recall (not graded)"}
                      <textarea
                        value={recall}
                        onChange={(event) => setRecall(event.target.value)}
                        rows={4}
                        placeholder={
                          vi ? "Viết bằng lời của bạn…" : "Use your own words…"
                        }
                      />
                    </label>
                    {answerShown && (
                      <pre className={styles.sourceText}>
                        {topic.content ||
                          (vi
                            ? "Không có nội dung trích xuất trong mục này."
                            : "No extracted text is available for this section.")}
                      </pre>
                    )}
                    <div className={styles.actionRow}>
                      <button
                        className={styles.secondary}
                        onClick={() => setAnswerShown(!answerShown)}
                      >
                        {answerShown
                          ? vi
                            ? "Ẩn ghi chú"
                            : "Hide notes"
                          : vi
                            ? "Đối chiếu với tài liệu"
                            : "Compare with source"}
                      </button>
                      {answerShown && (
                        <>
                          <button
                            className={styles.secondary}
                            disabled={saving}
                            onClick={() => void mark("covered")}
                          >
                            {vi ? "Cần ôn thêm" : "Review again"}
                          </button>
                          <button
                            className={styles.primary}
                            disabled={saving}
                            onClick={() => void mark("mastered")}
                          >
                            {vi ? "Đã nắm được" : "I know this"}
                            <CIcon name="check" size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
                {error && (
                  <p className={styles.error} role="alert">
                    {vi
                      ? "Chưa lưu được tiến độ. Kiểm tra kết nối rồi thử lại."
                      : "Progress was not saved. Check your connection and try again."}
                  </p>
                )}
              </section>

              <section className={styles.alternatives}>
                <h2>{vi ? "Học theo cách của bạn" : "Study your way"}</h2>
                <div className={styles.alternativeGrid}>
                  <button onClick={() => chooseMode("recall")}>
                    <CIcon name="check" size={18} />
                    {vi ? "Tự kiểm tra" : "Recall quiz"}
                  </button>
                  <button onClick={() => chooseMode("cards")}>
                    <CIcon name="file" size={18} />
                    Flashcards
                  </button>
                  <Link href="/plan">
                    <CIcon name="plan" size={18} />
                    {vi ? "Lập kế hoạch tuần" : "Weekly plan"}
                  </Link>
                </div>
              </section>
            </>
          ) : (
            <section className={styles.pdfNote}>
              <h2>
                {vi
                  ? "Tài liệu PDF đã sẵn sàng để đọc"
                  : "Your PDF is ready to read"}
              </h2>
              <p>
                {vi
                  ? "Bản demo có thể mở tệp PDF, nhưng chưa trích xuất văn bản để tạo chủ đề, flashcard hoặc bài tự kiểm tra."
                  : "This demo can open your PDF, but does not extract its text to create topics, flashcards or recall activities."}
              </p>
              <Link
                className={styles.primary}
                href={`/documents/${document.id}`}
              >
                {vi ? "Mở tài liệu" : "Open document"}
                <CIcon name="arrow" size={16} />
              </Link>
            </section>
          )}
          <p className={styles.trustNote}>
            {vi
              ? "Nội dung ôn tập trích nguyên văn từ tài liệu của bạn. Bạn có thể hỏi Trợ lý Compass và đối chiếu câu trả lời với nguồn."
              : "Review notes are taken directly from your file. Ask Compass and compare its answers with the cited sources."}
          </p>
        </section>

        <aside className={styles.sidebar}>
          <AssistantPanel
            document={document}
            initialSessions={initialSessions}
            initialMessages={initialMessages}
            initialSessionId={initialSessionId}
            onCitation={(citation) => void navigateCitation(citation)}
          />
          <section className={styles.topicPanel}>
            <div className={styles.panelHead}>
              <h2>{vi ? "Chủ đề trong tài liệu" : "Topics in this file"}</h2>
              <span>{total}</span>
            </div>
            {topics.length ? (
              <ol>
                {topics.map((item, index) => (
                  <li key={item.id}>
                    <button
                      className={active === index ? styles.activeTopic : ""}
                      onClick={() => {
                        setActive(index);
                        setAnswerShown(false);
                        setRecall("");
                      }}
                    >
                      <span
                        className={styles.topicStatus}
                        data-status={
                          mastered.includes(item.id)
                            ? "mastered"
                            : covered.includes(item.id)
                              ? "covered"
                              : "new"
                        }
                        aria-hidden="true"
                      >
                        {mastered.includes(item.id)
                          ? "✓"
                          : String(index + 1).padStart(2, "0")}
                      </span>
                      <span>{item.title}</span>
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className={styles.panelNote}>
                {vi
                  ? "Chưa có chủ đề được trích xuất từ tệp PDF này."
                  : "No topics have been extracted from this PDF."}
              </p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

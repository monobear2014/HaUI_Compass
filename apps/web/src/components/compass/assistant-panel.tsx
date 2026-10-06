"use client";
import { useEffect, useRef, useState } from "react";
import type { StudyDocument } from "@/lib/documents";
import type {
  ChatMessage,
  ChatSession,
  MessageCitation,
} from "@/lib/compass-chat-types";
import styles from "./assistant-panel.module.css";

type Props = {
  document: StudyDocument;
  initialSessions: ChatSession[];
  initialMessages: ChatMessage[];
  initialSessionId?: string;
  onCitation: (citation: MessageCitation) => void;
};
const actions = [
  [
    "✨ Tóm tắt tài liệu này",
    "Hãy tóm tắt tài liệu này, tập trung vào các ý chính và những nội dung quan trọng cần ghi nhớ.",
  ],
  [
    "💡 Giải thích chủ đề đang học",
    "Hãy giải thích các ý chính trong tài liệu này, dựa trên nội dung tài liệu.",
  ],
  [
    "🧠 Hỏi tôi để kiểm tra kiến thức",
    "Hãy đặt một câu hỏi để kiểm tra kiến thức dựa trên tài liệu này. Chờ tôi trả lời rồi đánh giá dựa trên tài liệu.",
  ],
];
async function api(path: string, body?: object) {
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "unavailable");
  return result;
}
function selectUrl(id: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("chat", id);
  window.history.replaceState(null, "", url);
}
export function AssistantPanel({
  document,
  initialSessions,
  initialMessages,
  initialSessionId,
  onCitation,
}: Props) {
  const [sessions, setSessions] = useState(initialSessions);
  const [sessionId, setSessionId] = useState(initialSessionId);
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState<{
    message: string;
    request_id: string;
  } | null>(null);
  const submitting = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const desktopLog = useRef<HTMLDivElement>(null);
  const mobileLog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    for (const ref of [desktopLog, mobileLog])
      ref.current?.scrollTo({
        top: ref.current.scrollHeight,
        behavior: "instant",
      });
  }, [messages, busy]);
  const ready = document.ingestionStatus === "ready";
  const statusText =
    document.ingestionStatus === "unsupported" || document.kind === "pdf"
      ? "Trợ lý hiện hỗ trợ TXT, MD và Markdown. PDF chưa được trích xuất văn bản."
      : document.ingestionStatus === "failed"
        ? "Chưa xử lý được tài liệu. Hãy kiểm tra nội dung và tải lại."
        : !ready
          ? "Đang xử lý tài liệu. Hãy tải lại trang sau ít phút."
          : "";
  async function newSession() {
    const result = await api(
      `/api/study-sets/${document.id}/chat/sessions`,
      {},
    );
    setSessions((old) => [result.session, ...old]);
    setSessionId(result.session.id);
    selectUrl(result.session.id);
    return result.session.id as string;
  }
  async function send(message: string, requestId = crypto.randomUUID()) {
    if (submitting.current || !message.trim() || !ready) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    const turn = { message: message.trim(), request_id: requestId };
    try {
      const id = sessionId ?? (await newSession());
      setMessages((old) =>
        old.some((row) => row.request_id === requestId)
          ? old
          : [
              ...old,
              {
                id: requestId,
                role: "user",
                content: turn.message,
                created_at: new Date().toISOString(),
                request_id: requestId,
                status: "pending",
                citations: [],
              },
            ],
      );
      setInput("");
      const result = await api(`/api/chat/sessions/${id}/messages`, {
        ...turn,
        active_document_id: document.id,
      });
      setMessages(result.messages);
      setRetry(null);
      setSessions((old) => {
        const current = old.find((row) => row.id === id);
        if (!current) return old;
        return [
          {
            ...current,
            title:
              current.title === "Cuộc trò chuyện mới"
                ? turn.message.slice(0, 60)
                : current.title,
            updated_at: new Date().toISOString(),
          },
          ...old.filter((row) => row.id !== id),
        ];
      });
    } catch (cause) {
      setRetry(turn);
      setMessages((old) =>
        old.map((row) =>
          row.request_id === requestId && row.role === "user"
            ? { ...row, status: "failed" }
            : row,
        ),
      );
      setError(
        cause instanceof Error && cause.message === "unauthorized"
          ? "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại."
          : cause instanceof Error && cause.message === "already_generating"
            ? "Compass đang trả lời trong phiên này. Hãy đợi rồi thử lại."
            : "Chưa nhận được câu trả lời. Kiểm tra kết nối rồi thử lại.",
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  async function switchSession(id: string) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api(`/api/chat/sessions/${id}/messages`);
      setMessages(result.messages);
      setSessionId(id);
      selectUrl(id);
      setRetry(null);
    } catch {
      setError("Chưa tải được lịch sử. Hãy thử lại.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  async function startNew() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      await newSession();
      setMessages([]);
      setRetry(null);
      setInput("");
    } catch {
      setError("Chưa tạo được cuộc trò chuyện. Hãy thử lại.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  const restoredFailed = messages.findLast(
    (row) =>
      row.role === "user" &&
      (row.status === "failed" || row.status === "pending"),
  );
  const retryTurn =
    retry ??
    (restoredFailed
      ? {
          message: restoredFailed.content,
          request_id: restoredFailed.request_id,
        }
      : null);
  function content(mobile: boolean) {
    return (
      <section className={styles.panel} aria-label="Trợ lý Compass">
        <header className={styles.header}>
          <div>
            <span className={styles.mark}>✦</span>
            <h2>Trợ lý Compass</h2>
          </div>
          {mobile && (
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              aria-label="Đóng trợ lý"
            >
              ×
            </button>
          )}
          <p>
            Đang hỏi: <strong>{document.name}</strong>
          </p>
          <div className={styles.controls}>
            <button
              type="button"
              disabled={busy}
              onClick={() => void startNew()}
            >
              + Cuộc trò chuyện mới
            </button>
            <label>
              <span className={styles.srOnly}>Lịch sử trò chuyện</span>
              <select
                value={sessionId ?? ""}
                disabled={busy}
                onChange={(event) => void switchSession(event.target.value)}
              >
                <option value="" disabled>
                  Lịch sử trò chuyện
                </option>
                {sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </header>
        <div
          ref={mobile ? mobileLog : desktopLog}
          className={styles.messages}
          role="log"
          aria-label="Hội thoại Compass"
          aria-live="polite"
          aria-busy={busy}
        >
          {!messages.length && (
            <div className={styles.intro}>
              <h3>Bạn muốn tìm hiểu gì?</h3>
              <p>Hỏi, giải thích và ôn tập từ tài liệu bạn đang học.</p>
              <div className={styles.actions}>
                {actions.map(([title, prompt]) => (
                  <button
                    key={title}
                    disabled={busy || !ready}
                    onClick={() => void send(prompt)}
                  >
                    {title}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((message) => (
            <article
              key={message.id}
              className={
                message.role === "user" ? styles.user : styles.assistant
              }
            >
              <small>{message.role === "user" ? "Bạn" : "Compass"}</small>
              <p>{message.content}</p>
              {!!message.citations.length && (
                <div className={styles.sources}>
                  <span>Nguồn</span>
                  {message.citations.map((citation) => (
                    <button
                      key={citation.index}
                      onClick={() => {
                        onCitation(citation);
                        dialog.current?.close();
                      }}
                      title={citation.excerpt}
                    >
                      [{citation.index}] {citation.filename}
                      {citation.heading ? ` · ${citation.heading}` : ""}
                    </button>
                  ))}
                </div>
              )}
              {message.status === "failed" && (
                <small>Chưa nhận được câu trả lời.</small>
              )}
            </article>
          ))}
          {busy && (
            <p className={styles.note} role="status">
              Compass đang xử lý…
            </p>
          )}
        </div>
        <footer className={styles.footer}>
          {statusText && (
            <p className={styles.note} role="status">
              {statusText}
            </p>
          )}
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          {retryTurn && !busy && (
            <button
              className={styles.retry}
              onClick={() => void send(retryTurn.message, retryTurn.request_id)}
            >
              Thử lại câu hỏi
            </button>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send(input);
            }}
          >
            <label>
              <span className={styles.srOnly}>Hỏi về tài liệu</span>
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                maxLength={2000}
                disabled={busy || !ready}
                rows={2}
                placeholder="Hỏi về tài liệu…"
              />
            </label>
            <button type="submit" disabled={busy || !ready || !input.trim()}>
              Gửi
            </button>
          </form>
          <small>
            Compass trả lời dựa trên tài liệu. Hãy đối chiếu các nguồn.
          </small>
        </footer>
      </section>
    );
  }
  return (
    <>
      <button
        className={styles.mobileTrigger}
        onClick={() => dialog.current?.showModal()}
      >
        ✦ Hỏi trợ lý
      </button>
      <div className={styles.desktop}>{content(false)}</div>
      <dialog ref={dialog} className={styles.dialog}>
        {content(true)}
      </dialog>
    </>
  );
}

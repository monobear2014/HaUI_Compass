"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePreferences } from "./preferences";
import styles from "./companion-rail.module.css";
import { PublicCourseMaterials } from "./public-course-materials";
import { ChatSourcePicker } from "./chat-source-picker";
import type { StudyDocument } from "@/lib/documents";

type Memory = {
  id: string;
  kind: string;
  content: string;
  confirmed_at: string;
};
type Citation = {
  title: string;
  source_url: string | null;
  page: number | null;
  section: string | null;
  source_type: string;
};
type Exchange = {
  id: string;
  question: string;
  course_id: string;
  document_id?: string | null;
  mode: string;
  created_at: string;
  response: {
    answer: string;
    citations: Citation[];
    agents: string[];
    basis: string;
    source: string;
    memory_used: number;
    fallback_reason: string | null;
    action: { href: string } | null;
  };
};
type Conversation = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};
type ConversationPage = {
  conversation: Conversation;
  exchanges: Exchange[];
  next_before: string | null;
};
type ConversationList = {
  account_id: string;
  conversations: Conversation[];
  next_offset: number | null;
};
class AssistantError extends Error {
  constructor(public status: number) {
    super("assistant_request_failed");
  }
}
const kinds = {
  learning_goal: ["Mục tiêu học", "Learning goal"],
  difficult_topic: ["Chủ đề thấy khó", "Difficult topic"],
  study_strategy: ["Cách học phù hợp", "Study strategy"],
  response_preference: ["Cách giải thích mong muốn", "Explanation preference"],
};
async function call<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/compass-api/companion${path}`, {
    method,
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(55000),
  });
  if (!response.ok) throw new AssistantError(response.status);
  return response.json();
}

export function CompanionRail({
  courseHint,
  onClose,
  documentHint,
  documents = [],
}: {
  courseHint?: string | null;
  onClose?: () => void;
  documentHint?: string | null;
  documents?: StudyDocument[];
}) {
  const selectionHint = documentHint ? `document:${documentHint}` : courseHint;
  const { language } = usePreferences();
  const vi = language === "vi";
  const c = (vn: string, en: string) => (vi ? vn : en);
  const [tab, setTab] = useState<"chat" | "memory" | "materials">("chat");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [olderLoading, setOlderLoading] = useState(false);
  const accountId = useRef("");
  const hint = useRef(selectionHint);
  const composer = useRef<HTMLTextAreaElement>(null);
  const pendingNew = useRef<string | null>(null);
  const pendingScroll = useRef<{ height: number; top: number } | null>(null);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState("auto");
  const [course, setCourse] = useState(selectionHint || "ai");
  useEffect(() => {
    hint.current = selectionHint;
    let active = true;
    if (selectionHint)
      queueMicrotask(() => {
        if (active) {
          setCourse(selectionHint);
          setMode(selectionHint.startsWith("document:") ? "auto" : "tutor");
        }
      });
    return () => {
      active = false;
    };
  }, [selectionHint]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState<{
    text: string;
    id: string;
    mode: string;
    course: string;
    conversation: string | null;
  } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [kind, setKind] = useState("study_strategy");
  const [content, setContent] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [note, setNote] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  const sending = useRef(false);
  function rememberSelection(id: string | null) {
    if (!accountId.current) return;
    try {
      const key = `compass-conversation:${accountId.current}`;
      if (id) localStorage.setItem(key, id);
      else localStorage.removeItem(key);
    } catch {}
  }
  useEffect(() => {
    let active = true;
    void (async () => {
      const migration = await fetch("/api/assistant/migrate-history", {
        method: "POST",
      });
      if (!migration.ok) throw new AssistantError(migration.status);
      const [data, listing] = await Promise.all([
        call<{ memories: Memory[] }>(""),
        call<ConversationList>("/conversations"),
      ]);
      let chosen: string | null = listing.conversations[0]?.id || null;
      try {
        const saved = localStorage.getItem(
          `compass-conversation:${listing.account_id}`,
        );
        if (
          saved &&
          /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(saved)
        )
          chosen = saved;
      } catch {}
      let page: ConversationPage | null = null;
      if (chosen) {
        try {
          page = await call<ConversationPage>(`/conversations/${chosen}`);
        } catch (error) {
          if (!(error instanceof AssistantError) || error.status !== 404)
            throw error;
          chosen = listing.conversations[0]?.id || null;
          if (chosen)
            page = await call<ConversationPage>(`/conversations/${chosen}`);
        }
      }
      if (!active) return;
      accountId.current = listing.account_id;
      setMemories(data.memories);
      setConversations(
        page &&
          !listing.conversations.some((row) => row.id === page.conversation.id)
          ? [page.conversation, ...listing.conversations]
          : listing.conversations,
      );
      setConversationId(chosen);
      rememberSelection(chosen);
      setExchanges(page?.exchanges || []);
      const last = page?.exchanges.at(-1);
      if (last && !hint.current) {
        setMode(last.mode);
        setCourse(
          last.document_id ? `document:${last.document_id}` : last.course_id,
        );
      }
      setNextBefore(page?.next_before || null);
      setNextOffset(listing.next_offset);
      setReady(true);
      setLoadError(false);
    })().catch(() => {
      if (active) setLoadError(true);
    });
    return () => {
      active = false;
    };
  }, [attempt]);
  useEffect(() => {
    const element = log.current;
    if (!element) return;
    if (pendingScroll.current) {
      const previous = pendingScroll.current;
      pendingScroll.current = null;
      element.scrollTop = previous.top + element.scrollHeight - previous.height;
    } else element.scrollTo({ top: element.scrollHeight, behavior: "instant" });
  }, [exchanges, tab]);
  async function createThread() {
    pendingNew.current ||= crypto.randomUUID();
    const conversation = await call<Conversation>("/conversations", "POST", {
      identifier: pendingNew.current,
    });
    pendingNew.current = null;
    setConversations((old) => [
      conversation,
      ...old.filter((row) => row.id !== conversation.id),
    ]);
    setConversationId(conversation.id);
    rememberSelection(conversation.id);
    setExchanges([]);
    setNextBefore(null);
    setInput("");
    setRetry(null);
    setHistoryOpen(false);
    setTab("chat");
    return conversation.id;
  }
  async function newConversation() {
    if (sending.current || olderLoading || !ready) return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      await createThread();
    } catch {
      setError(
        c(
          "Chưa tạo được cuộc trò chuyện. Hãy thử lại.",
          "Could not create a conversation. Please retry.",
        ),
      );
    } finally {
      sending.current = false;
      setBusy(false);
      requestAnimationFrame(() => composer.current?.focus());
    }
  }
  async function switchConversation(id: string) {
    if (sending.current || olderLoading) return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      const page = await call<ConversationPage>(`/conversations/${id}`);
      setConversationId(id);
      rememberSelection(id);
      setExchanges(page.exchanges);
      setNextBefore(page.next_before);
      const last = page.exchanges.at(-1);
      if (last) {
        setMode(last.mode);
        setCourse(
          last.document_id ? `document:${last.document_id}` : last.course_id,
        );
      }
      setInput("");
      setRetry(null);
      setHistoryOpen(false);
      setTab("chat");
    } catch {
      setError(
        c(
          "Chưa mở được cuộc trò chuyện. Hãy thử lại.",
          "Could not open this conversation. Please retry.",
        ),
      );
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  async function moreConversations() {
    if (nextOffset === null || historyLoading) return;
    setHistoryLoading(true);
    setError("");
    try {
      const page = await call<ConversationList>(
        `/conversations?offset=${nextOffset}`,
      );
      setConversations((old) => [
        ...old,
        ...page.conversations.filter(
          (row) => !old.some((item) => item.id === row.id),
        ),
      ]);
      setNextOffset(page.next_offset);
    } catch {
      setError(
        c(
          "Chưa tải được lịch sử. Hãy thử lại.",
          "Could not load history. Please retry.",
        ),
      );
    } finally {
      setHistoryLoading(false);
    }
  }
  async function olderMessages() {
    if (!conversationId || !nextBefore || busy || olderLoading) return;
    setOlderLoading(true);
    setError("");
    try {
      const page = await call<ConversationPage>(
        `/conversations/${conversationId}?before=${nextBefore}`,
      );
      if (log.current)
        pendingScroll.current = {
          height: log.current.scrollHeight,
          top: log.current.scrollTop,
        };
      setExchanges((old) => [
        ...page.exchanges.filter(
          (row) => !old.some((item) => item.id === row.id),
        ),
        ...old,
      ]);
      setNextBefore(page.next_before);
    } catch {
      setError(
        c(
          "Chưa tải được tin nhắn cũ. Hãy thử lại.",
          "Could not load older messages. Please retry.",
        ),
      );
    } finally {
      setOlderLoading(false);
    }
  }
  async function send(
    text = input,
    id = crypto.randomUUID(),
    selectedMode = mode,
    selectedCourse = course,
    selectedConversation = conversationId,
  ) {
    if (sending.current || olderLoading || !ready || text.trim().length < 3)
      return;
    sending.current = true;
    setBusy(true);
    setError("");
    setRetry(null);
    let thread = selectedConversation;
    try {
      thread ||= await createThread();
      const exchange = await call<Exchange>("/messages", "POST", {
        conversation_id: thread,
        request_id: id,
        text: text.trim(),
        mode: selectedMode,
        course_id: selectedCourse.startsWith("document:")
          ? "ai"
          : selectedCourse,
        document_id: selectedCourse.startsWith("document:")
          ? selectedCourse.slice(9)
          : null,
      });
      setExchanges((old) =>
        old.some((row) => row.id === exchange.id) ? old : [...old, exchange],
      );
      setConversations((old) => {
        const row = old.find((item) => item.id === thread);
        if (!row) return old;
        return [
          {
            ...row,
            title: row.title || exchange.question.slice(0, 80),
            updated_at: exchange.created_at,
          },
          ...old.filter((item) => item.id !== thread),
        ];
      });
      setInput("");
    } catch {
      setError(
        c(
          "Chưa gửi được. Thử lại sẽ dùng cùng mã tin nhắn để tránh lưu trùng.",
          "Could not send. Retry uses the same message ID to avoid duplicates.",
        ),
      );
      setRetry({
        text,
        id,
        mode: selectedMode,
        course: selectedCourse,
        conversation: thread,
      });
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  function edit(memory?: Memory, text = "") {
    setEditing(memory?.id || null);
    setKind(memory?.kind || "study_strategy");
    setContent(memory?.content || text.slice(0, 400));
    setConfirmed(false);
    setNote("");
    setError("");
    setTab("memory");
  }
  async function saveMemory(event: React.FormEvent) {
    event.preventDefault();
    if (!confirmed || busy) return;
    setBusy(true);
    setError("");
    try {
      const { memory } = await call<{ memory: Memory }>("/memory", "POST", {
        identifier: editing || crypto.randomUUID(),
        kind,
        content: content.trim(),
        confirmed: true,
      });
      setMemories((old) => [...old.filter((m) => m.id !== memory.id), memory]);
      setContent("");
      setEditing(null);
      setConfirmed(false);
      setNote(
        c(
          "Đã ghi nhớ theo xác nhận của bạn. Lịch học không tự thay đổi.",
          "Saved with your confirmation. Your schedule has not changed.",
        ),
      );
    } catch {
      setError(
        c(
          "Chưa lưu được. Tối đa 20 điều đã xác nhận; bạn có thể sửa hoặc xoá điều cũ.",
          "Could not save. Keep up to 20 confirmed memories; edit or remove an existing one.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  async function removeMemory(id: string) {
    setBusy(true);
    setError("");
    try {
      await call(`/memory/${id}`, "DELETE");
      setMemories((old) => old.filter((m) => m.id !== id));
      if (editing === id) {
        setEditing(null);
        setContent("");
        setConfirmed(false);
      }
      setNote(
        c(
          "Đã xoá điều đã nhớ. Tin nhắn và kế hoạch cũ vẫn giữ nguyên.",
          "Memory deleted. Existing messages and plans are unchanged.",
        ),
      );
    } catch {
      setError(
        c(
          "Chưa xoá được, vui lòng thử lại.",
          "Could not delete; please retry.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  async function clearHistory() {
    setBusy(true);
    try {
      await call("/history", "DELETE");
      setExchanges([]);
      setConversations([]);
      setConversationId(null);
      rememberSelection(null);
      setNextBefore(null);
      setNextOffset(null);
      pendingNew.current = null;
      setConfirmClear(false);
      setRetry(null);
      setNote(
        c(
          "Đã xoá hội thoại; memory đã xác nhận vẫn được giữ.",
          "Conversation history cleared; confirmed memory remains.",
        ),
      );
    } catch {
      setError(c("Chưa xoá được lịch sử.", "Could not clear history."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={styles.rail}>
      <div
        className={styles.tabs}
        role="group"
        aria-label={c("Chọn nội dung trợ lý", "Assistant view")}
      >
        <button
          type="button"
          aria-pressed={tab === "chat"}
          onClick={() => {
            setTab("chat");
            setError("");
          }}
        >
          {c("Hỏi đáp", "Chat")}
        </button>
        <button
          type="button"
          aria-pressed={tab === "memory"}
          onClick={() => {
            setTab("memory");
            setError("");
          }}
        >
          {c("Ghi nhớ", "Memory")} <span>{memories.length}</span>
        </button>
        <button
          type="button"
          aria-pressed={tab === "materials"}
          onClick={() => setTab("materials")}
        >
          {c("Học liệu", "Materials")}
        </button>
        {onClose && (
          <button
            type="button"
            className={styles.closeTab}
            aria-label={c("Đóng chatbot", "Close chatbot")}
            onClick={onClose}
          >
            <span aria-hidden="true">×</span>
          </button>
        )}
      </div>
      {!ready ? (
        <div className={styles.empty}>
          <p role={loadError ? "alert" : "status"}>
            {loadError
              ? c("Chưa tải được trợ lý.", "Could not load the assistant.")
              : c("Đang mở trợ lý…", "Loading assistant…")}
          </p>
          {loadError && (
            <button onClick={() => setAttempt((a) => a + 1)}>
              {c("Thử tải lại", "Retry loading")}
            </button>
          )}
        </div>
      ) : tab === "materials" ? (
        <div className={styles.memory}>
          <ChatSourcePicker
            value={course}
            onChange={setCourse}
            documents={documents}
            vi={vi}
            disabled={busy}
          />
          {course.startsWith("document:") ? (
            <div className={styles.uploadedSource}>
              <strong>
                {documents.find((doc) => doc.id === course.slice(9))?.name ||
                  c("Tài liệu đã chọn", "Selected material")}
              </strong>
              <Link href={`/study-set/${course.slice(9)}`}>
                {c("Mở bộ học tập", "Open study set")}
              </Link>
              <button
                type="button"
                onClick={() => {
                  setMode("tutor");
                  setTab("chat");
                }}
              >
                {c("Hỏi về tài liệu này", "Ask about this material")}
              </button>
            </div>
          ) : (
            <PublicCourseMaterials key={course} course={course} vi={vi} />
          )}
        </div>
      ) : tab === "chat" ? (
        <>
          <div className={styles.conversationToolbar}>
            <button
              aria-label={c("Cuộc trò chuyện mới", "New conversation")}
              disabled={busy || olderLoading}
              onClick={() => void newConversation()}
            >
              ＋ {c("Cuộc trò chuyện mới", "New conversation")}
            </button>
            <button
              disabled={busy || olderLoading}
              aria-expanded={historyOpen}
              onClick={() => setHistoryOpen((open) => !open)}
            >
              {c("Lịch sử", "History")}
            </button>
          </div>
          {historyOpen && (
            <section
              className={styles.historyPanel}
              aria-label={c("Lịch sử trò chuyện", "Conversation history")}
            >
              <h3>{c("Lịch sử trò chuyện", "Conversation history")}</h3>
              {conversations.length === 0 && (
                <p>
                  {c("Chưa có cuộc trò chuyện nào.", "No conversations yet.")}
                </p>
              )}
              {conversations.map((row) => (
                <button
                  key={row.id}
                  disabled={busy || olderLoading}
                  aria-current={row.id === conversationId ? "true" : undefined}
                  onClick={() => void switchConversation(row.id)}
                >
                  <span>
                    {row.title || c("Cuộc trò chuyện mới", "New conversation")}
                  </span>
                  <small>
                    {new Date(row.updated_at).toLocaleString(
                      vi ? "vi-VN" : "en-GB",
                      {
                        timeZone: "Asia/Ho_Chi_Minh",
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      },
                    )}
                  </small>
                </button>
              ))}
              {nextOffset !== null && (
                <button
                  disabled={historyLoading || busy}
                  onClick={() => void moreConversations()}
                >
                  {c("Xem thêm cuộc trò chuyện", "More conversations")}
                </button>
              )}
            </section>
          )}
          <p
            className={styles.conversationTitle}
            title={
              conversations.find((row) => row.id === conversationId)?.title
            }
          >
            {conversations.find((row) => row.id === conversationId)?.title ||
              c("Cuộc trò chuyện mới", "New conversation")}
          </p>
          <div className={styles.options}>
            <label>
              {c("Hỗ trợ", "Support")}
              <select
                aria-label={c("Vai trò hỗ trợ", "Support mode")}
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                disabled={busy}
              >
                <option value="auto">
                  {c("Tự chọn theo câu hỏi", "Auto")}
                </option>
                <option value="tutor">
                  {c("Học liệu có nguồn", "Courseware tutor")}
                </option>
                <option value="plan">{c("Lập kế hoạch", "Planning")}</option>
                <option value="do">{c("Việc hôm nay", "Today's work")}</option>
                <option value="reflect">{c("Phản tư", "Reflection")}</option>
              </select>
            </label>
            {(mode === "auto" || mode === "tutor") && (
              <ChatSourcePicker
                value={course}
                onChange={setCourse}
                documents={documents}
                vi={vi}
                disabled={busy}
              />
            )}
          </div>
          <div
            className={styles.log}
            ref={log}
            role="log"
            aria-label={c("Hội thoại Compass", "Compass conversation")}
            aria-live="polite"
          >
            {nextBefore && (
              <button
                className={styles.loadOlder}
                disabled={busy || olderLoading}
                onClick={() => void olderMessages()}
              >
                {olderLoading
                  ? c("Đang tải…", "Loading…")
                  : c("Tin nhắn trước đó", "Earlier messages")}
              </button>
            )}
            {exchanges.length === 0 && (
              <div className={styles.empty}>
                <span className={styles.spark}>✦</span>
                <h3>{c("Cùng gỡ từng bước nhỏ", "One step at a time")}</h3>

                {course.startsWith("document:") ? (
                  <div className={styles.documentPrompts}>
                    {[
                      [
                        c("Tóm tắt tài liệu", "Summarize this material"),
                        c(
                          "Tóm tắt các ý chính trong tài liệu này.",
                          "Summarize the main ideas in this material.",
                        ),
                      ],
                      [
                        c("Giải thích ý chính", "Explain the main ideas"),
                        c(
                          "Giải thích các khái niệm chính trong tài liệu bằng ví dụ dễ hiểu.",
                          "Explain this material's main concepts with simple examples.",
                        ),
                      ],
                      [
                        c("Tự kiểm tra kiến thức", "Check my understanding"),
                        c(
                          "Hãy đặt một câu hỏi để tôi tự kiểm tra kiến thức trong tài liệu này.",
                          "Ask me one question to check my understanding of this material.",
                        ),
                      ],
                    ].map(([label, question]) => (
                      <button
                        type="button"
                        key={label}
                        disabled={busy}
                        onClick={() => void send(question)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <button
                    onClick={() =>
                      setInput(
                        c(
                          "Dựa vào tuần trước, giúp tôi lên kế hoạch tuần sau.",
                          "Help me plan next week based on last week's reflection.",
                        ),
                      )
                    }
                  >
                    {c("Gợi ý kế hoạch tuần sau", "Help plan next week")}
                  </button>
                )}
              </div>
            )}
            {exchanges.map((row, index) => (
              <div key={row.id} className={styles.exchange}>
                <div className={styles.user}>
                  {row.document_id && (
                    <span
                      className={styles.messageSource}
                      title={
                        documents.find((doc) => doc.id === row.document_id)
                          ?.name
                      }
                    >
                      {documents.find((doc) => doc.id === row.document_id)
                        ?.name || c("Tài liệu riêng", "Uploaded material")}
                    </span>
                  )}
                  <p>{row.question}</p>
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={c(
                      `Ghi nhớ tin nhắn ${index + 1}`,
                      `Remember message ${index + 1}`,
                    )}
                    onClick={() => edit(undefined, row.question)}
                  >
                    {c("Ghi nhớ điều này", "Remember this")}
                  </button>
                </div>
                <div className={styles.answer}>
                  <span className={styles.answerLabel}>
                    ✦ Compass ·{" "}
                    {row.response.basis === "courseware"
                      ? c("Học liệu", "Courseware")
                      : row.response.basis === "guidance"
                        ? c("Hỗ trợ tự học", "Learning guidance")
                        : row.response.basis === "conversation"
                          ? c("Trò chuyện", "Chat")
                          : row.response.basis === "general"
                            ? c(
                                "Kiến thức chung, không từ học liệu",
                                "General knowledge, not from courseware",
                              )
                            : c("Dữ liệu học của bạn", "Your learning records")}
                  </span>
                  <p>{row.response.answer}</p>
                  {row.response.citations.length > 0 && (
                    <details>
                      <summary>
                        {c("Nguồn tham khảo", "Sources")} ·{" "}
                        {row.response.citations.length}
                      </summary>
                      {row.response.citations.map((citation, i) => (
                        <div className={styles.source} key={i}>
                          {citation.source_url ? (
                            <a
                              href={
                                citation.source_url +
                                (citation.page ? `#page=${citation.page}` : "")
                              }
                              target="_blank"
                              rel="noreferrer"
                            >
                              {citation.title}
                              {citation.page
                                ? ` · ${c("trang", "page")} ${citation.page}`
                                : ""}
                            </a>
                          ) : (
                            <span>
                              {citation.title} · {c("mô phỏng", "demo")}
                            </span>
                          )}
                        </div>
                      ))}
                    </details>
                  )}
                  {row.response.action &&
                    !row.response.action.href.startsWith("/knowledge") && (
                      <Link
                        className={styles.action}
                        href={
                          row.response.action.href.startsWith("/plan")
                            ? "/plan?assistant=review"
                            : row.response.action.href
                        }
                      >
                        {row.response.action.href.startsWith("/plan")
                          ? c(
                              "Mở kế hoạch để xem và duyệt",
                              "Review and approve a plan",
                            )
                          : row.response.action.href === "/today"
                            ? c("Mở việc hôm nay", "Open today's work")
                            : row.response.action.href === "/reflect"
                              ? c("Mở phản tư tuần", "Open weekly reflection")
                              : c("Mở kho học liệu", "Open courseware")}
                      </Link>
                    )}
                </div>
              </div>
            ))}
            {busy && (
              <p role="status" className={styles.thinking}>
                {c(
                  "Compass đang kiểm tra thông tin…",
                  "Compass is checking the information…",
                )}
              </p>
            )}
          </div>
          <form
            className={styles.composer}
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            {error && <p role="alert">{error}</p>}
            {retry && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void send(
                    retry.text,
                    retry.id,
                    retry.mode,
                    retry.course,
                    retry.conversation,
                  )
                }
              >
                {c("Thử lại tin nhắn", "Retry message")}
              </button>
            )}
            <label>
              <span className={styles.srOnly}>
                {c("Nhắn trợ lý Compass", "Message Compass")}
              </span>
              <textarea
                ref={composer}
                placeholder={c(
                  "Bạn đang vướng ở đâu?",
                  "What are you working through?",
                )}
                maxLength={500}
                minLength={3}
                rows={3}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                disabled={busy}
                required
              />
            </label>
            <div>
              <button
                className={styles.send}
                type="submit"
                disabled={busy || olderLoading || input.trim().length < 3}
              >
                {busy ? "…" : c("Gửi", "Send")}
              </button>
            </div>
          </form>
        </>
      ) : (
        <div className={styles.memory}>
          <h3>
            {c(
              "Những điều bạn muốn Compass nhớ",
              "What you want Compass to remember",
            )}
          </h3>

          <Link href="/plan">
            {c(
              "Quản lý khung giờ và mục tiêu thời lượng",
              "Manage preferred sessions and time targets",
            )}
          </Link>
          {memories.map((m) => (
            <article key={m.id}>
              <small>{kinds[m.kind as keyof typeof kinds]?.[vi ? 0 : 1]}</small>
              <p>{m.content}</p>
              <div>
                <button disabled={busy} onClick={() => edit(m)}>
                  {c("Sửa", "Edit")}
                </button>
                <button disabled={busy} onClick={() => void removeMemory(m.id)}>
                  {c("Xoá", "Delete")}
                </button>
              </div>
            </article>
          ))}
          <form onSubmit={saveMemory} className={styles.memoryForm}>
            <h4>
              {editing
                ? c("Sửa điều đã nhớ", "Edit memory")
                : c("Thêm điều muốn ghi nhớ", "Add a memory")}
            </h4>
            <label>
              {c("Loại thông tin", "Memory type")}
              <select
                aria-label={c("Loại thông tin", "Memory type")}
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value);
                  setConfirmed(false);
                }}
                disabled={busy}
              >
                {Object.entries(kinds).map(([id, names]) => (
                  <option key={id} value={id}>
                    {names[vi ? 0 : 1]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {c("Điều tôi muốn ghi nhớ", "What I want remembered")}
              <textarea
                rows={3}
                aria-label={c(
                  "Điều tôi muốn ghi nhớ",
                  "What I want remembered",
                )}
                value={content}
                minLength={3}
                maxLength={400}
                required
                disabled={busy}
                onChange={(e) => {
                  setContent(e.target.value);
                  setConfirmed(false);
                }}
              />
            </label>
            <label className={styles.confirm}>
              <input
                type="checkbox"
                checked={confirmed}
                disabled={busy}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              {c(
                "Tôi xác nhận nội dung này và muốn dùng để cá nhân hoá hỗ trợ học.",
                "I confirm this and want it used to personalize learning support.",
              )}
            </label>
            <button
              type="submit"
              disabled={busy || !confirmed || content.trim().length < 3}
            >
              {c("Xác nhận & ghi nhớ", "Confirm & remember")}
            </button>
            {editing && (
              <button type="button" onClick={() => edit()} disabled={busy}>
                {c("Huỷ sửa", "Cancel edit")}
              </button>
            )}
          </form>

          {confirmClear ? (
            <div>
              <p>
                {c(
                  "Xoá toàn bộ hội thoại trợ lý? Memory và lịch học vẫn giữ nguyên.",
                  "Clear companion history? Memory and plans will remain.",
                )}
              </p>
              <button disabled={busy} onClick={() => void clearHistory()}>
                {c("Xác nhận xoá hội thoại", "Confirm clear history")}
              </button>
              <button disabled={busy} onClick={() => setConfirmClear(false)}>
                {c("Huỷ", "Cancel")}
              </button>
            </div>
          ) : (
            <button
              disabled={busy || conversations.length === 0}
              onClick={() => setConfirmClear(true)}
            >
              {c("Xoá lịch sử hội thoại", "Clear conversation history")}
            </button>
          )}
          {error && <p role="alert">{error}</p>}
          {note && <p role="status">{note}</p>}
        </div>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { AssistantLink } from "./assistant-link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { TicketDragBoard } from "./ticket-drag-board";
import { api, date, dayKey, minutes, time, type Task } from "@/lib/api";
import { coursewareHref } from "@/lib/courseware-navigation";
import { usePreferences } from "./preferences";
import { useWorkspace } from "./workspace";
import { FinishTask, WeekAlerts } from "./weekly";
import { PageHeading } from "./ui";
import styles from "./ticket-workspace.module.css";

type Board = {
  columns?: Record<string, Column>;
  ticket_order?: string[];
  version: number;
  task_ids: string[];
  active_task_id: string | null;
  planned_minutes: Record<string, number>;
  capacity_minutes: number;
};
type Envelope = {
  scope: string;
  day: string;
  board: Board | null;
  actual_minutes?: Record<string, number>;
  details_scope?: string;
  details?: {
    version: number;
    edits: Record<string, { title: string; description: string }>;
  };
};
type Column = "todo" | "progress" | "review" | "done";

export function TicketWorkspace({ view }: { view: "week" | "today" }) {
  const { context, history, recommendation, refresh } = useWorkspace();
  const { language } = usePreferences();
  const vi = language === "vi";
  const c = (a: string, b: string) => (vi ? a : b);
  const [data, setData] = useState<Envelope | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [course, setCourse] = useState("");
  const [list, setList] = useState(false);
  const [selected, setSelected] = useState<Task | null>(null);
  const [finishing, setFinishing] = useState<{
    task: Task;
    outcome: "completed" | "partial";
  } | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [detailError, setDetailError] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createId, setCreateId] = useState("");
  const createDialog = useRef<HTMLDialogElement>(null);
  const lock = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const generation = context
    ? `${context.student.provider}:${context.student.id}:${context.generation}:${dayKey(context.now)}`
    : "";
  const endpoint =
    context?.mode === "imported_pilot_data"
      ? "ticket-board?" +
        new URLSearchParams({
          source: context.student.provider,
          student_external_id: context.student.id,
        })
      : "ticket-board";
  useEffect(() => {
    let current = true;
    void api<Envelope>(endpoint)
      .then((value) => {
        if (current) {
          setData(value);
          setError("");
        }
      })
      .catch(() => {
        if (current)
          setError(
            vi
              ? "Chưa tải được bảng ticket. Hãy tải lại."
              : "Could not load tickets. Please reload.",
          );
      });
    return () => {
      current = false;
    };
  }, [generation, vi, endpoint]);
  useEffect(() => {
    if (selected) dialog.current?.showModal();
  }, [selected]);
  useEffect(() => {
    if (creating) createDialog.current?.showModal();
  }, [creating]);
  function openTicket(task: Task) {
    if (!data || busy) return;
    setEditTitle(task.title);
    setEditDescription(data?.details?.edits[task.id]?.description || "");
    setDetailError("");
    setSelected(task);
  }

  if (!context) return null;
  const plan = history.at(-1);
  const tasks = context.tasks.map((t) => ({
    ...t,
    title: data?.details?.edits[t.id]?.title ?? t.title,
  }));
  const valid = new Map(tasks.map((t) => [t.id, t]));
  const dayBlocks =
    plan?.blocks.filter((b) => dayKey(b.starts_at) === dayKey(context.now)) ||
    [];
  const capacity = context.study_windows
    .filter((w) => dayKey(w.starts_at) === dayKey(context.now))
    .reduce(
      (s, w) => s + (Date.parse(w.ends_at) - Date.parse(w.starts_at)) / 60000,
      0,
    );
  const board: Board = data?.board || {
    version: 0,
    task_ids: [...new Set(dayBlocks.map((b) => b.task_id))].filter((id) =>
      valid.has(id),
    ),
    active_task_id: null,
    planned_minutes: {},
    capacity_minutes: Math.round(capacity),
  };
  const ids = board.task_ids.filter((id) => valid.has(id));
  const active = valid.get(board.active_task_id || "");
  const activeTask = active?.status === "completed" ? undefined : active;
  const estimate = (task: Task) =>
    board.planned_minutes[task.id] ??
    (dayBlocks.some((b) => b.task_id === task.id)
      ? Math.round(
          dayBlocks
            .filter((b) => b.task_id === task.id)
            .reduce(
              (sum, b) =>
                sum + (Date.parse(b.ends_at) - Date.parse(b.starts_at)) / 60000,
              0,
            ),
        )
      : minutes(task.estimated_duration_seconds));
  const queue = ids.map((id) => valid.get(id)!);
  const total = queue.reduce((sum, task) => sum + estimate(task), 0);
  const scheduled = new Set(plan?.blocks.map((b) => b.task_id) || []);
  const status = (task: Task): Column =>
    board.columns?.[task.id] ??
    (task.status === "completed"
      ? "done"
      : task.id === activeTask?.id || task.status === "in_progress"
        ? "progress"
        : "todo");
  const labels: Record<Column, string> = {
    todo: "To do",
    progress: "In progress",
    review: "In review",
    done: "Done",
  };
  const order = [
    ...new Set([
      ...(board.ticket_order || []).filter((id) => valid.has(id)),
      ...tasks.map((t) => t.id),
    ]),
  ];
  const filtered = order
    .map((id) => valid.get(id)!)
    .filter(
      (t) =>
        (!course || t.course === course) &&
        `${t.title} ${t.assignment_title} ${t.course}`
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase()),
    );
  async function save(next: Board) {
    if (!data || lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const previous = data;
    setData({ ...data, board: next });
    try {
      const value = await api<Envelope>(endpoint, {
        scope: data.scope,
        ...next,
      });
      setData(value);
      setNotice(c("Đã lưu bảng công việc.", "Board saved."));
      return true;
    } catch {
      setData(previous);
      setError(
        c(
          "Chưa lưu được. Bảng có thể đã đổi ở tab khác; tải lại trước khi thử tiếp.",
          "Could not save. Another tab may have changed this board; reload before retrying.",
        ),
      );
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function reloadBoard() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setNotice("");
    try {
      const value = await api<Envelope>(endpoint);
      setData(value);
      setError("");
      setNotice(c("Đã tải lại bảng công việc.", "Board reloaded."));
      await refresh();
    } catch {
      setError(
        c(
          "Chưa tải lại được. Vui lòng thử lại.",
          "Could not reload. Please retry.",
        ),
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function createTicket(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || !context || lock.current) return;
    const fields = new FormData(event.currentTarget);
    lock.current = true;
    setBusy(true);
    setCreateError("");
    try {
      const value = await api<Envelope>(
        endpoint.replace("ticket-board", "ticket-board/tasks"),
        {
          scope: data.details_scope,
          task_id: createId,
          assignment_id: fields.get("assignment"),
          title: fields.get("title"),
          description: fields.get("description"),
          estimated_minutes: Number(fields.get("minutes")),
        },
      );
      setData(value);
      await refresh();
      setQuery("");
      setCourse("");
      setCreating(false);
      setNotice(c("Đã tạo ticket trong To do.", "Ticket created in To do."));
    } catch {
      setCreateError(
        c(
          "Chưa tạo được ticket. Hãy thử lại hoặc tải lại bảng nếu dữ liệu đã thay đổi.",
          "Could not create ticket. Retry or reload if your workspace changed.",
        ),
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function saveDetails(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !data || lock.current) return;
    lock.current = true;
    setBusy(true);
    setDetailError("");
    try {
      const detailsEndpoint = endpoint.replace(
        "ticket-board",
        "ticket-board/details",
      );
      const value = await api<Envelope>(detailsEndpoint, {
        scope: data.details_scope,
        version: data.details?.version ?? 0,
        task_id: selected.id,
        title: editTitle,
        description: editDescription,
      });
      setData(value);
      setSelected(null);
      setNotice(c("Đã lưu nội dung ticket.", "Ticket details saved."));
    } catch {
      setDetailError(
        c(
          "Chưa lưu được. Nếu ticket đã đổi ở tab khác, hãy huỷ và tải lại bảng trước khi thử lại.",
          "Could not save. If another tab changed this ticket, cancel and reload before retrying.",
        ),
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function add(task: Task) {
    if (ids.includes(task.id)) return;
    void save({ ...board, task_ids: [...ids, task.id] });
  }
  function remove(task: Task) {
    const planned = { ...board.planned_minutes };
    delete planned[task.id];
    void save({
      ...board,
      task_ids: ids.filter((id) => id !== task.id),
      planned_minutes: planned,
    });
  }
  function move(task: Task, direction: number) {
    const order = [...ids],
      from = order.indexOf(task.id),
      to = from + direction;
    if (from < 0 || to < 0 || to >= order.length) return;
    [order[from], order[to]] = [order[to], order[from]];
    void save({ ...board, task_ids: order });
  }
  function start(task: Task) {
    void save({
      ...board,
      task_ids: ids.includes(task.id) ? ids : [...ids, task.id],
      active_task_id: task.status === "completed" ? null : task.id,
      columns: { ...board.columns, [task.id]: "progress" },
    });
  }
  function drop(column: Column, identifier: string, before?: string | null) {
    const task = valid.get(identifier);
    if (!task || busy || !data) return;
    const nextOrder = order.filter((id) => id !== task.id);
    const target = before ? nextOrder.indexOf(before) : -1;
    nextOrder.splice(target < 0 ? nextOrder.length : target, 0, task.id);
    if (
      status(task) === column &&
      nextOrder.every((id, index) => id === order[index])
    )
      return;
    void save({
      ...board,
      ticket_order: nextOrder,
      columns: { ...board.columns, [task.id]: column },
      active_task_id:
        status(task) !== column && board.active_task_id === task.id
          ? null
          : board.active_task_id,
    });
  }

  function ticketActions(task: Task) {
    const index = ids.indexOf(task.id);
    return (
      <div className={styles.cardActions}>
        <label>
          {c("Cột ticket", "Ticket column")}
          <select
            aria-label={`${c("Chuyển cột", "Move ticket")} ${task.title}`}
            value={status(task)}
            disabled={busy || !data}
            onChange={(e) => drop(e.target.value as Column, task.id)}
          >
            {(Object.keys(labels) as Column[]).map((column) => (
              <option key={column} value={column}>
                {labels[column]}
              </option>
            ))}
          </select>
        </label>
        {task.status !== "completed" &&
          (task.id === activeTask?.id ? (
            <>
              <button
                disabled={busy}
                onClick={() => {
                  setSelected(null);
                  setFinishing({ task, outcome: "completed" });
                }}
              >
                {c("Hoàn thành", "Complete")}
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  setSelected(null);
                  setFinishing({ task, outcome: "partial" });
                }}
              >
                {c("Tạm dừng", "Pause")}
              </button>
            </>
          ) : (
            <>
              <button disabled={busy || !data} onClick={() => start(task)}>
                {c("Bắt đầu", "Start")}
              </button>
              {!ids.includes(task.id) && (
                <button disabled={busy || !data} onClick={() => add(task)}>
                  {c("+ Hôm nay", "+ Today")}
                </button>
              )}
            </>
          ))}
        {index >= 0 && (
          <>
            <button
              disabled={busy || index === 0}
              aria-label={`${c("Đưa lên", "Move up")} ${task.title}`}
              onClick={() => move(task, -1)}
            >
              ↑
            </button>
            <button
              disabled={busy || index === queue.length - 1}
              aria-label={`${c("Đưa xuống", "Move down")} ${task.title}`}
              onClick={() => move(task, 1)}
            >
              ↓
            </button>
          </>
        )}
      </div>
    );
  }
  function card(task: Task, handle?: ReactNode) {
    const overdue =
      Date.parse(task.deadline) < Date.parse(context!.now) &&
      task.status !== "completed";
    return (
      <article
        key={task.id}
        className={styles.card}
        data-active={task.id === activeTask?.id}
        aria-label={task.title}
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest("button")) openTicket(task);
        }}
      >
        <div className={styles.cardTop}>
          {handle}
          <span className={styles.course}>{task.course}</span>
        </div>
        <button
          className={styles.title}
          disabled={!data || busy}
          onClick={() => openTicket(task)}
        >
          <span className={styles.titleText}>{task.title}</span>
        </button>
        <div className={styles.meta}>
          <span>
            {task.id === activeTask?.id
              ? c("● Đang tập trung", "● Focused")
              : ids.includes(task.id)
                ? c("Hôm nay", "Today")
                : `HC-${task.id.replaceAll("-", "").slice(-6).toUpperCase()}`}
          </span>
          <span className={overdue ? styles.overdue : ""}>
            {date(
              task.deadline,
              { day: "numeric", month: "short" },
              vi ? "vi-VN" : "en-GB",
            )}
          </span>
        </div>
      </article>
    );
  }
  return (
    <section
      className={styles.root}
      aria-label={c(
        view === "today" ? "Ticket hôm nay" : "Bảng ticket tuần",
        view === "today" ? "Today's tickets" : "Weekly ticket board",
      )}
    >
      {view === "today" ? (
        <>
          <PageHeading
            eyebrow={date(
              context.now,
              { weekday: "long", day: "numeric", month: "long" },
              vi ? "vi-VN" : "en-GB",
            )}
            title={c("Hôm nay, từng việc một", "Today, one step at a time")}
            action={
              <Link className="secondary" href="/plan">
                {c("Kế hoạch tuần", "Weekly plan")}
              </Link>
            }
          />
          {!plan && (
            <div className="weekly-alert success no-plan" role="status">
              <p>
                <strong>
                  {c("Tuần này chưa có kế hoạch", "No plan for this week yet")}
                </strong>
              </p>
              <Link className="secondary" href="/plan">
                {c("Lập kế hoạch tuần", "Plan my week")}
              </Link>
            </div>
          )}
          <WeekAlerts plan={plan} />
        </>
      ) : (
        <div className={styles.sectionHeading}>
          <div>
            <h2>{c("Bảng công việc tuần", "Weekly ticket board")}</h2>
          </div>
          <div role="group" aria-label={c("Kiểu hiển thị", "View style")}>
            <button aria-pressed={!list} onClick={() => setList(false)}>
              {c("Bảng", "Board")}
            </button>
            <button aria-pressed={list} onClick={() => setList(true)}>
              {c("Danh sách", "List")}
            </button>
          </div>
        </div>
      )}
      <div className={styles.toolbar}>
        <button
          className="primary"
          disabled={busy || !data || !context.assignments?.length}
          onClick={() => {
            setCreateId(crypto.randomUUID());
            setCreateError("");
            setCreating(true);
          }}
        >
          + {c("Tạo ticket", "Create ticket")}
        </button>
        <label>
          {c("Tìm ticket", "Search tickets")}
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={c("Tên việc, bài tập…", "Task or assignment…")}
          />
        </label>
        <label>
          {c("Môn học", "Course")}
          <select value={course} onChange={(e) => setCourse(e.target.value)}>
            <option value="">{c("Tất cả môn", "All courses")}</option>
            {[...new Set(context.tasks.map((t) => t.course))].map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <button
          className="secondary small"
          disabled={busy}
          onClick={() => void reloadBoard()}
        >
          {c("Tải lại", "Reload")}
        </button>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className={styles.notice}>
          {notice}
        </p>
      )}
      {view === "week" ? (
        <TicketDragBoard
          list={list}
          vi={vi}
          disabled={busy || !data}
          columns={(Object.keys(labels) as Column[]).map((column) => ({
            id: column,
            label: labels[column],
            tickets: filtered.filter((t) => status(t) === column),
          }))}
          renderTicket={(id, handle) => card(valid.get(id)!, handle)}
          onMove={(id, column, before) => drop(column as Column, id, before)}
        />
      ) : (
        <>
          <div className={styles.workload}>
            <div>
              <strong>
                {total} / {board.capacity_minutes} {c("phút", "min")}
              </strong>
              <p>
                {c(
                  "Thời lượng dự kiến / quỹ thời gian hôm nay",
                  "Planned workload / today's capacity",
                )}
              </p>
              <p>
                {c("Đã ghi nhận hôm nay", "Logged today")}:{" "}
                {Object.values(data?.actual_minutes || {}).reduce(
                  (sum, n) => sum + n,
                  0,
                )}{" "}
                {c("phút", "min")}
              </p>
              <progress
                max={Math.max(total, board.capacity_minutes, 1)}
                value={total}
                aria-label={c("Khối lượng hôm nay", "Today's workload")}
              />
              {total > board.capacity_minutes && (
                <p className={styles.overdue}>
                  {c(
                    `Đang vượt ${total - board.capacity_minutes} phút. Hãy bỏ bớt việc hoặc điều chỉnh thời gian.`,
                    `${total - board.capacity_minutes} min over capacity. Reduce your list or adjust your time.`,
                  )}
                </p>
              )}
            </div>
            <label>
              {c("Quỹ thời gian (phút)", "Daily capacity (min)")}
              <input
                key={`${board.version}-capacity`}
                type="number"
                min="0"
                max="1440"
                defaultValue={board.capacity_minutes}
                disabled={busy || !data}
                onBlur={(e) => {
                  const n = Number(e.target.value);
                  if (
                    Number.isInteger(n) &&
                    n >= 0 &&
                    n <= 1440 &&
                    n !== board.capacity_minutes
                  )
                    void save({ ...board, capacity_minutes: n });
                  else e.target.value = String(board.capacity_minutes);
                }}
              />
            </label>
          </div>
          <div className={styles.daily}>
            <section aria-label={c("Danh sách hôm nay", "Today's list")}>
              <div className={styles.sectionHeading}>
                <h2>
                  {c("Tập trung hôm nay", "Today's focus")}{" "}
                  <small>{queue.length}</small>
                </h2>
                <Link href="/reflect">{c("Phản tư", "Reflect")} →</Link>
              </div>
              {queue
                .filter((t) => filtered.some((f) => f.id === t.id))
                .map((t) => card(t))}
              {queue.length === 0 && (
                <p className={styles.empty}>
                  {c("Chưa có ticket hôm nay.", "No tickets selected today.")}
                </p>
              )}
            </section>
            <section aria-label={c("Chọn thêm công việc", "Choose more tasks")}>
              <h2>{c("Từ kế hoạch tuần", "From your week")}</h2>
              {[...filtered]
                .filter((t) => !ids.includes(t.id) && t.status !== "completed")
                .sort(
                  (a, b) =>
                    Number(b.id === recommendation?.recommendation.task_id) -
                      Number(a.id === recommendation?.recommendation.task_id) ||
                    Date.parse(a.deadline) - Date.parse(b.deadline),
                )
                .map((t) => card(t))}
              {!filtered.some(
                (t) => !ids.includes(t.id) && t.status !== "completed",
              ) && (
                <p className={styles.empty}>
                  {c("Không còn ticket phù hợp.", "No more matching tickets.")}
                </p>
              )}
            </section>
          </div>
        </>
      )}
      {creating && (
        <dialog
          ref={createDialog}
          className={styles.dialog}
          onCancel={(event) => {
            if (busy) event.preventDefault();
            else setCreating(false);
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              createDialog.current?.close();
              setCreating(false);
            }
          }}
          onClose={() => setCreating(false)}
        >
          <h2>{c("Tạo ticket", "Create ticket")}</h2>
          <form onSubmit={createTicket}>
            <label>
              {c("Tên ticket", "Ticket title")}
              <input
                name="title"
                required
                minLength={2}
                maxLength={200}
                autoFocus
                disabled={busy}
              />
            </label>
            <label>
              {c("Bài tập / môn học", "Assignment / course")}
              <select name="assignment" required disabled={busy}>
                {context.assignments?.map((a) => (
                  <option key={a.assignment_id} value={a.assignment_id}>
                    {a.course} — {a.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {c("Ước lượng (phút)", "Estimate (minutes)")}
              <input
                name="minutes"
                type="number"
                required
                min={5}
                max={480}
                defaultValue={25}
                disabled={busy}
              />
            </label>
            <label>
              {c("Nội dung / ghi chú", "Description / notes")}
              <textarea
                name="description"
                rows={4}
                maxLength={2000}
                disabled={busy}
              />
            </label>
            {createError && <p role="alert">{createError}</p>}
            <div className={styles.dialogActions}>
              <button type="submit" disabled={busy}>
                {busy
                  ? c("Đang tạo…", "Creating…")
                  : c("Tạo ticket", "Create ticket")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setCreating(false)}
              >
                {c("Huỷ", "Cancel")}
              </button>
            </div>
          </form>
        </dialog>
      )}
      {selected && (
        <dialog
          ref={dialog}
          className={styles.dialog}
          onCancel={() => setSelected(null)}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              dialog.current?.close();
              setSelected(null);
            }
          }}
          onClose={() => setSelected(null)}
        >
          <div className={styles.sectionHeading}>
            <span className={styles.course}>{selected.course}</span>
            <button
              aria-label={c("Đóng chi tiết ticket", "Close ticket details")}
              onClick={() => setSelected(null)}
            >
              ×
            </button>
          </div>
          <h2>{c("Chi tiết ticket", "Ticket details")}</h2>
          <form onSubmit={saveDetails}>
            <label>
              {c("Tên ticket", "Ticket title")}
              <input
                required
                minLength={2}
                maxLength={200}
                value={editTitle}
                disabled={busy}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </label>
            <label>
              {c("Nội dung / ghi chú", "Description / notes")}
              <textarea
                rows={5}
                maxLength={2000}
                value={editDescription}
                disabled={busy}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            </label>
            {detailError && <p role="alert">{detailError}</p>}
            <div className={styles.dialogActions}>
              <button
                type="submit"
                disabled={
                  busy ||
                  !data ||
                  (editTitle === selected.title &&
                    editDescription ===
                      (data.details?.edits[selected.id]?.description || ""))
                }
              >
                {c("Lưu nội dung", "Save ticket")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setSelected(null)}
              >
                {c("Huỷ", "Cancel")}
              </button>
            </div>
          </form>
          <p>{selected.assignment_title}</p>
          <p>
            {c("Dự kiến", "Estimated")}: {estimate(selected)} {c("phút", "min")}{" "}
            · {c("Thực học", "Studied")}:{" "}
            {data?.actual_minutes?.[selected.id] || 0} {c("phút", "min")}
          </p>
          {context.assignments?.find(
            (a) => a.assignment_id === selected.assignment_id,
          )?.submitted_at && <p>{c("Bài đã nộp", "Assignment submitted")}</p>}
          {ticketActions(valid.get(selected.id) || selected)}
          <p>
            {c("Hạn nộp", "Deadline")}:{" "}
            {date(
              selected.deadline,
              {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              },
              vi ? "vi-VN" : "en-GB",
            )}{" "}
            · {c("Trạng thái", "Status")}: {labels[status(selected)]}
          </p>
          <p>
            {c(
              "Hoàn thành việc học không tự nộp bài lên LMS.",
              "Completing study work does not submit to the LMS.",
            )}
          </p>
          <h3>{c("Phiên học đã duyệt", "Approved study sessions")}</h3>
          {plan?.blocks
            .filter((b) => b.task_id === selected.id)
            .map((b, i) => (
              <p key={i}>
                {date(
                  b.starts_at,
                  { weekday: "short", day: "numeric", month: "short" },
                  vi ? "vi-VN" : "en-GB",
                )}{" "}
                · {time(b.starts_at)}–{time(b.ends_at)}
              </p>
            ))}
          {!scheduled.has(selected.id) && (
            <p>
              {c(
                "Chưa có phiên học được duyệt. Chỉnh lịch tại Kế hoạch tuần.",
                "No approved session. Schedule through Weekly plan.",
              )}
            </p>
          )}
          {ids.includes(selected.id) && (
            <label>
              {c("Dự kiến hôm nay (phút)", "Today's estimate (min)")}
              <input
                key={`${selected.id}-${board.version}`}
                type="number"
                min="5"
                max="480"
                disabled={busy}
                defaultValue={estimate(selected)}
                onBlur={(e) => {
                  const n = Number(e.target.value);
                  if (
                    Number.isInteger(n) &&
                    n >= 5 &&
                    n <= 480 &&
                    n !== estimate(selected)
                  )
                    void save({
                      ...board,
                      planned_minutes: {
                        ...board.planned_minutes,
                        [selected.id]: n,
                      },
                    });
                  else e.target.value = String(estimate(selected));
                }}
              />
            </label>
          )}
          <div className={styles.dialogActions}>
            {selected.status !== "completed" && (
              <>
                {ids.includes(selected.id) && (
                  <button
                    disabled={busy || selected.id === activeTask?.id}
                    onClick={() => remove(selected)}
                  >
                    {c("Bỏ khỏi hôm nay", "Remove from today")}
                  </button>
                )}
              </>
            )}
            <AssistantLink href={coursewareHref(selected.course)}>
              {c("Hỏi chatbot về môn này", "Ask about this course")}
            </AssistantLink>
          </div>
        </dialog>
      )}
      {finishing && (
        <FinishTask
          task={finishing.task}
          outcome={finishing.outcome}
          onClose={() => setFinishing(null)}
          onSaved={() => {
            void (async () => {
              await save({
                ...board,
                active_task_id:
                  board.active_task_id === finishing.task.id
                    ? null
                    : board.active_task_id,
                columns: {
                  ...board.columns,
                  [finishing.task.id]:
                    finishing.outcome === "completed" ? "done" : "todo",
                },
              });
              try {
                setData(await api<Envelope>(endpoint));
              } catch {
                setError(
                  c(
                    "Đã lưu tiến độ; hãy tải lại bảng.",
                    "Progress saved; please reload the board.",
                  ),
                );
              }
              setNotice(
                c(
                  "Đã lưu thời gian học và tiến độ.",
                  "Study time and progress saved.",
                ),
              );
            })();
          }}
        />
      )}
    </section>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  api,
  Candidate,
  hasDemoClock,
  date,
  dayKey,
  label,
  minutes,
  Plan,
  Replan,
  Task,
  time,
} from "@/lib/api";
import { Icon } from "./icons";
import {
  Attention,
  Badge,
  BlockRow,
  Empty,
  PageHeading,
  PlanDays,
  Status,
} from "./ui";
import { usePreferences } from "./preferences";
import {
  AdaptFlow,
  FinishTask,
  PlanWizard,
  useActiveTask,
  useCopy,
  useRiskText,
  WeekAlerts,
  WeekHistoryList,
  WeeklySummary,
} from "./weekly";
import { useWorkspace } from "./workspace";

function message(error: unknown) {
  return error instanceof Error ? error.message : "Please try again.";
}
function localInput(value: string) {
  const instant = new Date(value);
  return new Date(instant.getTime() - instant.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
function Feedback({ error, success }: { error: string; success?: string }) {
  return (
    <>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="form-success" role="status">
          <Icon name="check" size={16} />
          {success}
        </p>
      )}
    </>
  );
}

export function Today() {
  const { context, recommendation, history, refresh, loading } = useWorkspace();
  const { language, t } = usePreferences();
  const c = useCopy();
  const riskText = useRiskText();
  const locale = language === "vi" ? "vi-VN" : "en-GB";
  const [recording, setRecording] = useState<Task | null>(null);
  const [finishing, setFinishing] = useState<"completed" | "partial" | null>(
    null,
  );
  const [saved, setSaved] = useState("");
  const { active, start, clear } = useActiveTask();
  if (!context) return null;
  const rec = recommendation?.recommendation;
  const recommended = context.tasks.find((item) => item.id === rec?.task_id);
  const activeTask = context.tasks.find((item) => item.id === active?.taskId);
  const task = activeTask || recommended;
  const plan = history.at(-1);
  const todayBlocks =
    plan?.blocks.filter(
      (block) => dayKey(block.starts_at) === dayKey(context.now),
    ) || [];
  const completed = context.tasks.filter(
    (item) => item.status === "completed",
  ).length;
  const deadlines = [...context.tasks]
    .filter((item) => item.status !== "completed")
    .sort((a, b) => Date.parse(a.deadline) - Date.parse(b.deadline))
    .filter(
      (item, index, list) =>
        list.findIndex(
          (other) => other.assignment_id === item.assignment_id,
        ) === index,
    )
    .slice(0, 3);
  const taskRisk = recommendation?.assignment_risks.find(
    (risk) => risk.assignment_id === task?.assignment_id,
  );
  return (
    <>
      <PageHeading
        eyebrow={date(
          context.now,
          { weekday: "long", day: "numeric", month: "long" },
          locale,
        )}
        title={t("today.title")}
        action={
          <button
            className="icon-button"
            disabled={loading}
            onClick={() => void refresh()}
            aria-label={t("common.refresh")}
          >
            <Icon name="refresh" size={18} />
          </button>
        }
      />
      {!plan && (
        <div className="weekly-alert success no-plan" role="status">
          <Icon name="plan" size={18} />
          <p>
            <strong>
              {c("Tuần này chưa có kế hoạch", "No plan for this week yet")}
            </strong>{" "}
            {c(
              "— đặt mục tiêu và thời gian rảnh, Compass sẽ đề xuất lịch để bạn duyệt.",
              "— set a goal and free time; Compass proposes a schedule to approve.",
            )}
          </p>
          <Link className="primary" href="/plan">
            {c("Lập kế hoạch tuần", "Plan my week")}
            <Icon name="arrow" size={16} />
          </Link>
        </div>
      )}
      <WeekAlerts plan={plan} />
      {saved && (
        <p className="form-success" role="status">
          <Icon name="check" size={16} />
          {saved}
        </p>
      )}
      <div className="today-grid focused-today">
        <div className="today-primary">
          <section className="next-action panel">
            <div className="section-heading">
              <span className="eyebrow accent inline">
                <Icon name="compass" size={17} />
                {activeTask
                  ? c("ĐANG LÀM", "IN PROGRESS")
                  : language === "vi"
                    ? "VIỆC NÊN LÀM"
                    : "YOUR NEXT STEP"}
              </span>
            </div>
            {task ? (
              <>
                <p className="course-label">
                  {task.course} · {task.assignment_title}
                </p>
                <h2 className="action-title">{task.title}</h2>
                <div className="action-meta">
                  {taskRisk && (
                    <Badge
                      tone={
                        taskRisk.level === "high"
                          ? "danger"
                          : taskRisk.level === "unknown"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      <Icon name="alert" size={13} />
                      {riskText(taskRisk.level)}
                    </Badge>
                  )}
                  <span>
                    <Icon name="plan" size={16} />
                    {t("common.due")}{" "}
                    {date(
                      task.deadline,
                      {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      },
                      locale,
                    )}
                  </span>
                  <span>
                    <Icon name="clock" size={16} />
                    {minutes(task.estimated_duration_seconds)}{" "}
                    {t("common.minutes")}
                  </span>
                </div>
                <div className="action-bottom">
                  {activeTask ? (
                    <>
                      <button
                        className="primary"
                        onClick={() => setFinishing("completed")}
                      >
                        {c("Hoàn thành", "Complete")}
                        <Icon name="check" size={17} />
                      </button>
                      <button
                        className="secondary"
                        onClick={() => setFinishing("partial")}
                      >
                        {c("Tạm dừng", "Pause")}
                      </button>
                    </>
                  ) : (
                    <button
                      className={plan ? "primary" : "secondary"}
                      onClick={() => start(task.id)}
                    >
                      {c("Bắt đầu", "Start")}
                      <Icon name="arrow" size={17} />
                    </button>
                  )}
                  <button
                    className="text-link"
                    onClick={() => setRecording(task)}
                  >
                    {t("today.recordWork")}
                  </button>
                  <Link href="/learn" className="text-link">
                    {c(
                      "Tài liệu & Trợ lý Compass",
                      "Materials & Compass Assistant",
                    )}
                    <Icon name="ask" size={15} />
                  </Link>
                </div>
                {recommended && rec?.evidence && task.id === recommended.id && (
                  <details className="why-box compact-disclosure">
                    <summary>{t("today.explanation")}</summary>
                    <p lang="vi">
                      {recommendation?.explanation?.text ||
                        rec.reason_codes
                          ?.map((code) => label(code, language))
                          .join(" ")}
                    </p>
                    <details className="decision-evidence">
                      <summary>{t("today.evidence")}</summary>
                      <Badge>
                        {recommendation?.explanation?.source === "ai"
                          ? t("today.online")
                          : t("today.offline")}
                      </Badge>
                      <p className="fine-print">{t("today.decisionText")}</p>
                      <ul>
                        {[
                          ...(rec.reason_codes || []),
                          ...rec.evidence.risk_reason_codes,
                        ].map((code) => (
                          <li key={code}>{label(code, language)}</li>
                        ))}
                      </ul>
                      {taskRisk && (
                        <p className="fine-print">
                          {c("Còn", "Remaining")}{" "}
                          {minutes(
                            taskRisk.evidence.remaining_effort_seconds || 0,
                          )}{" "}
                          {c(
                            "phút việc · thời gian rảnh trước hạn",
                            "min of work · free time before deadline",
                          )}{" "}
                          {minutes(
                            taskRisk.evidence.available_capacity_seconds || 0,
                          )}{" "}
                          {t("common.minutes")}
                        </p>
                      )}
                    </details>
                  </details>
                )}
              </>
            ) : (
              <Empty title={t("today.clearForNow")}>
                <p>{t("today.clearForNowText")}</p>
                <Link className="secondary" href="/reflect">
                  {language === "vi"
                    ? "Tổng kết & phản tư tuần"
                    : "Review your week"}
                  <Icon name="arrow" size={16} />
                </Link>
              </Empty>
            )}
          </section>
          <section className="panel">
            <div className="section-heading">
              <h2>{t("today.todaysPlan")}</h2>
              <Link href="/plan" className="text-link">
                {t("today.viewWeek")}
                <Icon name="arrow" size={15} />
              </Link>
            </div>
            {todayBlocks.length ? (
              todayBlocks.map((block, i) => {
                const blockTask = context.tasks.find(
                  (item) => item.id === block.task_id,
                );
                return (
                  <BlockRow
                    key={i}
                    block={block}
                    task={blockTask}
                    action={
                      blockTask &&
                      blockTask.status !== "completed" &&
                      blockTask.id !== activeTask?.id ? (
                        <button
                          className="secondary small"
                          aria-label={`${c("Bắt đầu", "Start")} ${blockTask.title}`}
                          onClick={() => start(blockTask.id)}
                        >
                          {c("Bắt đầu", "Start")}
                        </button>
                      ) : undefined
                    }
                  />
                );
              })
            ) : (
              <div className="quiet-empty">
                <p>
                  {language === "vi"
                    ? "Hôm nay chưa có phiên học được xếp lịch."
                    : "No study sessions scheduled for today."}
                </p>
                <Link href="/plan" className="text-link">
                  {language === "vi"
                    ? "Mở kế hoạch tuần"
                    : "Open your weekly plan"}
                  <Icon name="arrow" size={15} />
                </Link>
              </div>
            )}
          </section>
        </div>
        <aside
          className="today-secondary"
          aria-label={
            language === "vi" ? "Deadline và tiến độ" : "Deadlines and progress"
          }
        >
          <section className="panel">
            <div className="section-heading">
              <h2>{t("today.comingUp")}</h2>
              <Icon name="plan" size={18} />
            </div>
            {deadlines.map((item) => (
              <div className="deadline-row" key={item.assignment_id}>
                <span className="deadline-date">
                  <strong>{date(item.deadline, { day: "2-digit" })}</strong>
                  {date(item.deadline, { month: "short" }, locale)}
                </span>
                <div>
                  <strong>{item.assignment_title}</strong>
                  <span>{item.course}</span>
                </div>
              </div>
            ))}
            {!deadlines.length && (
              <p className="muted">
                {language === "vi"
                  ? "Không còn deadline đang mở."
                  : "No open deadlines."}
              </p>
            )}
            <details className="compact-disclosure risk-overview">
              <summary>
                {language === "vi"
                  ? "Xem đánh giá deadline"
                  : "Review deadline risk"}
              </summary>
              <p className="fine-print">{t("today.riskNote")}</p>
              {recommendation?.assignment_risks.map((risk) => (
                <details className="risk-row" key={risk.assignment_id}>
                  <summary>
                    {context.assignments?.find(
                      (item) => item.assignment_id === risk.assignment_id,
                    )?.title ||
                      context.tasks.find(
                        (item) => item.assignment_id === risk.assignment_id,
                      )?.assignment_title ||
                      t("common.task")}{" "}
                    · <strong>{riskText(risk.level)}</strong>
                  </summary>
                  {risk.reason_codes.map((code) => (
                    <p key={code}>{label(code, language)}</p>
                  ))}
                </details>
              ))}
            </details>
          </section>
          <section className="panel compact-progress">
            <div className="section-heading">
              <h2>{t("today.progress")}</h2>
              <strong>
                {completed}/{context.tasks.length}
              </strong>
            </div>
            <progress
              aria-label={t("today.tasksCompletedLabel")}
              value={completed}
              max={context.tasks.length || 1}
            />
            <Link href="/academic" className="text-link">
              {language === "vi" ? "Xem các bài tập" : "View your assignments"}
              <Icon name="arrow" size={15} />
            </Link>
          </section>
        </aside>
      </div>
      {recording && (
        <RecordWork task={recording} onClose={() => setRecording(null)} />
      )}
      {finishing && activeTask && (
        <FinishTask
          task={activeTask}
          outcome={finishing}
          onClose={() => setFinishing(null)}
          onSaved={() => {
            clear();
            setSaved(
              finishing === "completed"
                ? c("Đã hoàn thành: ", "Completed: ") + activeTask.title
                : c("Đã lưu tiến độ: ", "Progress saved: ") + activeTask.title,
            );
          }}
        />
      )}
    </>
  );
}

function RecordWork({ task, onClose }: { task: Task; onClose: () => void }) {
  const { context, refresh } = useWorkspace();
  const { t } = usePreferences();
  const dialog = useRef<HTMLDialogElement>(null);
  const retry = useRef<{ signature: string; id: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const now = context?.now || new Date().toISOString();
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!context) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const body = {
        student: context.student,
        task_id: task.id,
        started_at: new Date(String(form.get("start"))).toISOString(),
        ended_at: new Date(String(form.get("end"))).toISOString(),
        outcome: String(form.get("outcome")),
      };
      const signature = JSON.stringify(body);
      if (retry.current?.signature !== signature)
        retry.current = { signature, id: crypto.randomUUID() };
      await api("task-executions", { ...body, record_id: retry.current.id });
      await refresh();
      onClose();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="work-dialog"
      onCancel={onClose}
      onClose={onClose}
    >
      <div className="section-heading">
        <h2>{t("execution.title")}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label={t("execution.close")}
        >
          <Icon name="close" />
        </button>
      </div>
      <p className="muted">{task.title}</p>
      <form onSubmit={submit} className="form-stack">
        <label>
          {t("execution.startedAt")}{" "}
          <span className="muted">({t("execution.deviceTimezone")})</span>
          <input
            name="start"
            type="datetime-local"
            defaultValue={localInput(
              new Date(Date.parse(now) - 25 * 60000).toISOString(),
            )}
            required
          />
        </label>
        <label>
          {t("execution.endedAt")}
          <input
            name="end"
            type="datetime-local"
            defaultValue={localInput(now)}
            required
          />
        </label>
        <fieldset>
          <legend>{t("execution.outcome")}</legend>
          <label className="choice">
            <input type="radio" name="outcome" value="partial" defaultChecked />
            {t("execution.partial")}
          </label>
          <label className="choice">
            <input type="radio" name="outcome" value="completed" />
            {t("execution.completed")}
          </label>
        </fieldset>
        <Feedback error={error} />
        <button className="primary" disabled={busy}>
          {busy ? t("execution.saving") : t("execution.save")}
          <Icon name="check" size={16} />
        </button>
        <p className="fine-print">{t("execution.note")}</p>
      </form>
    </dialog>
  );
}

export function WeeklyPlan() {
  const { context, history, revision } = useWorkspace();
  const { t, language } = usePreferences();
  const c = useCopy();
  const [adapting, setAdapting] = useState(false);
  const [approved, setApproved] = useState(false);
  useEffect(() => {
    // Today's "Reschedule" link opens the adaptation flow directly.
    if (new URLSearchParams(window.location.search).get("adapt") !== "1")
      return;
    const frame = window.requestAnimationFrame(() => setAdapting(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);
  if (!context) return null;
  const plan = history.at(-1);
  if (!plan)
    return (
      <>
        <PageHeading
          title={c("Lập kế hoạch tuần", "Plan your week")}
          description={c(
            "Đặt mục tiêu, chọn thời gian rảnh, xem đề xuất của Compass rồi duyệt.",
            "Set a goal, choose free time, review Compass's proposal, then approve it.",
          )}
        />
        <PlanWizard onApproved={() => setApproved(true)} />
      </>
    );
  return (
    <>
      <PageHeading
        title={t("plan.title")}
        description={t("plan.description")}
        action={
          !adapting && (
            <button className="primary" onClick={() => setAdapting(true)}>
              <Icon name="refresh" size={16} />
              {t("plan.adjust")}
            </button>
          )
        }
      />
      {approved && plan.revision === 1 && !adapting && (
        <div className="weekly-alert success" role="status">
          <Icon name="check" size={18} />
          <p>{c("Đã duyệt kế hoạch tuần.", "Weekly plan approved.")}</p>
          <Link className="secondary small" href="/today">
            {c("Bắt đầu hôm nay", "Start today")}
          </Link>
        </div>
      )}
      {adapting ? (
        <AdaptFlow plan={plan} onDone={() => setAdapting(false)} />
      ) : (
        <>
          <div className="plan-toolbar">
            <div>
              <Icon name="plan" size={19} />
              <strong>
                {date(plan.period.start, { day: "numeric", month: "short" })} —{" "}
                {date(new Date(Date.parse(plan.period.end) - 1).toISOString(), {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </strong>
            </div>
            <div>
              <span className="muted">{t("common.hanoiTime")}</span>
              <Badge tone="success">
                {t("plan.revision")} {plan.revision}
              </Badge>
            </div>
          </div>
          <div className="plan-stats">
            <span>
              <strong>{plan.blocks.length}</strong> {t("plan.studyBlocks")}
            </span>
            <span>
              <strong>
                {minutes(
                  plan.blocks.reduce(
                    (s, b) =>
                      s +
                      (Date.parse(b.ends_at) - Date.parse(b.starts_at)) / 1000,
                    0,
                  ),
                )}{" "}
                {t("common.minutes")}
              </strong>{" "}
              {t("plan.planned")}
            </span>
            <span>
              <strong>{plan.unplanned_tasks.length}</strong>{" "}
              {t("plan.attention")}
            </span>
          </div>
          <PlanDays plan={plan} tasks={context.tasks} />
          <Attention plan={plan} tasks={context.tasks} />
          {revision && revision.plan.record_id === plan.record_id && (
            <ChangeReview
              result={revision}
              baseline={history.find(
                (p) => p.record_id === plan.parent_record_id,
              )}
            />
          )}
          <div className="plan-next-links">
            <Link className="text-link" href="/reflect">
              <Icon name="reflect" size={16} />
              {language === "vi"
                ? "Tổng kết & phản tư tuần"
                : "Review your week"}
            </Link>
            <Link className="text-link" href="/history">
              <Icon name="history" size={16} />
              {language === "vi" ? "Xem các bản đã lưu" : "See saved versions"}
            </Link>
          </div>
        </>
      )}
    </>
  );
}

function ChangeReview({
  result,
  baseline,
}: {
  result: Replan;
  baseline?: Plan;
}) {
  const { context } = useWorkspace();
  const { t, language } = usePreferences();
  if (!context) return null;
  return (
    <section className="panel change-review">
      <div className="section-heading">
        <h2>{t("plan.updated")}</h2>
        <Badge tone="success">
          Revision {baseline?.revision || result.plan.revision - 1} →{" "}
          {result.plan.revision}
        </Badge>
      </div>
      {result.changes.length ? (
        result.changes.map((change) => (
          <div className="change-row" key={change.task_id}>
            <strong>
              {context.tasks.find((t) => t.id === change.task_id)?.title}
            </strong>
            <div className="change-comparison">
              <span>
                <small>{t("common.before")}</small>
                {baseline?.blocks.some((b) => b.task_id === change.task_id)
                  ? baseline.blocks
                      .filter((b) => b.task_id === change.task_id)
                      .map((b, i) => (
                        <span key={i}>
                          {date(b.starts_at, { weekday: "short" })}{" "}
                          {time(b.starts_at)}–{time(b.ends_at)}{" "}
                        </span>
                      ))
                  : baseline
                    ? t("plan.noScheduled")
                    : t("plan.baselineUnavailable")}
              </span>
              <Icon name="arrow" size={17} />
              <span>
                <small>{t("common.after")}</small>
                {result.plan.blocks.some((b) => b.task_id === change.task_id)
                  ? result.plan.blocks
                      .filter((b) => b.task_id === change.task_id)
                      .map((b, i) => (
                        <span key={i}>
                          {date(b.starts_at, { weekday: "short" })}{" "}
                          {time(b.starts_at)}–{time(b.ends_at)}{" "}
                        </span>
                      ))
                  : t("plan.noScheduled")}
              </span>
            </div>
            <p>
              {change.reasons.map((code) => label(code, language)).join(" · ")}
            </p>
          </div>
        ))
      ) : (
        <p className="muted">{t("plan.reflectionInfo")}</p>
      )}
      {baseline && (
        <details className="preserved-blocks">
          <summary>{t("plan.preserved")}</summary>
          {baseline.blocks
            .filter((before) =>
              result.plan.blocks.some(
                (after) =>
                  after.task_id === before.task_id &&
                  after.starts_at === before.starts_at &&
                  after.ends_at === before.ends_at,
              ),
            )
            .map((block, index) => (
              <BlockRow
                key={index}
                block={block}
                task={context.tasks.find((task) => task.id === block.task_id)}
              />
            ))}
          <p className="fine-print">{t("plan.exactMatches")}</p>
        </details>
      )}
      <p className="fine-print">
        {result.informational_reflection_signals.length
          ? t("plan.reflectionInfo")
          : t("plan.backendReasons")}
      </p>
    </section>
  );
}

export function Reflect() {
  const { context, refresh, advanceClock } = useWorkspace();
  const { t, language } = usePreferences();
  const c = useCopy();
  const router = useRouter();
  const [moving, setMoving] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const original = useRef<object | null>(null);
  const answerVersion = useRef(0);
  if (!context) return null;
  const ctx = context;
  function invalidate() {
    answerVersion.current += 1;
    setCandidates(null);
    setSelected([]);
    setSuccess("");
  }
  async function review(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const version = answerVersion.current;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setSuccess("");
    const payload = {
      student: ctx.student,
      period: ctx.period,
      responses: {
        reflected_task_ids: form.getAll("reflected"),
        workload_feedback: form.get("workload") || null,
        difficult_topics: String(form.get("topics") || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        deferred_task_ids: form.getAll("deferred"),
      },
    };
    try {
      const result = await api<{ candidates: Candidate[] }>(
        "reflections/candidates",
        payload,
      );
      if (version !== answerVersion.current) return;
      original.current = payload;
      setCandidates(result.candidates);
      setSelected([]);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    setBusy(true);
    setError("");
    try {
      await api("reflections/confirm", {
        ...original.current,
        record_id: crypto.randomUUID(),
        selected_signal_ids: selected,
      });
      setSuccess(t("reflection.confirmed"));
      setCandidates(null);
      await refresh();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }
  function description(candidate: Candidate) {
    switch (candidate.kind) {
      case "estimation_feedback":
        return `${ctx.tasks.find((t) => t.id === candidate.task_id)?.title}: ${t("reflection.estimation")} ${minutes(candidate.estimated_duration_seconds)} ${t("common.minutes")} → ${language === "vi" ? "đã ghi nhận" : "recorded"} ${minutes(candidate.actual_duration_seconds)} ${t("common.minutes")}`;
      case "workload_feedback":
        return `${t("reflection.workloadFelt")} ${label(candidate.reported, language).toLowerCase()}`;
      case "difficult_topic":
        return `${t("reflection.difficultTopic")}: ${candidate.topic}`;
      case "deferred_task":
        return (
          `${t("reflection.deferredTask")}: ` +
          ctx.tasks.find((t) => t.id === candidate.task_id)?.title
        );
    }
  }
  return (
    <>
      <PageHeading
        title={t("reflection.title")}
        description={t("reflection.description")}
      />
      <WeeklySummary />
      <div className="reflection-grid focused-reflection">
        <ol
          className="reflection-steps"
          aria-label={
            language === "vi" ? "Các bước phản hồi" : "Reflection steps"
          }
        >
          <li aria-current={!candidates ? "step" : undefined}>
            <span>1</span>
            {t("reflection.yourReflection")}
          </li>
          <li aria-current={candidates ? "step" : undefined}>
            <span>2</span>
            {t("reflection.candidates")}
          </li>
        </ol>
        <details
          className="panel reflection-form reflection-input"
          open={!candidates}
        >
          <summary>
            {candidates
              ? language === "vi"
                ? "Sửa phản hồi"
                : "Edit my notes"
              : t("reflection.yourReflection")}
          </summary>
          <form onSubmit={review} onChange={invalidate} className="form-stack">
            <fieldset>
              <legend>{t("reflection.whatWorkedOn")}</legend>
              {ctx.tasks.map((t) => (
                <label className="task-choice" key={t.id}>
                  <input name="reflected" type="checkbox" value={t.id} />
                  <span>
                    <strong>{t.title}</strong>
                    <small>{t.course}</small>
                  </span>
                  <Status status={t.status} />
                </label>
              ))}
            </fieldset>
            <fieldset>
              <legend>{t("reflection.workload")}</legend>
              <div className="workload-choices">
                {["too_light", "appropriate", "too_heavy"].map((value) => (
                  <label className="choice-tile" key={value}>
                    <input type="radio" name="workload" value={value} />
                    {label(value, language)}
                  </label>
                ))}
              </div>
            </fieldset>
            <label>
              {t("reflection.difficultTopics")}
              <input
                name="topics"
                placeholder={t("reflection.topicsPlaceholder")}
              />
              <span className="fine-print">{t("reflection.commaHint")}</span>
            </label>
            <details className="compact-disclosure deferred-feedback">
              <summary>
                {t("reflection.deferred")}{" "}
                {language === "vi" ? "(tùy chọn)" : "(optional)"}
              </summary>
              <fieldset>
                <legend>{t("reflection.deferred")}</legend>
                <p className="fine-print">{t("reflection.deferredHint")}</p>
                {ctx.tasks.map((t) => (
                  <label className="choice" key={t.id}>
                    <input name="deferred" type="checkbox" value={t.id} />
                    {t.title}
                  </label>
                ))}
              </fieldset>
            </details>
            <button className="primary" disabled={busy}>
              {busy ? t("reflection.reviewing") : t("reflection.review")}
              <Icon name="arrow" size={16} />
            </button>
          </form>
        </details>
        {candidates && (
          <section className="panel insights">
            <div className="section-heading">
              <h2>{t("reflection.candidates")}</h2>
            </div>
            {candidates ? (
              <>
                <p className="muted">{t("reflection.proposalsHint")}</p>
                {candidates.length ? (
                  candidates.map((c) => (
                    <label className="insight-choice" key={c.id}>
                      <input
                        type="checkbox"
                        aria-label={description(c)}
                        checked={selected.includes(c.id)}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...selected, c.id]
                              : selected.filter((id) => id !== c.id),
                          )
                        }
                      />
                      <span>
                        <Badge
                          tone={c.source === "factual" ? "success" : "neutral"}
                        >
                          {c.source === "factual"
                            ? t("reflection.factual")
                            : t("reflection.selfReported")}
                        </Badge>
                        <strong>{description(c)}</strong>
                      </span>
                    </label>
                  ))
                ) : (
                  <Empty title={t("reflection.noSignals")}>
                    <p>{t("reflection.noSignalsText")}</p>
                  </Empty>
                )}
                <button
                  className="primary"
                  disabled={busy || !selected.length}
                  onClick={() => void confirm()}
                >
                  {busy
                    ? t("reflection.saving")
                    : t("reflection.saveConfirmed")}
                  <Icon name="check" size={16} />
                </button>
                <p className="fine-print">{t("reflection.unselected")}</p>
              </>
            ) : (
              <Empty title={t("reflection.insightsHere")}>
                <p>{t("reflection.insightsHereText")}</p>
              </Empty>
            )}
          </section>
        )}
        <Feedback error={error} success={success} />
        {success &&
          (hasDemoClock(ctx) ? (
            <button
              className="primary"
              disabled={moving}
              onClick={async () => {
                // Demo-only: jump to next Monday so the next week can be planned now.
                setMoving(true);
                await advanceClock("next_week");
                router.push("/plan");
              }}
            >
              {c("Lập kế hoạch tuần sau", "Plan next week")}
              <Icon name="arrow" size={16} />
            </button>
          ) : (
            <Link href="/plan" className="secondary">
              {language === "vi"
                ? "Tiếp tục với kế hoạch tuần"
                : "Continue to your weekly plan"}
              <Icon name="arrow" size={16} />
            </Link>
          ))}
      </div>
    </>
  );
}

export function History() {
  const { context, history } = useWorkspace();
  const { t, language } = usePreferences();
  if (!context) return null;
  return (
    <>
      <PageHeading
        title={t("history.title")}
        description={t("history.description")}
      />
      <section className="panel history-panel">
        <div className="section-heading">
          <h2>{t("history.revision")}</h2>
          <Badge>
            {history.length} {t("history.revisions")}
          </Badge>
        </div>
        {history.length ? (
          <div className="timeline">
            {[...history].reverse().map((plan, i) => (
              <details key={plan.record_id} className="revision">
                <summary>
                  <span className="timeline-node">
                    <Icon name={i === 0 ? "compass" : "history"} size={18} />
                  </span>
                  <div>
                    <div className="inline">
                      <h3>
                        {t("history.revision")} {plan.revision}
                      </h3>
                      {i === 0 && (
                        <Badge tone="success">{t("common.current")}</Badge>
                      )}
                    </div>
                    <p>
                      {plan.revision === 1
                        ? t("history.initial")
                        : t("history.adaptive")}{" "}
                      ·{" "}
                      {date(plan.saved_at, {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    <div className="revision-meta">
                      {plan.blocks.length} {t("plan.studyBlocks")} ·{" "}
                      {plan.unplanned_tasks.length} {t("plan.unplanned")}
                    </div>
                  </div>
                  <span className="view-revision">
                    {t("history.viewPlan")}
                    <Icon name="arrow" size={15} />
                  </span>
                </summary>
                <div className="revision-content">
                  <p className="fine-print">
                    {t("plan.planner")} v{plan.planner_version}
                  </p>
                  <PlanDays plan={plan} tasks={context.tasks} />
                  <Attention plan={plan} tasks={context.tasks} />
                </div>
              </details>
            ))}
          </div>
        ) : (
          <Empty title={t("history.storyTitle")}>
            <p>{t("history.storyText")}</p>
            <Link href="/plan" className="secondary">
              {t("history.goToPlan")}
            </Link>
          </Empty>
        )}
      </section>
      <WeekHistoryList />
      <details className="compact-disclosure history-note">
        <summary>
          {language === "vi"
            ? "Về các bản kế hoạch đã lưu"
            : "About saved plans"}
        </summary>
        <Icon name="history" size={18} />
        <p>{t("history.note")}</p>
      </details>
    </>
  );
}

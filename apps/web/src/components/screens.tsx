"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  api,
  Candidate,
  date,
  dayKey,
  label,
  minutes,
  Plan,
  Replan,
  Task,
  time,
  Window,
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
  const locale = language === "vi" ? "vi-VN" : "en-GB";
  const [recording, setRecording] = useState<Task | null>(null);
  if (!context) return null;
  const rec = recommendation?.recommendation;
  const task = context.tasks.find((item) => item.id === rec?.task_id);
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
  const riskText = (level: string) =>
    ({
      high: language === "vi" ? "Rủi ro cao" : "High risk",
      medium: language === "vi" ? "Cần chú ý" : "Needs attention",
      low: language === "vi" ? "Trong tầm kiểm soát" : "On track",
      unknown: language === "vi" ? "Chưa đủ dữ liệu" : "Not enough data",
    })[level] || level;
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
      <div className="today-grid focused-today">
        <div className="today-primary">
          <section className="next-action panel">
            <div className="section-heading">
              <span className="eyebrow accent inline">
                <Icon name="compass" size={17} />
                {language === "vi" ? "VIỆC NÊN LÀM" : "YOUR NEXT STEP"}
              </span>
            </div>
            {task && rec?.evidence ? (
              <>
                <p className="course-label">
                  {task.course} · {task.assignment_title}
                </p>
                <h2 className="action-title">{task.title}</h2>
                <div className="action-meta">
                  <Badge
                    tone={
                      rec.evidence.risk_level === "high"
                        ? "danger"
                        : rec.evidence.risk_level === "unknown"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    <Icon name="alert" size={13} />
                    {riskText(rec.evidence.risk_level)}
                  </Badge>
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
                    {minutes(rec.evidence.estimated_duration_seconds)}{" "}
                    {t("common.minutes")}
                  </span>
                </div>
                <div className="action-bottom">
                  <button
                    className="primary"
                    onClick={() => setRecording(task)}
                  >
                    {t("today.recordWork")}
                    <Icon name="arrow" size={17} />
                  </button>
                  <Link href="/reflect" className="text-link">
                    {language === "vi"
                      ? "Nhìn lại buổi học"
                      : "Review your study session"}
                    <Icon name="reflect" size={15} />
                  </Link>
                </div>
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
                    <p>
                      {t("today.ranking")}{" "}
                      <code>{rec.evidence.deciding_dimension}</code>
                    </p>
                    <ul>
                      {rec.reason_codes?.map((code) => (
                        <li key={code}>
                          <code>{code}</code> · {label(code, language)}
                        </li>
                      ))}
                    </ul>
                    <ul>
                      {rec.evidence.risk_reason_codes.map((code) => (
                        <li key={code}>
                          <code>{code}</code> · {label(code, language)}
                        </li>
                      ))}
                    </ul>
                    <pre>
                      {JSON.stringify(
                        recommendation?.assignment_risks.find(
                          (risk) => risk.assignment_id === task.assignment_id,
                        )?.evidence,
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                </details>
              </>
            ) : (
              <Empty title={t("today.clearForNow")}>
                <p>{t("today.clearForNowText")}</p>
                <Link className="secondary" href="/reflect">
                  {language === "vi"
                    ? "Nhìn lại buổi học"
                    : "Review your studying"}
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
              todayBlocks.map((block, i) => (
                <BlockRow
                  key={i}
                  block={block}
                  task={context.tasks.find((item) => item.id === block.task_id)}
                />
              ))
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
                  <details className="decision-evidence">
                    <summary>
                      {language === "vi"
                        ? "Dữ liệu tính toán"
                        : "Calculation data"}
                    </summary>
                    <pre>{JSON.stringify(risk.evidence, null, 2)}</pre>
                  </details>
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
  const [editing, setEditing] = useState(false);
  if (!context) return null;
  const plan = history.at(-1);
  return (
    <>
      <PageHeading
        title={t("plan.title")}
        description={t("plan.description")}
        action={
          <button className="primary" onClick={() => setEditing(!editing)}>
            <Icon name={plan ? "refresh" : "plus"} size={16} />
            {editing
              ? t("plan.closeEditor")
              : plan
                ? t("plan.adjust")
                : t("plan.generate")}
          </button>
        }
      />
      {editing ? (
        <PlanEditor plan={plan} onDone={() => setEditing(false)} />
      ) : plan ? (
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
                ? "Nhìn lại buổi học"
                : "Review your study session"}
            </Link>
            <Link className="text-link" href="/history">
              <Icon name="history" size={16} />
              {language === "vi" ? "Xem các bản đã lưu" : "See saved versions"}
            </Link>
          </div>
          <details className="compact-disclosure">
            <summary>
              {t("common.demo")} · {t("plan.planner")}
            </summary>
            <p className="fine-print">{t("plan.readOnly")}</p>
            <p className="fine-print">
              {t("plan.planner")} v{plan.planner_version}
            </p>
          </details>
        </>
      ) : (
        <Empty title={t("plan.blankTitle")}>
          <p>{t("plan.blankText")}</p>
        </Empty>
      )}
    </>
  );
}

function PlanEditor({ plan, onDone }: { plan?: Plan; onDone: () => void }) {
  const { context, refresh, setRevision } = useWorkspace();
  const { t } = usePreferences();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [windows, setWindows] = useState<Window[]>(
    () => context?.study_windows || [],
  );
  if (!context) return null;
  const ctx = context;
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const submittedWindows: Window[] = windows.map((_, i) => ({
        starts_at: new Date(String(data.get("start-" + i))).toISOString(),
        ends_at: new Date(String(data.get("end-" + i))).toISOString(),
      }));
      const body = {
        student: ctx.student,
        period: ctx.period,
        study_windows: submittedWindows,
        record_id: crypto.randomUUID(),
      };
      if (plan) {
        const result = await api<Replan>("weekly-plans/replan", {
          ...body,
          effective_at: ctx.now,
          remaining_efforts: ctx.tasks
            .filter((t) => t.status !== "completed")
            .map((t) => ({
              task_id: t.id,
              remaining_duration_seconds: Number(data.get(t.id)) * 60,
            })),
        });
        setRevision(result);
      } else {
        await api<Plan>("weekly-plans", body);
      }
      await refresh();
      onDone();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel editor">
      <div className="section-heading">
        <h2>{plan ? t("plan.adjustTitle") : t("plan.createTitle")}</h2>
      </div>
      <form onSubmit={submit} className="form-stack">
        <p className="muted">{t("plan.availability")}</p>
        <div className="window-inputs">
          {windows.map((window, i) => (
            <div
              className="window-input"
              key={`${window.starts_at}:${window.ends_at}`}
            >
              <span className="window-number">0{i + 1}</span>
              <label>
                {t("common.start")}
                <input
                  name={"start-" + i}
                  type="datetime-local"
                  defaultValue={localInput(window.starts_at)}
                  required
                />
              </label>
              <label>
                {t("common.end")}
                <input
                  name={"end-" + i}
                  type="datetime-local"
                  defaultValue={localInput(window.ends_at)}
                  required
                />
              </label>
              {plan && (
                <button
                  aria-label={`${t("plan.removeWindow")} ${i + 1}`}
                  className="secondary small"
                  type="button"
                  onClick={() =>
                    setWindows((current) =>
                      current.filter(
                        (candidate) =>
                          candidate.starts_at !== window.starts_at ||
                          candidate.ends_at !== window.ends_at,
                      ),
                    )
                  }
                >
                  {t("common.remove")}
                </button>
              )}
            </div>
          ))}
        </div>
        {plan && (
          <fieldset>
            <legend>{t("plan.remaining")}</legend>
            <p className="fine-print">{t("plan.remainingHint")}</p>
            {ctx.tasks
              .filter((t) => t.status !== "completed")
              .map((task) => (
                <label className="remaining-input" key={task.id}>
                  <span>
                    {task.title}
                    <small>{task.course}</small>
                  </span>
                  <input
                    aria-label={"Remaining minutes for " + task.title}
                    type="number"
                    name={task.id}
                    min={0}
                    step={1}
                    defaultValue={minutes(task.estimated_duration_seconds)}
                    required
                  />
                  <span>{t("common.minutes")}</span>
                </label>
              ))}
          </fieldset>
        )}
        <Feedback error={error} />
        <div className="inline">
          <button className="primary" disabled={busy}>
            {busy
              ? t("common.saving")
              : plan
                ? t("plan.createRevision")
                : t("plan.generateWeekly")}
            <Icon name="arrow" size={16} />
          </button>
          <button className="secondary" type="button" onClick={onDone}>
            {t("common.cancel")}
          </button>
        </div>
      </form>
    </section>
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
  const { context, refresh } = useWorkspace();
  const { t, language } = usePreferences();
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
        {success && (
          <Link href="/plan" className="secondary">
            {language === "vi"
              ? "Tiếp tục với kế hoạch tuần"
              : "Continue to your weekly plan"}
            <Icon name="arrow" size={16} />
          </Link>
        )}
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
      <details className="compact-disclosure history-note">
        <summary>
          {language === "vi" ? "Về các bản kế hoạch đã lưu" : "About saved plans"}
        </summary>
        <Icon name="history" size={18} />
        <p>{t("history.note")}</p>
      </details>
    </>
  );
}

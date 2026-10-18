"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  AdaptationProposal,
  Adjustment,
  api,
  AssignmentRisk,
  Context,
  date,
  hasDemoClock,
  SIMULATED_MODE,
  GoalDraft,
  minutes,
  missedBlocks,
  Plan,
  PlanProposal,
  ProposedPlan,
  Replan,
  scope,
  Task,
  time,
  WeekHistory,
  WeeklyReview,
  Window,
} from "@/lib/api";
import { Icon } from "./icons";
import { usePreferences } from "./preferences";
import { TaskDecomposition } from "./task-decomposition";
import { Attention, Badge, PlanDays } from "./ui";
import { useWorkspace } from "./workspace";
import styles from "./weekly.module.css";

export function useCopy() {
  const { language } = usePreferences();
  return (vi: string, en: string) => (language === "vi" ? vi : en);
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "Please try again.";
}

function localInput(value: string) {
  const instant = new Date(value);
  return new Date(instant.getTime() - instant.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

function asPlan(plan: ProposedPlan): Plan {
  return {
    ...plan,
    record_id: "proposal",
    revision: 0,
    parent_record_id: null,
    saved_at: plan.generated_at,
  };
}

function seconds(blocks: { starts_at: string; ends_at: string }[]) {
  return blocks.reduce(
    (sum, b) => sum + (Date.parse(b.ends_at) - Date.parse(b.starts_at)) / 1000,
    0,
  );
}

export function useRiskText() {
  const c = useCopy();
  return (level: string) =>
    ({
      high: c("Rủi ro cao", "High risk"),
      medium: c("Cần chú ý", "Needs attention"),
      low: c("Trong tầm kiểm soát", "On track"),
      unknown: c("Chưa đủ dữ liệu", "Not enough data"),
    })[level] || level;
}

function riskTone(level: string) {
  return level === "high"
    ? "danger"
    : level === "medium"
      ? "warning"
      : level === "low"
        ? "success"
        : "neutral";
}

function assignmentTitle(context: Context, assignmentId: string) {
  return (
    context.assignments?.find((a) => a.assignment_id === assignmentId)?.title ||
    context.tasks.find((t) => t.assignment_id === assignmentId)
      ?.assignment_title ||
    ""
  );
}

/* ---------------- Free-time editor ---------------- */

type Row = { key: string; start: string; end: string };

function toRows(windows: Window[]): Row[] {
  return windows.map((w) => ({
    key: crypto.randomUUID(),
    start: localInput(w.starts_at),
    end: localInput(w.ends_at),
  }));
}

function toWindows(rows: Row[]): Window[] {
  return rows
    .filter((row) => row.start && row.end)
    .map((row) => ({
      starts_at: new Date(row.start).toISOString(),
      ends_at: new Date(row.end).toISOString(),
    }));
}

function FreeTimeEditor({
  rows,
  onChange,
  removeLabel,
  fallbackStart,
}: {
  rows: Row[];
  onChange: (rows: Row[]) => void;
  removeLabel: string;
  fallbackStart: string;
}) {
  const c = useCopy();
  function add() {
    const last = rows.at(-1);
    const base = last
      ? new Date(Date.parse(new Date(last.start).toISOString()) + 86400000)
      : new Date(Date.parse(fallbackStart) + 86400000);
    const start = localInput(base.toISOString());
    const end = localInput(new Date(base.getTime() + 3600000).toISOString());
    onChange([...rows, { key: crypto.randomUUID(), start, end }]);
  }
  return (
    <div className="form-stack">
      <div className="window-inputs">
        {rows.map((row, i) => (
          <div className="window-input" key={row.key}>
            <span className="window-number">
              {String(i + 1).padStart(2, "0")}
            </span>
            <label>
              {c("Bắt đầu", "Start")}
              <input
                type="datetime-local"
                value={row.start}
                required
                onChange={(e) =>
                  onChange(
                    rows.map((r) =>
                      r.key === row.key ? { ...r, start: e.target.value } : r,
                    ),
                  )
                }
              />
            </label>
            <label>
              {c("Kết thúc", "End")}
              <input
                type="datetime-local"
                value={row.end}
                required
                onChange={(e) =>
                  onChange(
                    rows.map((r) =>
                      r.key === row.key ? { ...r, end: e.target.value } : r,
                    ),
                  )
                }
              />
            </label>
            <button
              type="button"
              className="secondary small"
              aria-label={`${removeLabel} ${i + 1}`}
              onClick={() => onChange(rows.filter((r) => r.key !== row.key))}
            >
              {removeLabel}
            </button>
          </div>
        ))}
      </div>
      {!rows.length && (
        <p className="muted">
          {c("Chưa có khung giờ rảnh nào.", "No free time added yet.")}
        </p>
      )}
      <button type="button" className="secondary small" onClick={add}>
        <Icon name="plus" size={15} />
        {c("Thêm khung giờ", "Add free time")}
      </button>
    </div>
  );
}

/* ---------------- Risk summary ---------------- */

function RiskList({
  risks,
  context,
}: {
  risks: AssignmentRisk[];
  context: Context;
}) {
  const riskText = useRiskText();
  if (!risks.length) return null;
  return (
    <ul className="weekly-risks">
      {risks.map((risk) => (
        <li key={risk.assignment_id}>
          <span>{assignmentTitle(context, risk.assignment_id)}</span>
          <Badge tone={riskTone(risk.level)}>{riskText(risk.level)}</Badge>
        </li>
      ))}
    </ul>
  );
}

function adjustmentText(
  item: Adjustment,
  c: (vi: string, en: string) => string,
) {
  const [from, to] = item.detail.split("→");
  switch (item.code) {
    case "carry_over":
      return c(
        `${item.detail} việc chưa xong được mang sang tuần này.`,
        `${item.detail} unfinished tasks carry over to this week.`,
      );
    case "workload_too_heavy":
      return c(
        `Tuần trước bạn thấy quá tải → mục tiêu giảm từ ${from} xuống ${to} phút.`,
        `Last week felt too heavy → target lowered from ${from} to ${to} minutes.`,
      );
    case "workload_too_light":
      return c(
        `Tuần trước còn nhẹ → mục tiêu tăng từ ${from} lên ${to} phút.`,
        `Last week felt light → target raised from ${from} to ${to} minutes.`,
      );
    case "underestimated":
      return c(
        `Có việc mất nhiều hơn ước lượng ~${item.detail}% → nên chừa thêm thời gian dự phòng.`,
        `Some work took ~${item.detail}% longer than estimated → keep extra buffer time.`,
      );
    case "deferred_first":
      return c(
        `Ưu tiên sớm việc đã hoãn: ${item.detail}.`,
        `Do deferred work early: ${item.detail}.`,
      );
    case "difficult_topic":
      return c(
        `Dành một buổi ôn chủ đề khó: ${item.detail} (có thể hỏi Trợ lý Compass).`,
        `Set aside a session for: ${item.detail} (ask Compass Assistant).`,
      );
  }
}

/* ---------------- PLAN: goal → proposal → approve ---------------- */

export function PlanWizard({ onApproved }: { onApproved: () => void }) {
  const { context, refresh } = useWorkspace();
  const c = useCopy();
  const { language } = usePreferences();
  const locale = language === "vi" ? "vi-VN" : "en-GB";
  const [draft, setDraft] = useState<GoalDraft | null>(null);
  const [goal, setGoal] = useState("");
  const [target, setTarget] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [proposal, setProposal] = useState<PlanProposal | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const recordId = useRef(crypto.randomUUID());
  const loadedFor = useRef("");

  useEffect(() => {
    if (!context) return;
    const key = context.period.start;
    if (loadedFor.current === key) return;
    loadedFor.current = key;
    api<GoalDraft>("weekly-goals/draft?" + scope(context))
      .then((result) => {
        const windows = result.study_windows.length
          ? result.study_windows
          : context.study_windows;
        setDraft(result);
        setGoal(result.goal_text);
        setTarget(result.target_minutes || Math.round(seconds(windows) / 60));
        setRows(toRows(windows));
      })
      .catch((err) => setError(message(err)));
  }, [context]);

  if (!context) return null;
  const ctx = context;
  const freeMinutes = Math.round(seconds(toWindows(rows)) / 60);
  const assignments = [...(ctx.assignments || [])].sort(
    (a, b) => Date.parse(a.deadline) - Date.parse(b.deadline),
  );

  async function preview(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      setProposal(
        await api<PlanProposal>("weekly-plans/preview", {
          student: ctx.student,
          period: ctx.period,
          study_windows: toWindows(rows),
        }),
      );
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    setBusy(true);
    setError("");
    try {
      await api<Plan>("weekly-plans/approve", {
        student: ctx.student,
        period: ctx.period,
        study_windows: toWindows(rows),
        goal_text: goal,
        target_minutes: target,
        record_id: recordId.current,
      });
      onApproved();
      await refresh();
    } catch (err) {
      setError(message(err));
      setBusy(false);
    }
  }

  if (proposal) {
    const plan = asPlan(proposal.plan);
    const taskCount = new Set(plan.blocks.map((b) => b.task_id)).size;
    return (
      <section
        className={`weekly-step ${styles.preview}`}
        aria-label={c("Kế hoạch đề xuất", "Proposed plan")}
      >
        <ol className="weekly-progress" aria-label={c("Các bước", "Steps")}>
          <li>{c("Mục tiêu & thời gian rảnh", "Goal & free time")}</li>
          <li aria-current="step">{c("Xem & duyệt", "Review & approve")}</li>
        </ol>
        <div className="panel weekly-summary-card">
          <h2>
            {c("Kế hoạch đề xuất cho tuần này", "Proposed plan for this week")}
          </h2>
          <p>
            {c(
              `Compass xếp ${minutes(seconds(plan.blocks))} phút cho ${taskCount} việc trong ${plan.blocks.length} buổi học, ưu tiên deadline gần nhất và chỉ dùng thời gian rảnh bạn đã chọn.`,
              `Compass scheduled ${minutes(seconds(plan.blocks))} minutes for ${taskCount} tasks across ${plan.blocks.length} sessions, earliest deadlines first, only inside your free time.`,
            )}
          </p>
          {goal && (
            <p className="muted">
              {c("Mục tiêu", "Goal")}: {goal}
            </p>
          )}
          <RiskList risks={proposal.assignment_risks} context={ctx} />
        </div>
        <PlanDays plan={plan} tasks={ctx.tasks} />
        <Attention plan={plan} tasks={ctx.tasks} />
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div
          className={styles.approvalBar}
          role="region"
          aria-label={c("Duyệt kế hoạch tuần", "Approve weekly plan")}
        >
          <dl className={styles.summary}>
            <div>
              <dt>{c("Phút học", "Study minutes")}</dt>
              <dd>{minutes(seconds(plan.blocks))}</dd>
            </div>
            <div>
              <dt>{c("Phiên học", "Study sessions")}</dt>
              <dd>{plan.blocks.length}</dd>
            </div>
            <div>
              <dt>{c("Việc chưa xếp", "Unscheduled tasks")}</dt>
              <dd>{plan.unplanned_tasks.length}</dd>
            </div>
          </dl>
          <div className={styles.approvalActions}>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setProposal(null)}
            >
              {c("Chỉnh sửa", "Edit")}
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void approve()}
            >
              {busy
                ? c("Đang lưu…", "Saving…")
                : c("Duyệt kế hoạch", "Approve plan")}
              <Icon name="check" size={16} />
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <form className="weekly-step" onSubmit={preview}>
      <ol className="weekly-progress" aria-label={c("Các bước", "Steps")}>
        <li aria-current="step">
          {c("Mục tiêu & thời gian rảnh", "Goal & free time")}
        </li>
        <li>{c("Xem & duyệt", "Review & approve")}</li>
      </ol>
      {draft && draft.adjustments.length > 0 && (
        <section className="panel weekly-suggestions">
          <div className="section-heading">
            <h2>{c("Gợi ý từ tuần trước", "From last week's reflection")}</h2>
            <Icon name="reflect" size={18} />
          </div>
          <ul>
            {draft.adjustments.map((item) => (
              <li key={item.code}>{adjustmentText(item, c)}</li>
            ))}
          </ul>
        </section>
      )}
      <section className="panel form-stack">
        <h2>{c("1. Mục tiêu tuần", "1. Weekly goal")}</h2>
        <label>
          {c(
            "Tuần này bạn muốn đạt được điều gì?",
            "What do you want to achieve this week?",
          )}
          <textarea
            name="goal"
            rows={2}
            maxLength={500}
            value={goal}
            placeholder={c(
              "Ví dụ: Nộp bài CSDL đúng hạn và hoàn thành Lab 2",
              "e.g. Submit the database assignment on time",
            )}
            onChange={(e) => setGoal(e.target.value)}
          />
        </label>
        <label>
          {c("Thời lượng muốn học (phút)", "Study target (minutes)")}
          <input
            type="number"
            min={0}
            max={10080}
            step={15}
            value={target}
            onChange={(e) => setTarget(Number(e.target.value))}
          />
          <span className="fine-print">
            {c(
              `Thời gian rảnh đã chọn: ${freeMinutes} phút.`,
              `Free time selected: ${freeMinutes} minutes.`,
            )}
            {target > freeMinutes &&
              c(
                " Mục tiêu lớn hơn thời gian rảnh — hãy thêm khung giờ.",
                " Target exceeds free time — add more free time.",
              )}
          </span>
        </label>
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2>{c("2. Bài tập & deadline", "2. Assignments & deadlines")}</h2>
          <Link href="/academic" className="text-link">
            {c("Xem tất cả", "View all")}
            <Icon name="arrow" size={15} />
          </Link>
        </div>
        {assignments.map((item) => (
          <div className="weekly-assignment" key={item.assignment_id}>
            <span className="deadline-date">
              <strong>{date(item.deadline, { day: "2-digit" })}</strong>
              {date(item.deadline, { month: "short" }, locale)}
            </span>
            <div>
              <strong>{item.title}</strong>
              <span className="muted">
                {item.course} ·{" "}
                {date(
                  item.deadline,
                  { weekday: "short", hour: "2-digit", minute: "2-digit" },
                  locale,
                )}
              </span>
              {item.existing_task_count === 0 ? (
                <TaskDecomposition
                  assignment={item}
                  student={ctx.student}
                  onConfirmed={refresh}
                />
              ) : (
                <span className="fine-print">
                  {c(
                    `${item.existing_task_count} việc nhỏ`,
                    `${item.existing_task_count} tasks`,
                  )}
                </span>
              )}
            </div>
          </div>
        ))}
      </section>
      <section className="panel">
        <h2>{c("3. Thời gian rảnh của bạn", "3. Your free time")}</h2>
        <p className="muted">
          {c(
            "Compass chỉ xếp lịch vào các khung giờ này.",
            "Compass only schedules inside these windows.",
          )}
        </p>
        <FreeTimeEditor
          rows={rows}
          onChange={setRows}
          removeLabel={c("Xoá", "Remove")}
          fallbackStart={ctx.now}
        />
      </section>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className={`weekly-actions ${styles.previewAction}`}>
        <button className="primary" disabled={busy || !rows.length}>
          {busy
            ? c("Đang tính…", "Calculating…")
            : c("Xem kế hoạch đề xuất", "Preview proposed plan")}
          <Icon name="arrow" size={16} />
        </button>
      </div>
    </form>
  );
}

/* ---------------- ADAPT: what changed → proposal → confirm ---------------- */

function blockText(
  blocks: { starts_at: string; ends_at: string }[],
  locale: string,
) {
  return blocks
    .map(
      (b) =>
        `${date(b.starts_at, { weekday: "short" }, locale)} ${time(b.starts_at)}–${time(b.ends_at)}`,
    )
    .join(", ");
}

export function AdaptFlow({
  plan,
  onDone,
}: {
  plan: Plan;
  onDone: () => void;
}) {
  const { context, refresh, setRevision } = useWorkspace();
  const c = useCopy();
  const { language } = usePreferences();
  const locale = language === "vi" ? "vi-VN" : "en-GB";
  const riskText = useRiskText();
  const now = context ? Date.parse(context.now) : 0;
  const [rows, setRows] = useState<Row[]>(() =>
    toRows(
      (context?.study_windows || []).filter((w) => Date.parse(w.ends_at) > now),
    ),
  );
  const [remaining, setRemaining] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      (context?.tasks || [])
        .filter((t) => t.status !== "completed")
        .map((t) => [t.id, minutes(t.estimated_duration_seconds)]),
    ),
  );
  const [proposal, setProposal] = useState<AdaptationProposal | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const recordId = useRef(crypto.randomUUID());
  if (!context) return null;
  const ctx = context;
  const missed = missedBlocks(plan, ctx);
  const title = (id: string) => ctx.tasks.find((t) => t.id === id)?.title || "";
  const body = () => ({
    student: ctx.student,
    period: ctx.period,
    study_windows: [
      ...ctx.study_windows.filter((w) => Date.parse(w.ends_at) <= now),
      ...toWindows(rows),
    ],
    remaining_efforts: Object.entries(remaining).map(([task_id, value]) => ({
      task_id,
      remaining_duration_seconds: Math.max(0, Math.round(value)) * 60,
    })),
  });

  async function preview(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      setProposal(
        await api<AdaptationProposal>("weekly-plans/adapt/preview", body()),
      );
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    setBusy(true);
    setError("");
    try {
      const result = await api<Replan>("weekly-plans/adapt", {
        ...body(),
        record_id: recordId.current,
      });
      setRevision(result);
      await refresh();
      onDone();
    } catch (err) {
      setError(message(err));
      setBusy(false);
    }
  }

  if (proposal) {
    const after = asPlan(proposal.plan);
    const riskChanges = proposal.risks_after.filter((risk) => {
      const before = proposal.risks_before.find(
        (r) => r.assignment_id === risk.assignment_id,
      );
      return before?.level !== risk.level || risk.level === "high";
    });
    return (
      <section
        className="weekly-step"
        aria-label={c("Lịch mới đề xuất", "Proposed new schedule")}
      >
        <div className="panel weekly-summary-card">
          <h2>{c("Lịch mới đề xuất", "Proposed new schedule")}</h2>
          <p className="muted">
            {c(
              "Chưa có gì thay đổi cho đến khi bạn xác nhận.",
              "Nothing changes until you confirm.",
            )}
          </p>
          {riskChanges.length > 0 && (
            <>
              <h3>
                {c("Đánh giá lại rủi ro deadline", "Deadline risk re-assessed")}
              </h3>
              <ul className="weekly-risks">
                {riskChanges.map((risk) => {
                  const before = proposal.risks_before.find(
                    (r) => r.assignment_id === risk.assignment_id,
                  );
                  return (
                    <li key={risk.assignment_id}>
                      <span>{assignmentTitle(ctx, risk.assignment_id)}</span>
                      <span className="inline">
                        {before && before.level !== risk.level && (
                          <>
                            <Badge tone={riskTone(before.level)}>
                              {riskText(before.level)}
                            </Badge>
                            <Icon name="arrow" size={14} />
                          </>
                        )}
                        <Badge tone={riskTone(risk.level)}>
                          {riskText(risk.level)}
                        </Badge>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
        <section className="panel">
          <h3>{c("Những thay đổi", "What changes")}</h3>
          {proposal.changes.length ? (
            proposal.changes.map((change) => (
              <div className="change-row" key={change.task_id}>
                <strong>{title(change.task_id)}</strong>
                <div className="change-comparison">
                  <span>
                    <small>{c("Trước", "Before")}</small>
                    {blockText(
                      plan.blocks.filter(
                        (b) =>
                          b.task_id === change.task_id &&
                          Date.parse(b.ends_at) > now,
                      ),
                      locale,
                    ) ||
                      (plan.blocks.some((b) => b.task_id === change.task_id)
                        ? c("Đã lỡ buổi trước", "Missed earlier session")
                        : c("Chưa có lịch", "Not scheduled"))}
                  </span>
                  <Icon name="arrow" size={17} />
                  <span>
                    <small>{c("Sau", "After")}</small>
                    {blockText(
                      after.blocks.filter(
                        (b) =>
                          b.task_id === change.task_id &&
                          Date.parse(b.ends_at) > now,
                      ),
                      locale,
                    ) || c("Chưa xếp được", "Could not fit")}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <p className="muted">
              {c(
                "Lịch hiện tại vẫn phù hợp.",
                "Your current schedule still fits.",
              )}
            </p>
          )}
        </section>
        <Attention plan={after} tasks={ctx.tasks} />
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="weekly-actions">
          <button
            className="secondary"
            disabled={busy}
            onClick={() => setProposal(null)}
          >
            {c("Quay lại", "Back")}
          </button>
          <button
            className="primary"
            disabled={busy}
            onClick={() => void apply()}
          >
            {busy
              ? c("Đang lưu…", "Saving…")
              : c("Áp dụng lịch mới", "Apply new schedule")}
            <Icon name="check" size={16} />
          </button>
        </div>
      </section>
    );
  }

  return (
    <form className="weekly-step" onSubmit={preview}>
      <section className="panel form-stack">
        <div className="section-heading">
          <h2>{c("Điều gì đã thay đổi?", "What changed?")}</h2>
          <button type="button" className="secondary small" onClick={onDone}>
            {c("Huỷ", "Cancel")}
          </button>
        </div>
        {missed.length > 0 && (
          <div className="weekly-alert warning">
            <Icon name="alert" size={18} />
            <p>
              {c("Buổi học đã lỡ", "Missed sessions")}:{" "}
              {[...new Set(missed.map((b) => title(b.task_id)))].join(", ")}.{" "}
              {c(
                "Compass sẽ xếp lại phần việc này vào thời gian rảnh còn lại.",
                "Compass will move this work into your remaining free time.",
              )}
            </p>
          </div>
        )}
        <p className="muted">
          {c(
            "Bấm “Tôi bận” ở khung giờ bạn không thể học, hoặc thêm khung giờ mới.",
            "Mark windows you can no longer use as busy, or add new free time.",
          )}
        </p>
        <FreeTimeEditor
          rows={rows}
          onChange={setRows}
          removeLabel={c("Tôi bận", "I'm busy")}
          fallbackStart={ctx.now}
        />
        <details className="compact-disclosure">
          <summary>
            {c(
              "Ước lượng lại thời gian còn lại (tuỳ chọn)",
              "Re-estimate remaining time (optional)",
            )}
          </summary>
          {ctx.tasks
            .filter((t) => t.status !== "completed")
            .map((task: Task) => (
              <label className="remaining-input" key={task.id}>
                <span>
                  {task.title}
                  <small>{task.course}</small>
                </span>
                <input
                  aria-label={c(
                    "Số phút còn lại cho " + task.title,
                    "Remaining minutes for " + task.title,
                  )}
                  type="number"
                  min={0}
                  value={remaining[task.id] ?? 0}
                  onChange={(e) =>
                    setRemaining({
                      ...remaining,
                      [task.id]: Number(e.target.value),
                    })
                  }
                />
                <span>{c("phút", "min")}</span>
              </label>
            ))}
        </details>
      </section>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="weekly-actions">
        <button className="primary" disabled={busy}>
          {busy
            ? c("Đang tính…", "Calculating…")
            : c("Xem lịch đề xuất", "Preview new schedule")}
          <Icon name="arrow" size={16} />
        </button>
      </div>
    </form>
  );
}

/* ---------------- DO: alerts and start/complete ---------------- */

export function WeekAlerts({ plan }: { plan?: Plan }) {
  const { context, recommendation } = useWorkspace();
  const c = useCopy();
  const { language } = usePreferences();
  const locale = language === "vi" ? "vi-VN" : "en-GB";
  if (!context) return null;
  const missed = missedBlocks(plan, context);
  const now = Date.parse(context.now);
  const soon = (context.assignments || []).filter((a) => {
    const due = Date.parse(a.deadline);
    const open = context.tasks.some(
      (t) => t.assignment_id === a.assignment_id && t.status !== "completed",
    );
    const high = recommendation?.assignment_risks.some(
      (r) => r.assignment_id === a.assignment_id && r.level === "high",
    );
    return open && due > now && (due - now <= 48 * 3600000 || high);
  });
  if (!missed.length && !soon.length) return null;
  return (
    <div className="weekly-alerts">
      {missed.length > 0 && (
        <div className="weekly-alert warning" role="status">
          <Icon name="alert" size={18} />
          <p>
            {c(
              `Bạn đã lỡ ${missed.length} buổi học đã lên lịch.`,
              `You missed ${missed.length} scheduled session(s).`,
            )}
          </p>
          <Link className="secondary small" href="/plan?adapt=1">
            {c("Sắp xếp lại lịch", "Reschedule")}
          </Link>
        </div>
      )}
      {soon.map((a) => (
        <div className="weekly-alert danger" key={a.assignment_id}>
          <Icon name="plan" size={18} />
          <p>
            <strong>{a.title}</strong> · {c("hạn", "due")}{" "}
            {date(
              a.deadline,
              {
                weekday: "short",
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              },
              locale,
            )}
          </p>
        </div>
      ))}
    </div>
  );
}

const ACTIVE_KEY = "haui-compass-active-task";

type Active = { taskId: string; startedAt: string; student: string };

function readActive(): Active | null {
  try {
    const raw = window.localStorage.getItem(ACTIVE_KEY);
    return raw ? (JSON.parse(raw) as Active) : null;
  } catch {
    return null;
  }
}

export function useActiveTask() {
  const { context } = useWorkspace();
  const [active, setActive] = useState<Active | null>(null);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setActive(readActive()));
    return () => window.cancelAnimationFrame(frame);
  }, []);
  const studentKey = context
    ? `${context.student.provider}:${context.student.id}`
    : "";
  const current =
    active &&
    active.student === studentKey &&
    context?.tasks.some(
      (t) => t.id === active.taskId && t.status !== "completed",
    )
      ? active
      : null;
  function start(taskId: string) {
    if (!context) return;
    const value = { taskId, startedAt: context.now, student: studentKey };
    try {
      window.localStorage.setItem(ACTIVE_KEY, JSON.stringify(value));
    } catch {}
    setActive(value);
  }
  function clear() {
    try {
      window.localStorage.removeItem(ACTIVE_KEY);
    } catch {}
    setActive(null);
  }
  return { active: current, start, clear };
}

export function FinishTask({
  task,
  outcome,
  onClose,
  onSaved,
}: {
  task: Task;
  outcome: "completed" | "partial";
  onClose: () => void;
  onSaved: () => void;
}) {
  const { context, refresh } = useWorkspace();
  const c = useCopy();
  const dialog = useRef<HTMLDialogElement>(null);
  const recordId = useRef<{ signature: string; id: string } | null>(null);
  const [value, setValue] = useState(() =>
    Math.min(240, Math.max(5, minutes(task.estimated_duration_seconds))),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!context) return;
    setBusy(true);
    setError("");
    try {
      // The student reports how long they studied; it ends at the current system time.
      const ended = Date.parse(context.now);
      const body = {
        student: context.student,
        task_id: task.id,
        started_at: new Date(ended - value * 60000).toISOString(),
        ended_at: new Date(ended).toISOString(),
        outcome,
      };
      const signature = JSON.stringify(body);
      if (recordId.current?.signature !== signature)
        recordId.current = { signature, id: crypto.randomUUID() };
      await api("task-executions", { ...body, record_id: recordId.current.id });
      onSaved();
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
        <h2>
          {outcome === "completed"
            ? c("Hoàn thành nhiệm vụ", "Complete task")
            : c("Tạm dừng & lưu tiến độ", "Pause & save progress")}
        </h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label={c("Đóng", "Close")}
        >
          <Icon name="close" />
        </button>
      </div>
      <p className="muted">{task.title}</p>
      <form onSubmit={submit} className="form-stack">
        <label>
          {c("Bạn đã học bao nhiêu phút?", "How many minutes did you study?")}
          <input
            type="number"
            min={1}
            max={720}
            required
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy || value < 1}>
          {busy ? c("Đang lưu…", "Saving…") : c("Lưu", "Save")}
          <Icon name="check" size={16} />
        </button>
        <p className="fine-print">
          {c(
            "Thời gian thực tế giúp Compass ước lượng sát hơn ở tuần sau.",
            "Actual time helps Compass estimate better next week.",
          )}
        </p>
      </form>
    </dialog>
  );
}

/* ---------------- REFLECT: weekly review with AI support ---------------- */

const STRENGTHS: Record<string, [string, string]> = {
  completed_tasks: [
    "Hoàn thành được việc trong tuần",
    "Finished work this week",
  ],
  deadlines_met: [
    "Các deadline đến hạn đều đã xong",
    "Every due deadline was met",
  ],
  consistent_sessions: [
    "Học đều đặn qua nhiều ngày",
    "Studied consistently across days",
  ],
  accurate_estimates: [
    "Ước lượng thời gian sát thực tế",
    "Estimates matched reality",
  ],
};
const WEAKNESSES: Record<string, [string, string]> = {
  missed_sessions: [
    "Có buổi đã lên lịch nhưng chưa bắt đầu",
    "Some scheduled work was never started",
  ],
  deadline_missed: ["Có deadline bị lỡ", "A deadline was missed"],
  underestimated: [
    "Một số việc lâu hơn dự kiến",
    "Some work took longer than estimated",
  ],
  low_follow_through: [
    "Thời gian học thực tế dưới một nửa kế hoạch",
    "Studied less than half of the plan",
  ],
  no_activity: ["Chưa ghi nhận buổi học nào", "No study sessions recorded"],
};

export function WeeklySummary() {
  const { context } = useWorkspace();
  const c = useCopy();
  const [review, setReview] = useState<WeeklyReview | null>(null);
  const [error, setError] = useState("");
  const key = context ? scope(context).toString() + context.now : "";
  useEffect(() => {
    if (!context) return;
    let live = true;
    api<WeeklyReview>("weekly-reviews?" + scope(context))
      .then((result) => live && setReview(result))
      .catch((err) => live && setError(message(err)));
    return () => {
      live = false;
    };
    // The key captures the scope and demo time that change the review.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (error)
    return (
      <p className="form-error" role="alert">
        {error}
      </p>
    );
  if (!review)
    return (
      <p role="status">{c("Đang tổng kết tuần…", "Summarizing your week…")}</p>
    );
  const done = review.tasks.filter((t) => t.status === "completed").length;
  const pick = (map: Record<string, [string, string]>, code: string) =>
    map[code] ? c(map[code][0], map[code][1]) : code;
  return (
    <section
      className="panel weekly-review"
      aria-label={c("Tổng kết tuần", "Weekly summary")}
    >
      <div className="section-heading">
        <h2>{c("Tổng kết tuần", "Your week")}</h2>
        {review.goal?.goal_text && (
          <span className="muted">
            {c("Mục tiêu", "Goal")}: {review.goal.goal_text}
          </span>
        )}
      </div>
      <div className="weekly-stats">
        <div>
          <strong>
            {done}/{review.tasks.length}
          </strong>
          <span>{c("việc đã xong", "tasks done")}</span>
        </div>
        <div>
          <strong>{minutes(review.actual_seconds)}</strong>
          <span>
            {c("phút đã học", "minutes studied")} /{" "}
            {minutes(review.planned_seconds)} {c("dự kiến", "planned")}
          </span>
        </div>
        <div>
          <strong>
            {review.deadlines.filter((d) => d.state === "done").length}/
            {review.deadlines.length}
          </strong>
          <span>{c("deadline đã xong", "deadlines met")}</span>
        </div>
      </div>
      <div className="weekly-columns">
        <div>
          <h3>{c("Điểm mạnh", "Strengths")}</h3>
          <ul>
            {review.strengths.map((code) => (
              <li key={code}>{pick(STRENGTHS, code)}</li>
            ))}
            {!review.strengths.length && (
              <li className="muted">
                {c("Chưa có dữ liệu", "Not enough data yet")}
              </li>
            )}
          </ul>
        </div>
        <div>
          <h3>{c("Cần cải thiện", "To improve")}</h3>
          <ul>
            {review.weaknesses.map((code) => (
              <li key={code}>{pick(WEAKNESSES, code)}</li>
            ))}
            {!review.weaknesses.length && (
              <li className="muted">{c("Không có", "Nothing flagged")}</li>
            )}
          </ul>
        </div>
      </div>
      {review.tasks.some((t) => t.status !== "completed") && (
        <details className="compact-disclosure">
          <summary>{c("Việc chưa hoàn thành", "Unfinished tasks")}</summary>
          <ul>
            {review.tasks
              .filter((t) => t.status !== "completed")
              .map((t) => (
                <li key={t.task_id}>
                  {t.title}{" "}
                  <span className="muted">· {t.assignment_title}</span>
                </li>
              ))}
          </ul>
        </details>
      )}
      <div className="weekly-coach">
        <div className="inline">
          <Icon name="compass" size={18} />
          <strong>
            {c("Compass gợi ý phản tư", "Reflection prompts from Compass")}
          </strong>
        </div>
        <p lang="vi">{review.coaching.summary}</p>
        <ul>
          {review.coaching.questions.map((q) => (
            <li key={q} lang="vi">
              {q}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---------------- HISTORY: past weeks ---------------- */

export function WeekHistoryList() {
  const { context } = useWorkspace();
  const c = useCopy();
  const { language } = usePreferences();
  const locale = language === "vi" ? "vi-VN" : "en-GB";
  const [weeks, setWeeks] = useState<WeekHistory[] | null>(null);
  const student = context?.student;
  useEffect(() => {
    if (!student) return;
    api<{ weeks: WeekHistory[] }>(
      "weekly-history?" +
        new URLSearchParams({
          student_provider: student.provider,
          student_id: student.id,
        }),
    )
      .then((result) => setWeeks(result.weeks))
      .catch(() => setWeeks([]));
  }, [student]);
  if (!weeks?.length || !context) return null;
  const title = (id?: string | null) =>
    context.tasks.find((t) => t.id === id)?.title || "";
  return (
    <section className="panel" aria-label={c("Các tuần đã qua", "Past weeks")}>
      <h2>
        {c("Mục tiêu & phản tư theo tuần", "Goals & reflections by week")}
      </h2>
      {weeks.map((week) => (
        <div className="week-history" key={week.period.start}>
          <strong>
            {c("Tuần", "Week")}{" "}
            {date(
              week.period.start,
              { day: "numeric", month: "short" },
              locale,
            )}
          </strong>
          {week.goal?.goal_text && (
            <p>
              {c("Mục tiêu", "Goal")}: {week.goal.goal_text}
            </p>
          )}
          {week.reflections.flatMap((r) => r.signals).length ? (
            <ul>
              {week.reflections.flatMap((r) =>
                r.signals.map((s, i) => (
                  <li key={r.record_id + i}>
                    {s.kind === "workload_feedback"
                      ? c("Khối lượng: ", "Workload: ") +
                        (s.workload === "too_heavy"
                          ? c("quá nặng", "too heavy")
                          : s.workload === "too_light"
                            ? c("quá nhẹ", "too light")
                            : c("vừa phải", "about right"))
                      : s.kind === "difficult_topic"
                        ? c("Chủ đề khó: ", "Difficult topic: ") + s.topic
                        : s.kind === "deferred_task"
                          ? c("Đã hoãn: ", "Deferred: ") + title(s.task_id)
                          : `${title(s.task_id)}: ${minutes(s.estimated_duration_seconds || 0)} → ${minutes(s.actual_duration_seconds || 0)} ${c("phút", "min")}`}
                  </li>
                )),
              )}
            </ul>
          ) : (
            <p className="muted">
              {c("Chưa phản tư.", "No reflection saved.")}
            </p>
          )}
        </div>
      ))}
    </section>
  );
}

/* ---------------- Demo time control ---------------- */

export function DemoClockBar() {
  const { context, advanceClock, loading } = useWorkspace();
  const c = useCopy();
  const { language } = usePreferences();
  const [busy, setBusy] = useState(false);
  if (!context || !hasDemoClock(context)) return null;
  async function go(to: "next_day" | "next_week") {
    setBusy(true);
    await advanceClock(to);
    setBusy(false);
  }
  return (
    <div className="demo-clock" data-testid="demo-clock">
      <Icon name="clock" size={16} />
      {context.mode === SIMULATED_MODE && (
        <span className="badge">
          {c("Dữ liệu Canvas giả lập", "Simulated Canvas data")}
        </span>
      )}
      <span>
        {c("Thời gian demo", "Demo time")}:{" "}
        <strong>
          {date(
            context.now,
            {
              weekday: "long",
              day: "numeric",
              month: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            },
            language === "vi" ? "vi-VN" : "en-GB",
          )}
        </strong>
      </span>
      <button
        className="secondary small"
        disabled={busy || loading}
        onClick={() => void go("next_day")}
      >
        {c("Sang ngày mai", "Next day")}
      </button>
      <button
        className="secondary small"
        disabled={busy || loading}
        onClick={() => void go("next_week")}
      >
        {c("Sang tuần mới", "Next week")}
      </button>
    </div>
  );
}

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
  const [recording, setRecording] = useState<Task | null>(null);
  if (!context) return null;
  const rec = recommendation?.recommendation;
  const task = context.tasks.find((t) => t.id === rec?.task_id);
  const plan = history.at(-1);
  const todayBlocks =
    plan?.blocks.filter((b) => dayKey(b.starts_at) === dayKey(context.now)) ||
    [];
  const completed = context.tasks.filter(
    (t) => t.status === "completed",
  ).length;
  return (
    <>
      <PageHeading
        eyebrow={date(context.now, {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
        title="A clear direction for today."
        description="One useful next step. Everything else in perspective."
        action={
          <button
            className="secondary small"
            disabled={loading}
            onClick={() => void refresh()}
          >
            <Icon name="refresh" size={16} />
            Refresh
          </button>
        }
      />
      <div className="today-grid">
        <div className="today-primary">
          <section className="next-action panel">
            <div className="section-heading">
              <span className="eyebrow accent inline">
                <Icon name="compass" size={17} />
                YOUR NEXT BEST ACTION
              </span>
              <span className="step-index">01 / DO</span>
            </div>
            {task && rec?.evidence ? (
              <>
                <p className="course-label">
                  {task.course} <span> / </span> {task.assignment_title}
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
                    {rec.evidence.risk_level.toUpperCase()} RISK
                  </Badge>
                  <span>
                    <Icon name="plan" size={16} />
                    Due{" "}
                    {date(task.deadline, {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span>
                    <Icon name="clock" size={16} />
                    {minutes(rec.evidence.estimated_duration_seconds)} min
                    estimated
                  </span>
                </div>
                <div className="why-box">
                  <h3>Why now</h3>
                  <ul>
                    {rec.reason_codes?.map((code) => (
                      <li key={code}>{label(code)}</li>
                    ))}
                  </ul>
                  {rec.evidence.risk_reason_codes.length > 0 && (
                    <p className="evidence-note">
                      {rec.evidence.risk_reason_codes.map(label).join(" ")}
                    </p>
                  )}
                </div>
                <div className="action-bottom">
                  <button
                    className="primary"
                    onClick={() => setRecording(task)}
                  >
                    Record work
                    <Icon name="arrow" size={17} />
                  </button>
                  <span>Make progress, then tell Compass what happened.</span>
                </div>
              </>
            ) : (
              <Empty title="You're clear for now.">
                <p>
                  There are no open tasks to recommend. Review your plan or
                  reflect on your recent work.
                </p>
                <Link className="secondary" href="/reflect">
                  Reflect on your work
                  <Icon name="arrow" size={16} />
                </Link>
              </Empty>
            )}
          </section>
          <section className="panel">
            <div className="section-heading">
              <h2>Today&apos;s study plan</h2>
              <Link href="/plan" className="text-link">
                View week
                <Icon name="arrow" size={15} />
              </Link>
            </div>
            {todayBlocks.length ? (
              todayBlocks.map((block, i) => (
                <BlockRow
                  key={i}
                  block={block}
                  task={context.tasks.find((t) => t.id === block.task_id)}
                />
              ))
            ) : (
              <Empty title="Space for a fresh start">
                <p>
                  No study blocks today. Your weekly plan keeps upcoming work
                  visible.
                </p>
              </Empty>
            )}
          </section>
        </div>
        <div className="today-secondary">
          <section className="panel progress-panel">
            <div className="section-heading">
              <h2>Your progress</h2>
              <Icon name="check" size={18} />
            </div>
            <div className="progress-count">
              {completed}
              <span> / {context.tasks.length}</span>
            </div>
            <p>tasks completed in this workspace</p>
            <progress
              aria-label="Tasks completed"
              value={completed}
              max={context.tasks.length || 1}
            />
            <div className="progress-legend">
              <span>
                {context.tasks.filter((t) => t.status === "in_progress").length}{" "}
                in progress
              </span>
              <span>
                {context.tasks.filter((t) => t.status === "not_started").length}{" "}
                not started
              </span>
            </div>
          </section>
          <section className="panel">
            <div className="section-heading">
              <h2>Coming up</h2>
              <Icon name="plan" size={18} />
            </div>
            {[...context.tasks]
              .filter((t) => t.status !== "completed")
              .sort((a, b) => Date.parse(a.deadline) - Date.parse(b.deadline))
              .map((t) => (
                <div className="deadline-row" key={t.id}>
                  <span className="deadline-date">
                    <strong>{date(t.deadline, { day: "2-digit" })}</strong>
                    {date(t.deadline, { month: "short" })}
                  </span>
                  <div>
                    <strong>{t.assignment_title}</strong>
                    <span>{t.course}</span>
                  </div>
                </div>
              ))}
          </section>
          <div className="loop-note">
            <Icon name="reflect" size={19} />
            <div>
              <strong>A plan is a starting point.</strong>
              <p>
                Record what you do. Reflect on what you learn. Adjust with
                intention.
              </p>
              <Link href="/reflect" className="text-link">
                Make time to reflect
                <Icon name="arrow" size={15} />
              </Link>
            </div>
          </div>
        </div>
      </div>
      {recording && (
        <RecordWork task={recording} onClose={() => setRecording(null)} />
      )}
    </>
  );
}

function RecordWork({ task, onClose }: { task: Task; onClose: () => void }) {
  const { context, refresh } = useWorkspace();
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
        <h2>Record your work</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close record work"
        >
          <Icon name="close" />
        </button>
      </div>
      <p className="muted">{task.title}</p>
      <form onSubmit={submit} className="form-stack">
        <label>
          Started at <span className="muted">(your device timezone)</span>
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
          Ended at
          <input
            name="end"
            type="datetime-local"
            defaultValue={localInput(now)}
            required
          />
        </label>
        <fieldset>
          <legend>What was the outcome?</legend>
          <label className="choice">
            <input type="radio" name="outcome" value="partial" defaultChecked />
            Made progress · not finished
          </label>
          <label className="choice">
            <input type="radio" name="outcome" value="completed" />
            Completed the task
          </label>
        </fieldset>
        <Feedback error={error} />
        <button className="primary" disabled={busy}>
          {busy ? "Saving…" : "Save execution"}
          <Icon name="check" size={16} />
        </button>
        <p className="fine-print">
          Only record work you actually did. Execution time does not
          automatically reduce remaining effort.
        </p>
      </form>
    </dialog>
  );
}

export function WeeklyPlan() {
  const { context, history, revision } = useWorkspace();
  const [editing, setEditing] = useState(false);
  if (!context) return null;
  const plan = history.at(-1);
  return (
    <>
      <PageHeading
        eyebrow="PLAN · MAKE ROOM FOR WHAT MATTERS"
        title="Your week, with intention."
        description="Study windows become a feasible plan. Work that doesn't fit stays visible."
        action={
          <button className="primary" onClick={() => setEditing(!editing)}>
            <Icon name={plan ? "refresh" : "plus"} size={16} />
            {editing
              ? "Close editor"
              : plan
                ? "Adjust & replan"
                : "Generate plan"}
          </button>
        }
      />
      {editing && <PlanEditor plan={plan} onDone={() => setEditing(false)} />}
      {plan ? (
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
              <span className="muted">Times in Hanoi (UTC+07)</span>
              <Badge tone="success">Revision {plan.revision}</Badge>
            </div>
          </div>
          <div className="plan-stats">
            <span>
              <strong>{plan.blocks.length}</strong> study blocks
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
                min
              </strong>{" "}
              planned
            </span>
            <span>
              <strong>{plan.unplanned_tasks.length}</strong> need attention
            </span>
            <span className="planner-version">
              Planner v{plan.planner_version}
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
          <p className="fine-print">
            <Icon name="book" size={14} />
            Your plan is read-only. Adjust study windows and remaining effort to
            create an auditable new revision.
          </p>
        </>
      ) : (
        <Empty title="Your week is a blank page">
          <p>Choose your study windows to generate an initial plan.</p>
        </Empty>
      )}
    </>
  );
}

function PlanEditor({ plan, onDone }: { plan?: Plan; onDone: () => void }) {
  const { context, refresh, setRevision } = useWorkspace();
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
        <h2>{plan ? "Adjust your next steps" : "Create your first plan"}</h2>
        <Badge>EXPLICIT INPUTS</Badge>
      </div>
      <form onSubmit={submit} className="form-stack">
        <p className="muted">
          Enter your availability in your device timezone. The schedule displays
          Hanoi time.
        </p>
        <div className="window-inputs">
          {windows.map((window, i) => (
            <div
              className="window-input"
              key={`${window.starts_at}:${window.ends_at}`}
            >
              <span className="window-number">0{i + 1}</span>
              <label>
                Start
                <input
                  name={"start-" + i}
                  type="datetime-local"
                  defaultValue={localInput(window.starts_at)}
                  required
                />
              </label>
              <label>
                End
                <input
                  name={"end-" + i}
                  type="datetime-local"
                  defaultValue={localInput(window.ends_at)}
                  required
                />
              </label>
              {plan && (
                <button
                  aria-label={`Remove study window ${i + 1}`}
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
                  Remove window
                </button>
              )}
            </div>
          ))}
        </div>
        {plan && (
          <fieldset>
            <legend>Work still remaining</legend>
            <p className="fine-print">
              Review every open task. These starting values are original
              estimates, not estimates minus execution time.
            </p>
            {ctx.tasks
              .filter((t) => t.status !== "completed")
              .map((t) => (
                <label className="remaining-input" key={t.id}>
                  <span>
                    {t.title}
                    <small>{t.course}</small>
                  </span>
                  <input
                    aria-label={"Remaining minutes for " + t.title}
                    type="number"
                    name={t.id}
                    min={0}
                    step={1}
                    defaultValue={minutes(t.estimated_duration_seconds)}
                    required
                  />
                  <span>min</span>
                </label>
              ))}
          </fieldset>
        )}
        <Feedback error={error} />
        <div className="inline">
          <button className="primary" disabled={busy}>
            {busy
              ? "Saving plan…"
              : plan
                ? "Create revised plan"
                : "Generate weekly plan"}
            <Icon name="arrow" size={16} />
          </button>
          <button className="secondary" type="button" onClick={onDone}>
            Cancel
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
  if (!context) return null;
  return (
    <section className="panel change-review">
      <div className="section-heading">
        <h2>Plan updated</h2>
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
                <small>BEFORE</small>
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
                    ? "No scheduled work"
                    : "Baseline unavailable"}
              </span>
              <Icon name="arrow" size={17} />
              <span>
                <small>AFTER</small>
                {result.plan.blocks.some((b) => b.task_id === change.task_id)
                  ? result.plan.blocks
                      .filter((b) => b.task_id === change.task_id)
                      .map((b, i) => (
                        <span key={i}>
                          {date(b.starts_at, { weekday: "short" })}{" "}
                          {time(b.starts_at)}–{time(b.ends_at)}{" "}
                        </span>
                      ))
                  : "No scheduled work"}
              </span>
            </div>
            <p>{change.reasons.map(label).join(" · ")}</p>
          </div>
        ))
      ) : (
        <p className="muted">
          Your existing blocks still fit. They have been preserved in this
          revision.
        </p>
      )}
      <p className="fine-print">
        {result.informational_reflection_signals.length
          ? "Confirmed reflection is included as informational context; it does not change placement in v0."
          : "Changes are explained by the backend's typed reasons."}
      </p>
    </section>
  );
}

export function Reflect() {
  const { context, refresh } = useWorkspace();
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
      setSuccess("Your selected reflection signals were confirmed and saved.");
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
        return `${ctx.tasks.find((t) => t.id === candidate.task_id)?.title}: estimated ${minutes(candidate.estimated_duration_seconds)} min → recorded ${minutes(candidate.actual_duration_seconds)} min`;
      case "workload_feedback":
        return "Workload felt " + label(candidate.reported).toLowerCase();
      case "difficult_topic":
        return "Difficult topic: " + candidate.topic;
      case "deferred_task":
        return (
          "Intentionally deferred: " +
          ctx.tasks.find((t) => t.id === candidate.task_id)?.title
        );
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="REFLECT · LEARN FROM THE WEEK"
        title="A moment to look back."
        description="What happened matters. Decide which insights are worth keeping."
      />
      <div className="reflection-grid">
        <section className="panel reflection-form">
          <div className="section-heading">
            <h2>Your reflection</h2>
            <Badge>STEP 1 OF 2</Badge>
          </div>
          <form onSubmit={review} onChange={invalidate} className="form-stack">
            <fieldset>
              <legend>What did you work on?</legend>
              <p className="fine-print">
                Select the tasks you want to reflect on.
              </p>
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
              <legend>How did the workload feel?</legend>
              <div className="workload-choices">
                {["too_light", "appropriate", "too_heavy"].map((value) => (
                  <label className="choice-tile" key={value}>
                    <input type="radio" name="workload" value={value} />
                    {label(value)}
                  </label>
                ))}
              </div>
            </fieldset>
            <label>
              Topics that felt difficult
              <input
                name="topics"
                placeholder="e.g. Normalization, gradient descent"
              />
              <span className="fine-print">Separate topics with commas.</span>
            </label>
            <fieldset>
              <legend>Tasks you intentionally deferred</legend>
              <p className="fine-print">
                Your own account, not an inferred behavior.
              </p>
              {ctx.tasks.map((t) => (
                <label className="choice" key={t.id}>
                  <input name="deferred" type="checkbox" value={t.id} />
                  {t.title}
                </label>
              ))}
            </fieldset>
            <button className="primary" disabled={busy}>
              {busy ? "Reviewing…" : "Review reflection"}
              <Icon name="arrow" size={16} />
            </button>
          </form>
        </section>
        <section className="panel insights">
          <div className="section-heading">
            <h2>Candidate insights</h2>
            <Badge>STEP 2 OF 2</Badge>
          </div>
          {candidates ? (
            <>
              <p className="muted">
                These are proposals. Select only the signals you explicitly want
                to confirm.
              </p>
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
                        {c.source === "factual" ? "FACTUAL" : "SELF-REPORTED"}
                      </Badge>
                      <strong>{description(c)}</strong>
                    </span>
                  </label>
                ))
              ) : (
                <Empty title="No signals to review">
                  <p>
                    Add task feedback, workload feedback or difficult topics.
                  </p>
                </Empty>
              )}
              <button
                className="primary"
                disabled={busy || !selected.length}
                onClick={() => void confirm()}
              >
                {busy ? "Saving…" : "Save confirmed reflection"}
                <Icon name="check" size={16} />
              </button>
              <p className="fine-print">
                Unselected proposals are not stored. Editing your answers
                requires a fresh review.
              </p>
            </>
          ) : (
            <Empty title="Your insights will appear here">
              <p>
                Review your reflection to see factual comparisons and
                self-reported signals. Nothing is confirmed automatically.
              </p>
            </Empty>
          )}
          <Feedback error={error} success={success} />
        </section>
      </div>
    </>
  );
}

export function History() {
  const { context, history } = useWorkspace();
  if (!context) return null;
  return (
    <>
      <PageHeading
        eyebrow="HISTORY · EVERY ADJUSTMENT HAS A TRACE"
        title="See how your plan evolves."
        description="Each revision is kept. A new direction never erases where you started."
      />
      <section className="panel history-panel">
        <div className="section-heading">
          <h2>Plan revisions</h2>
          <Badge>
            {history.length} {history.length === 1 ? "revision" : "revisions"}
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
                      <h3>Revision {plan.revision}</h3>
                      {i === 0 && <Badge tone="success">CURRENT</Badge>}
                    </div>
                    <p>
                      {plan.revision === 1
                        ? "Initial weekly plan"
                        : "Adaptive replan"}{" "}
                      ·{" "}
                      {date(plan.saved_at, {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    <div className="revision-meta">
                      {plan.blocks.length} blocks ·{" "}
                      {plan.unplanned_tasks.length} unplanned · Planner v
                      {plan.planner_version}
                    </div>
                  </div>
                  <span className="view-revision">
                    View plan
                    <Icon name="arrow" size={15} />
                  </span>
                </summary>
                <div className="revision-content">
                  <PlanDays plan={plan} tasks={context.tasks} />
                  <Attention plan={plan} tasks={context.tasks} />
                </div>
              </details>
            ))}
          </div>
        ) : (
          <Empty title="Your story starts with a plan">
            <p>Create a weekly plan and your revisions will be kept here.</p>
            <Link href="/plan" className="secondary">
              Go to Weekly Plan
            </Link>
          </Empty>
        )}
      </section>
      <div className="history-note">
        <Icon name="history" size={18} />
        <p>
          Past schedules are snapshots. Task status shown alongside them
          reflects your current workspace.
        </p>
      </div>
    </>
  );
}

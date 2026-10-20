"use client";

import Link from "next/link";
import { TicketWorkspace } from "./ticket-workspace";
import { LearningPreferences } from "./learning-preferences";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  api,
  Candidate,
  hasDemoClock,
  date,
  label,
  minutes,
  Plan,
  Replan,
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
  PlanWizard,
  useCopy,
  WeekHistoryList,
  WeeklySummary,
} from "./weekly";
import { useWorkspace } from "./workspace";

function message(error: unknown) {
  return error instanceof Error ? error.message : "Please try again.";
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
  return <TicketWorkspace view="today" />;
}

export function WeeklyPlan() {
  const { context, history, revision } = useWorkspace();
  const { t, language } = usePreferences();
  const c = useCopy();
  const [adapting, setAdapting] = useState(false);
  const [approved, setApproved] = useState(false);
  const [assistantReview, setAssistantReview] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromAssistant = params.get("assistant") === "review";
    const shouldAdapt = fromAssistant || params.get("adapt") === "1";
    if (!shouldAdapt) return;
    const frame = window.requestAnimationFrame(() => {
      if (fromAssistant) setAssistantReview(true);
      setAdapting(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  if (!context) return null;
  const plan = history.at(-1);
  if (!plan)
    return (
      <>
        <PageHeading
          title={c("Lập kế hoạch tuần", "Plan your week")}
          action={
            <button
              className="primary"
              onClick={() => {
                const editor = document.getElementById(
                  "weekly-plan-editor",
                ) as HTMLDetailsElement | null;
                if (editor) {
                  editor.open = true;
                  editor.scrollIntoView({ behavior: "smooth", block: "start" });
                  editor.querySelector("summary")?.focus();
                }
              }}
            >
              {c("Tạo lịch tuần", "Create schedule")}
            </button>
          }
        />
        <TicketWorkspace view="week" />
        <details className="panel" id="weekly-plan-editor" open>
          <summary>
            {c("Tạo và duyệt lịch tuần", "Create and approve weekly schedule")}
          </summary>
          <PlanWizard
            onApproved={() => setApproved(true)}
            autoPreview={assistantReview}
          />
        </details>
      </>
    );
  return (
    <>
      <PageHeading
        title={t("plan.title")}
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
      {context.mode === "simulated_canvas_workspace" && (
        <LearningPreferences period={context.period} vi={language === "vi"} />
      )}
      {adapting ? (
        <AdaptFlow
          plan={plan}
          onDone={() => setAdapting(false)}
          autoPreview={assistantReview}
        />
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
          <TicketWorkspace view="week" />
          <details className="panel">
            <summary>
              {c("Lịch các phiên học đã duyệt", "Approved study schedule")}
            </summary>
            <PlanDays plan={plan} tasks={context.tasks} />
          </details>
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
        <></>
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
        </details>
      )}
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
      <PageHeading title={t("reflection.title")} />
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
      <PageHeading title={t("history.title")} />
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

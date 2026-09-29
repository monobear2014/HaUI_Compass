"use client";
import { Block, date, label, minutes, Plan, Task, time } from "@/lib/api";
import { Icon } from "./icons";

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={"badge " + tone}>{children}</span>;
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action && <div className="heading-action">{action}</div>}
    </div>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-mark">
        <Icon name="compass" size={24} />
      </span>
      <h3>{title}</h3>
      <div>{children}</div>
    </div>
  );
}
export function Status({ status }: { status: string }) {
  return (
    <Badge tone={status === "completed" ? "success" : "neutral"}>
      {status === "completed" && <Icon name="check" size={12} />}{" "}
      {label(status)}
    </Badge>
  );
}
export function BlockRow({ block, task }: { block: Block; task?: Task }) {
  const seconds =
    (Date.parse(block.ends_at) - Date.parse(block.starts_at)) / 1000;
  const clock = (value: string) =>
    seconds < 60
      ? date(value, {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        })
      : time(value);
  return (
    <div className="block-row">
      <div className="block-clock">
        <strong>{clock(block.starts_at)}</strong>
        <span>{clock(block.ends_at)}</span>
      </div>
      <div className="block-detail">
        <span className="course-label">{task?.course || "Study session"}</span>
        <strong>{task?.title || "Task " + block.task_id.slice(0, 8)}</strong>
        <span>{seconds < 60 ? "<1" : minutes(seconds)} min</span>
      </div>
      {task && <Status status={task.status} />}
    </div>
  );
}
export function Attention({ plan, tasks }: { plan: Plan; tasks: Task[] }) {
  return (
    <section className="panel attention">
      <div className="section-heading">
        <div className="inline">
          <Icon name="alert" size={18} />
          <h2>Needs attention</h2>
        </div>
        <Badge>{plan.unplanned_tasks.length} unplanned</Badge>
      </div>
      {plan.unplanned_tasks.length ? (
        plan.unplanned_tasks.map((item) => (
          <div className="attention-row" key={item.task_id}>
            <div>
              <strong>
                {tasks.find((t) => t.id === item.task_id)?.title ||
                  item.task_id}
              </strong>
              <p>{label(item.reason)}</p>
            </div>
            <Badge tone="warning">
              {minutes(item.remaining_duration_seconds)} min unplanned
            </Badge>
          </div>
        ))
      ) : (
        <p className="muted">All requested work fits in your study windows.</p>
      )}
    </section>
  );
}
export function PlanDays({ plan, tasks }: { plan: Plan; tasks: Task[] }) {
  const days = new Map<string, Block[]>();
  for (const block of plan.blocks) {
    const day = date(block.starts_at, {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
    const blocks = days.get(day) || [];
    blocks.push(block);
    days.set(day, blocks);
  }
  return (
    <div className="plan-days">
      {[...days].map(([day, blocks]) => (
        <section key={day} className="day-panel">
          <div className="day-heading">
            <h3>{day}</h3>
            <span>
              {minutes(
                blocks.reduce(
                  (s, b) =>
                    s +
                    (Date.parse(b.ends_at) - Date.parse(b.starts_at)) / 1000,
                  0,
                ),
              )}{" "}
              min
            </span>
          </div>
          {blocks.map((block, i) => (
            <BlockRow
              key={i}
              block={block}
              task={tasks.find((t) => t.id === block.task_id)}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

export type Period = { start: string; end: string };
export type Window = { starts_at: string; ends_at: string };
export type Task = {
  id: string;
  title: string;
  assignment_id: string;
  assignment_title: string;
  course: string;
  deadline: string;
  estimated_duration_seconds: number;
  status: "not_started" | "in_progress" | "completed";
};
export type Assignment = {
  assignment_id: string;
  provider: string;
  external_id: string;
  title: string;
  course: string;
  deadline: string;
  existing_task_count: number;
};
export type Context = {
  mode: string;
  scenario_id?: string;
  scenario_label?: string;
  generation?: number;
  available_minutes?: number;
  now: string;
  student: { provider: string; id: string };
  period: Period;
  study_windows: Window[];
  assignments?: Assignment[];
  tasks: Task[];
  assignment_capacities?: {
    assignment_id: string;
    available_minutes: number;
  }[];
};
export type Block = Window & { task_id: string };
export type Plan = {
  record_id: string;
  revision: number;
  parent_record_id: string | null;
  period: Period;
  generated_at: string;
  saved_at: string;
  planner_version: number;
  blocks: Block[];
  unplanned_tasks: {
    task_id: string;
    remaining_duration_seconds: number;
    reason: string;
  }[];
};
export type Recommendation = {
  explanation?: {
    text: string;
    source: "template" | "ai";
    fallback_reason: string | null;
  } | null;
  recommendation: {
    kind: "recommendation" | "no_recommendation";
    task_id?: string;
    reason_codes?: string[];
    evidence?: {
      risk_level: string;
      deadline: string;
      estimated_duration_seconds: number;
      risk_reason_codes: string[];
      deciding_dimension: string;
    };
  };
  assignment_risks: {
    assignment_id: string;
    level: string;
    reason_codes: string[];
    evidence: {
      remaining_effort_seconds: number | null;
      available_capacity_seconds: number | null;
      slack_seconds: number | null;
      slack_ratio: number | null;
    };
  }[];
};
export type Candidate =
  | {
      kind: "estimation_feedback";
      id: string;
      source: "factual";
      task_id: string;
      estimated_duration_seconds: number;
      actual_duration_seconds: number;
    }
  | {
      kind: "workload_feedback";
      id: string;
      source: "self_reported";
      reported: string;
    }
  | {
      kind: "difficult_topic";
      id: string;
      source: "self_reported";
      topic: string;
    }
  | {
      kind: "deferred_task";
      id: string;
      source: "self_reported";
      task_id: string;
    };
export type Replan = {
  plan: Plan;
  changes: {
    task_id: string;
    reasons: string[];
    had_execution_activity: boolean;
  }[];
  informational_reflection_signals: string[];
  replanner_version: number;
  summary: {
    removed_future_block_count: number;
    added_future_block_count: number;
    moved_duration_seconds: number;
  };
};
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch("/compass-api/" + path, {
      method: body === undefined ? "GET" : "POST",
      headers:
        body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new ApiError(
      "connection_error",
      "Could not reach Compass. Check the local API and try again.",
      0,
    );
  }
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new ApiError(
      error?.error?.code || "request_failed",
      error?.error?.message || "Something went wrong. Try again.",
      response.status,
    );
  }
  return response.json();
}
export async function apiDelete(path: string): Promise<void> {
  const response = await fetch("/compass-api/" + path, {
    method: "DELETE",
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new ApiError(
      error?.error?.code || "request_failed",
      error?.error?.message || "Something went wrong. Try again.",
      response.status,
    );
  }
}
export function scope(context: Context) {
  return new URLSearchParams({
    student_provider: context.student.provider,
    student_id: context.student.id,
    period_start: context.period.start,
    period_end: context.period.end,
  });
}
export function minutes(seconds: number) {
  return Math.round(seconds / 60);
}
export function date(
  value: string,
  options: Intl.DateTimeFormatOptions = {},
  locale = "en-GB",
) {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Ho_Chi_Minh",
    ...options,
  }).format(new Date(value));
}
export function time(value: string, locale = "en-GB") {
  return date(
    value,
    { hour: "2-digit", minute: "2-digit", hour12: false },
    locale,
  );
}
export function dayKey(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
export const labels: Record<string, string> = {
  high_assignment_risk: "This assignment has high deadline risk.",
  medium_assignment_risk: "This assignment has moderate deadline risk.",
  unknown_assignment_risk:
    "There is not enough capacity information to assess risk.",
  earliest_deadline: "It has the earliest deadline among equally ranked work.",
  continue_in_progress_task: "Continue the work you have already started.",
  only_actionable_task: "This is your only open task.",
  stable_tie_break: "Equally ranked tasks are ordered consistently.",
  low_slack: "There is limited slack before the deadline.",
  effort_exceeds_capacity:
    "Remaining effort exceeds the stated available capacity.",
  sufficient_slack: "The stated capacity covers the remaining effort.",
  deadline_passed: "The assignment deadline has passed.",
  no_capacity_before_deadline:
    "No study capacity is available before the deadline.",
  missing_capacity: "Available capacity before the deadline is unknown.",
  missing_effort_estimate: "The remaining effort has not been estimated.",
  no_remaining_work: "No remaining work.",
  study_window_changed: "Study window changed",
  task_completed: "Task completed",
  assignment_deadline_changed: "Assignment deadline changed",
  remaining_effort_changed: "Remaining effort changed",
  insufficient_capacity: "Insufficient capacity",
  no_study_window_before_deadline: "No study window before the deadline",
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
  too_light: "Too light",
  appropriate: "About right",
  too_heavy: "Too heavy",
};
export function label(code: string) {
  return labels[code] || code.replaceAll("_", " ");
}

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
      "Could not reach HaUI Compass. Check the local API and try again.",
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
const viLabels: Record<string, string> = {
  high_assignment_risk: "Bài tập có rủi ro hạn cao.",
  medium_assignment_risk: "Bài tập có rủi ro hạn trung bình.",
  unknown_assignment_risk: "Chưa đủ thông tin sức chứa để đánh giá rủi ro.",
  earliest_deadline: "Có hạn sớm nhất trong nhóm công việc cùng hạng.",
  continue_in_progress_task: "Tiếp tục công việc bạn đã bắt đầu.",
  only_actionable_task: "Đây là công việc mở duy nhất.",
  stable_tie_break: "Các công việc cùng hạng được sắp xếp ổn định.",
  low_slack: "Thời gian dự phòng trước hạn còn ít.",
  effort_exceeds_capacity: "Phần việc còn lại vượt quá sức chứa đã khai báo.",
  deadline_passed: "Bài tập đã quá hạn.",
  no_capacity_before_deadline: "Không có sức chứa học trước hạn.",
  missing_capacity: "Chưa biết sức chứa học trước hạn.",
  missing_effort_estimate: "Chưa có ước lượng phần việc còn lại.",
  no_remaining_work: "Không còn phần việc.",
  study_window_changed: "Khung giờ học đã thay đổi",
  task_completed: "Công việc đã hoàn thành",
  assignment_deadline_changed: "Hạn bài tập đã thay đổi",
  remaining_effort_changed: "Phần việc còn lại đã thay đổi",
  insufficient_capacity: "Sức chứa không đủ",
  no_study_window_before_deadline: "Không có khung học trước hạn",
  not_started: "Chưa bắt đầu",
  in_progress: "Đang thực hiện",
  completed: "Đã hoàn thành",
  too_light: "Quá nhẹ",
  appropriate: "Vừa phải",
  too_heavy: "Quá nặng",
};
export function label(code: string, language: "en" | "vi" = "en") {
  return (language === "vi" ? viLabels[code] : labels[code]) || code.replaceAll("_", " ");
}

export type ProposedPlan = Omit<
  Plan,
  "record_id" | "revision" | "parent_record_id" | "saved_at"
>;
export type AssignmentRisk = Recommendation["assignment_risks"][number];
export type PlanProposal = {
  plan: ProposedPlan;
  assignment_risks: AssignmentRisk[];
};
export type Adjustment = {
  code:
    | "carry_over"
    | "workload_too_heavy"
    | "workload_too_light"
    | "underestimated"
    | "deferred_first"
    | "difficult_topic";
  detail: string;
  task_ids: string[];
};
export type GoalDraft = {
  period: Period;
  saved: boolean;
  goal_text: string;
  target_minutes: number;
  study_windows: Window[];
  adjustments: Adjustment[];
  previous_period: Period | null;
};
export type AdaptationProposal = {
  baseline_record_id: string;
  baseline_revision: number;
  plan: ProposedPlan;
  changes: Replan["changes"];
  moved_duration_seconds: number;
  newly_unplanned_duration_seconds: number;
  risks_before: AssignmentRisk[];
  risks_after: AssignmentRisk[];
};
export type WeeklyGoal = {
  period: Period;
  goal_text: string;
  target_minutes: number;
  study_windows: Window[];
  updated_at: string;
};
export type WeeklyReview = {
  period: Period;
  as_of: string;
  goal: WeeklyGoal | null;
  planned_seconds: number;
  actual_seconds: number;
  plan_revisions: number;
  active_days: number;
  tasks: {
    task_id: string;
    title: string;
    assignment_title: string;
    status: Task["status"];
    estimated_duration_seconds: number;
    actual_duration_seconds: number;
    sessions: number;
    completed_this_period: boolean;
    scheduled: boolean;
    missed: boolean;
  }[];
  deadlines: {
    assignment_id: string;
    title: string;
    deadline: string;
    state: "done" | "missed" | "upcoming";
    open_tasks: number;
  }[];
  strengths: string[];
  weaknesses: string[];
  coaching: {
    summary: string;
    questions: string[];
    source: "template" | "ai";
    fallback_reason: string | null;
  };
};
export type WeekHistory = {
  period: Period;
  goal: WeeklyGoal | null;
  reflections: {
    record_id: string;
    period: Period;
    confirmed_at: string;
    signals: {
      kind: Candidate["kind"];
      task_id?: string | null;
      topic?: string | null;
      workload?: string | null;
      estimated_duration_seconds?: number | null;
      actual_duration_seconds?: number | null;
    }[];
  }[];
};
export const DEMO_MODE = "fictional_in_memory_demo";
/** Past scheduled blocks whose task has not been started yet. */
export function missedBlocks(plan: Plan | undefined, context: Context) {
  if (!plan) return [];
  const now = Date.parse(context.now);
  return plan.blocks.filter(
    (block) =>
      Date.parse(block.ends_at) <= now &&
      context.tasks.find((task) => task.id === block.task_id)?.status ===
        "not_started",
  );
}

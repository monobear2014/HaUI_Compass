export type SubmissionProgress = {
  on_time: number;
  late: number;
  not_submitted: number;
  not_yet_due: number;
  no_deadline: number;
  due_obligations: number;
  on_time_due: number;
  on_time_rate: number | null;
};
export type AssignmentInsight = {
  key: string;
  title: string;
  course: string;
  deadline_start: string | null;
  deadline_end: string | null;
  progress: SubmissionProgress;
  due_soon: number;
  tasks: number;
  completed_tasks: number;
  study_minutes: number;
};
export type ClassInsights = {
  as_of: string;
  suppressed: boolean;
  detail: {
    enrollment_count: number;
    assignments: AssignmentInsight[];
    support: {
      learners_overdue: number;
      learners_due_soon: number;
      learners_without_plan: number;
    };
  } | null;
};

/** Fixed aggregate columns only; never serialize the full response or learner data. */
export function lecturerCsv(
  title: string,
  asOf: string,
  rows: AssignmentInsight[],
) {
  const cell = (value: string | number | null) => {
    let text = String(value ?? "");
    if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const records = [
    ["Dữ liệu mô phỏng · tổng hợp, không phải điểm số", title, asOf],
    [
      "Môn",
      "Bài tập",
      "Hạn sớm nhất",
      "Hạn muộn nhất",
      "Nộp đúng hạn",
      "Nộp trễ",
      "Quá hạn chưa nộp",
      "Sắp hạn chưa nộp (48h)",
      "Lượt đã đến hạn",
      "Tỷ lệ đúng hạn (%)",
      "Task hoàn thành",
      "Tổng task",
      "Phút học",
    ],
    ...rows.map((a) => [
      a.course,
      a.title,
      a.deadline_start,
      a.deadline_end,
      a.progress.on_time,
      a.progress.late,
      a.progress.not_submitted,
      a.due_soon,
      a.progress.due_obligations,
      a.progress.on_time_rate,
      a.completed_tasks,
      a.tasks,
      a.study_minutes,
    ]),
  ];
  return "\uFEFF" + records.map((row) => row.map(cell).join(",")).join("\r\n");
}

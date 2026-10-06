import { Context, dayKey, Plan } from "./api";

const DAY_MS = 86400000;

/** Read-only presentation aggregates, not risk or scheduling decisions. */
export function studyStatistics(context: Context, history: Plan[]) {
  const tasks = context.tasks;
  const completed = tasks.filter((task) => task.status === "completed").length;
  const inProgress = tasks.filter(
    (task) => task.status === "in_progress",
  ).length;
  const plan = history.at(-1);
  // The calendar week is Monday–Sunday in Hanoi, not the browser's timezone.
  const localToday = Date.parse(`${dayKey(context.now)}T00:00:00+07:00`);
  // Read-only preview of the latest saved plan, clipped to today in Hanoi.
  const todayBlocks = (plan?.blocks || [])
    .flatMap((block) => {
      const task = tasks.find((item) => item.id === block.task_id);
      const start = Math.max(localToday, Date.parse(block.starts_at));
      const end = Math.min(localToday + DAY_MS, Date.parse(block.ends_at));
      return task && end > start
        ? [
            {
              ...block,
              starts_at: new Date(start).toISOString(),
              ends_at: new Date(end).toISOString(),
              task,
            },
          ]
        : [];
    })
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const weekday = new Date(localToday + 7 * 3600000).getUTCDay();
  const monday = localToday - ((weekday + 6) % 7) * DAY_MS;
  const days = Array.from({ length: 7 }, (_, index) => {
    const start = monday + index * DAY_MS;
    const end = start + DAY_MS;
    const seconds = (plan?.blocks || []).reduce((sum, block) => {
      // Split cross-midnight blocks and clip them to this calendar week.
      const overlap = Math.max(
        0,
        Math.min(end, Date.parse(block.ends_at)) -
          Math.max(start, Date.parse(block.starts_at)),
      );
      return sum + overlap / 1000;
    }, 0);
    return { start: new Date(start).toISOString(), seconds };
  });
  const assignments = new Map(
    (context.assignments || []).map((assignment) => [
      assignment.assignment_id,
      assignment,
    ]),
  );
  for (const task of tasks) {
    if (!assignments.has(task.assignment_id))
      assignments.set(task.assignment_id, {
        assignment_id: task.assignment_id,
        provider: context.student.provider,
        external_id: task.assignment_id,
        title: task.assignment_title,
        course: task.course,
        deadline: task.deadline,
        existing_task_count: tasks.filter(
          (other) => other.assignment_id === task.assignment_id,
        ).length,
      });
  }
  const courses = [
    ...new Set(
      [...assignments.values()].map((assignment) => assignment.course),
    ),
  ].map((name) => {
    const courseTasks = tasks.filter((task) => task.course === name);
    const done = courseTasks.filter(
      (task) => task.status === "completed",
    ).length;
    return {
      name,
      total: courseTasks.length,
      completed: done,
      assignments: [...assignments.values()].filter(
        (assignment) => assignment.course === name,
      ).length,
      percent: courseTasks.length
        ? Math.round((done / courseTasks.length) * 100)
        : null,
    };
  });
  const deadlines = [...assignments.values()]
    .filter((assignment) => {
      const related = tasks.filter(
        (task) => task.assignment_id === assignment.assignment_id,
      );
      // Assignments without tasks still need to be tracked, not called completed.
      return (
        !related.length || related.some((task) => task.status !== "completed")
      );
    })
    .sort((a, b) => Date.parse(a.deadline) - Date.parse(b.deadline));
  return {
    total: tasks.length,
    completed,
    inProgress,
    percent: tasks.length ? Math.round((completed / tasks.length) * 100) : null,
    courses,
    deadlines,
    days,
    plan,
    todayBlocks,
    plannedSeconds: days.reduce((sum, day) => sum + day.seconds, 0),
    blocks: (plan?.blocks || [])
      .filter(
        (block) =>
          Date.parse(block.ends_at) > monday &&
          Date.parse(block.starts_at) < monday + 7 * DAY_MS,
      )
      .map((block) => ({
        ...block,
        starts_at: new Date(
          Math.max(monday, Date.parse(block.starts_at)),
        ).toISOString(),
        ends_at: new Date(
          Math.min(monday + 7 * DAY_MS, Date.parse(block.ends_at)),
        ).toISOString(),
      }))
      .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at)),
  };
}

import { test, expect } from "@playwright/test";
import type { Context, Plan, Task } from "../src/lib/api";
import { studyStatistics } from "../src/lib/study-statistics";

const context: Context = {
  mode: "test",
  now: "2026-10-04T18:00:00Z",
  student: { provider: "test", id: "student" },
  period: { start: "2026-10-05T00:00:00Z", end: "2026-10-12T00:00:00Z" },
  study_windows: [],
  tasks: [],
};
const task = (id: string, status: Task["status"]): Task => ({
  id,
  status,
  assignment_id: id,
  assignment_title: `Assignment ${id}`,
  title: `Task ${id}`,
  course: "Databases",
  deadline: "2026-10-07T02:00:00Z",
  estimated_duration_seconds: 3600,
});
const plan: Plan = {
  record_id: "plan",
  parent_record_id: null,
  revision: 1,
  period: context.period,
  generated_at: context.now,
  saved_at: context.now,
  planner_version: 1,
  unplanned_tasks: [],
  blocks: [],
};

test("statistics measures task completion, keeps taskless assignments and never invents grades", () => {
  const result = studyStatistics(
    {
      ...context,
      tasks: [
        task("a", "completed"),
        task("b", "in_progress"),
        task("c", "not_started"),
      ],
      assignments: [
        {
          assignment_id: "taskless",
          provider: "test",
          external_id: "taskless",
          title: "Not broken down yet",
          course: "Networks",
          deadline: "2026-10-08T02:00:00Z",
          existing_task_count: 0,
        },
      ],
    },
    [],
  );
  expect(result).toMatchObject({
    total: 3,
    completed: 1,
    inProgress: 1,
    percent: 33,
    plannedSeconds: 0,
  });
  expect(
    result.courses.find((course) => course.name === "Networks"),
  ).toMatchObject({ total: 0, completed: 0, percent: null });
  expect(
    result.deadlines.map((assignment) => assignment.assignment_id),
  ).toEqual(["b", "c", "taskless"]);
  expect(result).not.toHaveProperty("gpa");
});

test("weekly hours use the latest plan, split midnight in Hanoi and clip week boundaries", () => {
  const oldPlan = {
    ...plan,
    blocks: [
      {
        task_id: "a",
        starts_at: "2026-10-06T00:00:00Z",
        ends_at: "2026-10-06T23:00:00Z",
      },
    ],
  };
  const latest = {
    ...plan,
    record_id: "latest",
    revision: 2,
    blocks: [
      {
        task_id: "a",
        starts_at: "2026-10-04T16:30:00Z",
        ends_at: "2026-10-04T17:30:00Z",
      },
      {
        task_id: "b",
        starts_at: "2026-10-05T16:30:00Z",
        ends_at: "2026-10-05T17:30:00Z",
      },
      {
        task_id: "c",
        starts_at: "2026-10-11T16:30:00Z",
        ends_at: "2026-10-11T17:30:00Z",
      },
      {
        task_id: "outside",
        starts_at: "2026-10-12T03:00:00Z",
        ends_at: "2026-10-12T04:00:00Z",
      },
    ],
  };
  const result = studyStatistics(context, [oldPlan, latest]);
  expect(result.days.map((day) => day.seconds)).toEqual([
    3600, 1800, 0, 0, 0, 0, 1800,
  ]);
  expect(result.plannedSeconds).toBe(7200);
  expect(result.blocks).toHaveLength(3);
  expect(result.blocks[0].starts_at).toBe("2026-10-04T17:00:00.000Z");
  expect(result.blocks[2].ends_at).toBe("2026-10-11T17:00:00.000Z");
});

test("empty statistics remain unknown rather than 100 percent complete", () => {
  const result = studyStatistics(context, []);
  expect(result.percent).toBeNull();
  expect(result.courses).toEqual([]);
  expect(result.deadlines).toEqual([]);
  expect(result.plannedSeconds).toBe(0);
  expect(result.days).toHaveLength(7);
  expect(result.todayBlocks).toEqual([]);
});

test("today preview follows Hanoi midnight, excludes other days and stale references, and uses latest task status", () => {
  const latest: Plan = {
    ...plan,
    record_id: "latest",
    revision: 2,
    blocks: [
      {
        task_id: "a",
        starts_at: "2026-10-04T16:30:00Z",
        ends_at: "2026-10-04T17:30:00Z",
      },
      {
        task_id: "b",
        starts_at: "2026-10-05T16:30:00Z",
        ends_at: "2026-10-05T17:30:00Z",
      },
      {
        task_id: "outside",
        starts_at: "2026-10-06T03:00:00Z",
        ends_at: "2026-10-06T04:00:00Z",
      },
      {
        task_id: "deleted",
        starts_at: "2026-10-05T03:00:00Z",
        ends_at: "2026-10-05T04:00:00Z",
      },
    ],
  };
  const result = studyStatistics(
    { ...context, tasks: [task("a", "completed"), task("b", "in_progress")] },
    [plan, latest],
  );
  expect(result.todayBlocks).toHaveLength(2);
  expect(result.todayBlocks[0]).toMatchObject({
    starts_at: "2026-10-04T17:00:00.000Z",
    ends_at: "2026-10-04T17:30:00.000Z",
    task: { id: "a", status: "completed" },
  });
  expect(result.todayBlocks[1]).toMatchObject({
    starts_at: "2026-10-05T16:30:00.000Z",
    ends_at: "2026-10-05T17:00:00.000Z",
    task: { id: "b", status: "in_progress" },
  });
});

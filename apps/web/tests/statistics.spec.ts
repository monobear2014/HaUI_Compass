import { test, expect, navigate, openPreferences } from "./fixtures";
import { scope, dayKey, type Context, type Plan } from "../src/lib/api";
import { studyStatistics } from "../src/lib/study-statistics";

test.beforeEach(async ({ request, baseURL }) => {
  expect(
    (
      await request.post("/compass-api/demo/scenarios/select", {
        headers: { Origin: baseURL! },
        data: { scenario_id: "normal" },
      })
    ).ok(),
  ).toBeTruthy();
});

test("statistics renders real workspace aggregates and links into the learning loop", async ({
  page,
  request,
}, info) => {
  const ctx: Context = await (
    await request.get("/compass-api/demo/context")
  ).json();
  const history: Plan[] = await (
    await request.get("/compass-api/weekly-plans/history?" + scope(ctx))
  ).json();
  const expected = studyStatistics(ctx, history);
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Your learning, at a glance." }),
  ).toBeVisible();
  await expect(page.locator('aside a[href="/dashboard"]')).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByTestId("completed-tasks")).toHaveText(
    String(expected.completed),
  );
  await expect(page.getByTestId("planned-hours")).toHaveText(
    new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 }).format(
      expected.plannedSeconds / 3600,
    ),
  );
  await expect(page.locator("main progress")).toHaveCount(
    expected.courses.filter((course) => course.percent !== null).length,
  );
  await expect(page.locator("main dl dt")).toHaveCount(7);
  if (page.viewportSize()!.width <= 600) {
    const suggestion = (await page.getByText(/^Start with “/).boundingBox())!;
    const action = (await page
      .getByRole("link", { name: "Open Today", exact: true })
      .boundingBox())!;
    expect(suggestion.width).toBeGreaterThan(190);
    expect(action.y + action.height).toBeLessThan(suggestion.y);
  }
  await expect(
    page.getByText("Not actual recorded study time.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.locator("main details").filter({
      has: page.getByText("How are these numbers calculated?", {
        exact: true,
      }),
    }),
  ).not.toHaveAttribute("open", "");
  await page
    .getByText("How are these numbers calculated?", { exact: true })
    .click();
  await expect(
    page.getByText(/Transcript, GPA and credit data are not connected/),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("statistics.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: "Open Today", exact: true }).click();
  await expect(page).toHaveURL(/\/today$/);
  await navigate(page, "/dashboard");
  await expect(page.getByTestId("overview-analytics")).not.toHaveAttribute(
    "open",
    "",
  );
  await page
    .getByText("View statistics & plan history", { exact: true })
    .click();
  await page.getByRole("link", { name: "View history", exact: true }).click();
  await expect(page).toHaveURL(/\/history$/);
});

test("completing a real task updates the statistics after refreshing", async ({
  page,
  request,
  baseURL,
}) => {
  const ctx: Context = await (
    await request.get("/compass-api/demo/context")
  ).json();
  await page.goto("/dashboard");
  await expect(page.getByTestId("completed-tasks")).toHaveText("0");
  const outcome = await request.post("/compass-api/task-executions", {
    headers: { Origin: baseURL! },
    data: {
      record_id: crypto.randomUUID(),
      student: ctx.student,
      task_id: ctx.tasks[0].id,
      started_at: new Date(Date.parse(ctx.now) - 1800000).toISOString(),
      ended_at: ctx.now,
      outcome: "completed",
    },
  });
  expect(outcome.ok()).toBeTruthy();
  await page.getByRole("button", { name: "Refresh overview" }).click();
  await expect(page.getByTestId("completed-tasks")).toHaveText("1");
  await page.reload();
  await expect(page.getByTestId("completed-tasks")).toHaveText("1");
});

test("statistics recovers from an API error and shows honest empty states", async ({
  page,
  request,
}) => {
  const ctx: Context = await (
    await request.get("/compass-api/demo/context")
  ).json();
  let calls = 0;
  await page.route("**/compass-api/demo/context", async (route) => {
    if (++calls === 1)
      return route.fulfill({
        status: 503,
        json: {
          error: {
            code: "unavailable",
            message: "Statistics are temporarily unavailable",
          },
        },
      });
    return route.fulfill({ json: { ...ctx, tasks: [], assignments: [] } });
  });
  await page.route("**/compass-api/weekly-plans/history*", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/compass-api/daily-recommendation", (route) =>
    route.fulfill({
      json: {
        recommendation: { kind: "no_recommendation" },
        assignment_risks: [],
      },
    }),
  );
  await page.goto("/dashboard");
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Statistics are temporarily unavailable",
  );
  await expect(page.getByTestId("completed-tasks")).toHaveCount(0);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(
    page.getByText("No courses in this workspace yet."),
  ).toBeVisible();
  await expect(page.getByText("No saved plan yet.")).toBeVisible();
  await expect(page.getByText("No open assignment deadlines.")).toBeVisible();
  await expect(page.getByText("No tasks to measure yet.")).toHaveCount(1);
  await expect(page.getByTestId("planned-hours")).toHaveText("0");
});

test("statistics is readable in Vietnamese, dark mode and mobile navigation", async ({
  page,
}, info) => {
  await page.goto("/dashboard");
  await openPreferences(page);
  await page.getByRole("button", { name: "VI", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Việc học của bạn, rõ ràng hơn." }),
  ).toBeVisible();
  await expect(page.locator('aside a[href="/dashboard"]')).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.getByRole("button", { name: "Chuyển sang giao diện tối" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("statistics-dark-vi.png"),
    fullPage: true,
  });
});

test("overview shows only today's saved sessions, real completion, and keeps details secondary", async ({
  page,
  request,
}, info) => {
  const ctx: Context = await (
    await request.get("/compass-api/demo/context")
  ).json();
  const key = dayKey(ctx.now);
  const tasks = ctx.tasks.map((task, i) => ({
    ...task,
    status: i === 0 ? ("completed" as const) : task.status,
  }));
  const plan: Plan = {
    record_id: "overview-test-plan",
    parent_record_id: null,
    revision: 1,
    period: ctx.period,
    generated_at: ctx.now,
    saved_at: ctx.now,
    planner_version: 1,
    unplanned_tasks: [],
    blocks: tasks.slice(0, 4).map((task, index) => ({
      task_id: task.id,
      starts_at: `${key}T${String(8 + index * 2).padStart(2, "0")}:00:00+07:00`,
      ends_at: `${key}T${String(8 + index * 2).padStart(2, "0")}:45:00+07:00`,
    })),
  };
  await page.route("**/compass-api/demo/context", (route) =>
    route.fulfill({ json: { ...ctx, tasks } }),
  );
  await page.route("**/compass-api/weekly-plans/history*", (route) =>
    route.fulfill({ json: [plan] }),
  );
  await page.goto("/dashboard");
  const today = page.getByTestId("overview-today");
  const deadlines = page.getByTestId("overview-deadlines");
  const sessions = today.locator("ol li");
  await expect(sessions).toHaveCount(3);
  await expect(sessions.nth(0)).toHaveAttribute("data-completed", "true");
  await expect(sessions.nth(1)).toHaveAttribute("data-completed", "false");
  await expect(sessions.nth(0)).toContainText(tasks[0].title);
  await expect(sessions.nth(0)).toContainText("08:00");
  await expect(sessions.nth(0)).toContainText("45 planned min");
  await expect(today.getByRole("checkbox")).toHaveCount(0);
  if (page.viewportSize()!.width > 850) {
    const action = (await today
      .getByRole("link", { name: "Open Today", exact: true })
      .boundingBox())!;
    expect(action.y + action.height).toBeLessThan(page.viewportSize()!.height);
  }
  await expect(
    today.getByRole("link", { name: "View all 4 sessions today" }),
  ).toHaveAttribute("href", "/plan");
  await expect(page.getByTestId("overview-analytics")).not.toHaveAttribute(
    "open",
    "",
  );
  const a = (await today.boundingBox())!,
    b = (await deadlines.boundingBox())!;
  if (page.viewportSize()!.width > 850) {
    expect(a.y).toBe(b.y);
    expect(b.x).toBeGreaterThan(a.x + a.width);
  } else {
    expect(b.y).toBeGreaterThan(a.y + a.height);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("overview-sessions.png"),
    fullPage: true,
  });
  await page
    .getByText("View statistics & plan history", { exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Scheduled study hours" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Plan revisions" }),
  ).toBeVisible();
});

import { test, expect } from "@playwright/test";

test("live activity refresh reflects learner actions without fabricating submission KPI", async ({
  page,
  baseURL,
}) => {
  await page.request.post("/api/auth/login", {
    headers: { Origin: baseURL! },
    data: { username: "demo", password: "haui123" },
  });
  let completed = 0;
  await page.route("**/compass-api/lecturer/classes", (route) =>
    route.fulfill({
      json: {
        mode: "live_activity",
        source: "Live simulated-account activity",
        as_of: "2026-10-19T05:00:00Z",
        minimum_cohort: 5,
        classes: [
          {
            class_id: "live-test",
            title: "Lớp hoạt động mô phỏng",
            suppressed: false,
            enrollment_count: 5,
            progress: null,
            comparison: null,
            activity: {
              tasks: 25,
              completed_tasks: completed,
              study_minutes: completed * 80,
              learners_with_plan: completed,
              learners_reflected: completed,
            },
          },
        ],
      },
    }),
  );
  await page.goto("/lecturer");
  const activity = page.getByRole("region", {
    name: "Hoạt động học tập · Lớp hoạt động mô phỏng",
  });
  await expect(activity.getByText("0 / 25", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/Chưa có dữ liệu nộp bài để tính KPI/),
  ).toBeVisible();
  completed = 1;
  await page.getByRole("button", { name: "Làm mới dữ liệu" }).click();
  await expect(activity.getByText("1 / 25", { exact: true })).toBeVisible();
  await expect(activity.getByText("80", { exact: true })).toBeVisible();
  await expect(page.getByRole("progressbar")).toHaveCount(0);
});

test.beforeEach(async ({ page }, info) => {
  if (info.project.name === "desktop")
    await page.setViewportSize({ width: 1440, height: 1000 });
});

test("lecturer login reaches dashboard; students cannot elevate role", async ({
  page,
  request,
  baseURL,
}) => {
  await page.goto("/lecturer");
  await expect(page).toHaveURL(/\/login\?next=%2Flecturer/);
  await page.getByLabel("Username", { exact: true }).fill("demo");
  await page.getByLabel("Password", { exact: true }).fill("haui123");
  const snapshot = page.waitForResponse("**/compass-api/lecturer/classes");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  expect((await snapshot).status()).toBe(200);
  await expect(page).toHaveURL(/\/lecturer$/);
  await expect(
    page.getByRole("heading", { name: "Tiến độ lớp học", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("50%", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByText("Ẩn thống kê để bảo vệ nhóm quá nhỏ."),
  ).toBeVisible();
  await expect(page.getByText(/snapshot mô phỏng/)).toBeVisible();
  const course = page.getByRole("region", {
    name: "AI Engineering · Lớp mô phỏng",
  });
  const progress = course.getByRole("progressbar");
  await expect(progress).toHaveAttribute("value", "50");
  await expect(progress).toHaveAttribute("max", "100");
  await expect(progress).toHaveAttribute("aria-valuetext", /6 trên 12/);
  await expect(course.getByText("6 / 12", { exact: true })).toBeVisible();
  const comparison = course.getByRole("region", {
    name: /So sánh trước và sau/,
  });
  await expect(comparison.getByText("25%", { exact: true })).toBeVisible();
  await expect(comparison.getByText("50%", { exact: true })).toBeVisible();
  await expect(comparison).toContainText("+25 điểm phần trăm");
  await expect(comparison).toContainText("Không chứng minh tác động");
  const small = page.getByRole("region", { name: "Nhóm nhỏ mô phỏng" });
  await expect(small.getByRole("progressbar")).toHaveCount(0);
  await expect(small.locator("dl")).toHaveCount(0);
  await expect(small.getByText("4 sinh viên")).toHaveCount(0);
  await expect(
    small.getByRole("region", { name: /So sánh trước và sau/ }),
  ).toHaveCount(0);
  expect(
    Date.parse((await page.locator("time").getAttribute("datetime"))!),
  ).toBe(Date.UTC(2026, 9, 18, 5));
  await expect(page.getByText(/UTC\+7/)).toBeVisible();
  const formula = page.locator("details");
  await expect(formula).not.toHaveAttribute("open");
  await formula.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(formula.getByText(/submitted_at ≤ due_at/)).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(formula).not.toHaveAttribute("open");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: test.info().outputPath(`lecturer-${test.info().project.name}.png`),
    fullPage: true,
  });
  expect((await page.request.get("/compass-api/demo/context")).status()).toBe(
    403,
  );
  expect(
    (
      await page.request.get(
        "/compass-api/lecturer/classes/canvas-demo-other/progress",
      )
    ).status(),
  ).toBe(404);
  const registered = await request.post("/api/auth/register", {
    headers: { Origin: baseURL! },
    data: {
      username: `student-${Date.now()}`,
      password: "test-pass-123",
      name: "Synthetic learner",
      role: "lecturer",
    },
  });
  expect(registered.status()).toBe(201);
  expect((await registered.json()).role).toBe("student");
  expect((await request.get("/compass-api/lecturer/classes")).status()).toBe(
    403,
  );
  await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(
    (await page.request.get("/compass-api/lecturer/classes")).status(),
  ).toBe(401);
});

// UI contract checks only: the API remains responsible for KPI calculation and RBAC.
for (const { rate, denominator, label, value } of [
  { rate: 0, denominator: 12, label: "0%", value: "0" },
  { rate: 0.5, denominator: 200, label: "0.5%", value: "0.5" },
  { rate: 37.5, denominator: 8, label: "37.5%", value: "37.5" },
  { rate: 100, denominator: 12, label: "100%", value: "100" },
  { rate: null, denominator: 0, label: "Chưa có bài đến hạn", value: null },
  { rate: 50, denominator: 0, label: "Chưa có bài đến hạn", value: null },
  { rate: -1, denominator: 12, label: "Tỷ lệ chưa khả dụng", value: null },
  { rate: 101, denominator: 12, label: "Tỷ lệ chưa khả dụng", value: null },
  { rate: "50", denominator: 12, label: "Tỷ lệ chưa khả dụng", value: null },
]) {
  test(`KPI presentation preserves API scale: ${rate}, denominator ${denominator}`, async ({
    page,
    baseURL,
  }) => {
    const login = await page.request.post("/api/auth/login", {
      headers: { Origin: baseURL! },
      data: { username: "demo", password: "haui123" },
    });
    expect(login.ok()).toBeTruthy();
    await page.route("**/compass-api/lecturer/classes", (route) =>
      route.fulfill({
        json: {
          source: "Synthetic UI contract fixture",
          as_of: "2026-10-18T05:00:00Z",
          minimum_cohort: 5,
          classes: [
            {
              class_id: "ui-contract",
              title: "Lớp kiểm tra hiển thị",
              suppressed: false,
              enrollment_count: 12,
              progress: {
                on_time: 6,
                late: 3,
                not_submitted: 3,
                not_yet_due: 12,
                no_deadline: 0,
                due_obligations: denominator,
                on_time_due: 6,
                on_time_rate: rate,
              },
            },
          ],
        },
      }),
    );
    await page.goto("/lecturer");
    await expect(page.getByText(label, { exact: true })).toBeVisible();
    if (value === null)
      await expect(page.getByRole("progressbar")).toHaveCount(0);
    else {
      await expect(page.getByRole("progressbar")).toHaveAttribute(
        "value",
        value,
      );
      await expect(page.getByRole("progressbar")).toHaveAttribute("max", "100");
    }
  });
}

test("lecturer drills into assignments, retries errors, filters and exports only aggregate rows", async ({
  page,
  baseURL,
}) => {
  await page.request.post("/api/auth/login", {
    headers: { Origin: baseURL! },
    data: { username: "demo", password: "haui123" },
  });
  const progress = {
    on_time: 1,
    late: 0,
    not_submitted: 1,
    not_yet_due: 3,
    no_deadline: 0,
    due_obligations: 2,
    on_time_due: 1,
    on_time_rate: 50,
  };
  const activities = {
    tasks: 25,
    completed_tasks: 1,
    study_minutes: 80,
    learners_with_plan: 2,
    learners_reflected: 1,
  };
  await page.route("**/compass-api/lecturer/classes", (route) =>
    route.fulfill({
      json: {
        mode: "live_activity",
        simulated: true,
        source: "Synthetic UI test",
        as_of: "2026-10-19T05:00:00Z",
        minimum_cohort: 5,
        classes: [
          {
            class_id: "canvas-demo-ai",
            title: "Lớp kiểm thử",
            suppressed: false,
            enrollment_count: 5,
            progress,
            activity: activities,
            comparison: null,
          },
          {
            class_id: "canvas-demo-small",
            title: "Lớp nhóm nhỏ",
            suppressed: true,
            enrollment_count: null,
            progress: null,
            activity: null,
            comparison: null,
          },
        ],
      },
    }),
  );
  let fail = true;
  await page.route(
    "**/compass-api/lecturer/classes/canvas-demo-ai/insights",
    (route) =>
      fail
        ? route.fulfill({ status: 503, json: {} })
        : route.fulfill({
            json: {
              as_of: "2026-10-19T05:00:00Z",
              suppressed: false,
              detail: {
                enrollment_count: 5,
                support: {
                  learners_overdue: 1,
                  learners_due_soon: 2,
                  learners_without_plan: 3,
                },
                assignments: [
                  {
                    key: "a1",
                    title: "Bài CSDL quá hạn",
                    course: "Cơ sở dữ liệu",
                    deadline_start: "2026-10-18T10:00:00Z",
                    deadline_end: "2026-10-18T10:00:00Z",
                    progress,
                    due_soon: 0,
                    tasks: 10,
                    completed_tasks: 1,
                    study_minutes: 80,
                  },
                  {
                    key: "a2",
                    title: "Lab hồi quy",
                    course: "Học máy",
                    deadline_start: "2026-10-20T10:00:00Z",
                    deadline_end: "2026-10-20T10:00:00Z",
                    progress: {
                      ...progress,
                      not_submitted: 0,
                      due_obligations: 0,
                      on_time_rate: null,
                    },
                    due_soon: 2,
                    tasks: 5,
                    completed_tasks: 0,
                    study_minutes: 0,
                  },
                ],
              },
            },
          }),
  );
  await page.goto("/lecturer");
  await page
    .getByLabel("Lớp đang xem", { exact: true })
    .selectOption("canvas-demo-small");
  await expect(
    page.getByText("Ẩn thống kê để bảo vệ nhóm quá nhỏ."),
  ).toBeVisible();
  await expect(
    page.getByText("Phân tích bài tập & hỗ trợ lớp", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("Lớp đang xem", { exact: true })
    .selectOption("canvas-demo-ai");
  await page
    .getByText("Phân tích bài tập & hỗ trợ lớp", { exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Tải lại phân tích", exact: true }),
  ).toBeVisible();
  fail = false;
  await page
    .getByRole("button", { name: "Tải lại phân tích", exact: true })
    .click();
  const support = page.getByRole("region", {
    name: "Gợi ý hỗ trợ · Lớp kiểm thử",
    exact: true,
  });
  await expect(support).toContainText("1 sinh viên có bài quá hạn");
  await expect(page.getByRole("article")).toHaveCount(2);
  await page.getByLabel("Môn học", { exact: true }).selectOption("Học máy");
  await expect(page.getByRole("article")).toHaveCount(1);
  await page.getByLabel("Tìm bài tập", { exact: true }).fill("không có");
  await expect(
    page.getByText("Không có bài tập phù hợp bộ lọc."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Xuất CSV theo bộ lọc" }),
  ).toBeDisabled();
  await page.getByLabel("Tìm bài tập", { exact: true }).fill("");
  await page.getByLabel("Chỉ bài cần chú ý", { exact: true }).check();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Xuất CSV theo bộ lọc" }).click();
  const download = await downloaded;
  const { readFile } = await import("node:fs/promises");
  const content = await readFile((await download.path())!, "utf8");
  expect(content).toContain("Lab hồi quy");
  expect(content).not.toContain("Bài CSDL quá hạn");
  expect(content).not.toMatch(/student_id|reflection|cookie|canvas-demo-ai/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByLabel("Môn học", { exact: true }).selectOption("");
  await page.getByLabel("Sắp xếp", { exact: true }).selectOption("deadline");
  await expect(page.getByRole("article").first()).toContainText(
    "Bài CSDL quá hạn",
  );
});

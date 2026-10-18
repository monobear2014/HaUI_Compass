import { test, expect } from "@playwright/test";

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
  await expect(page.getByText("50%", { exact: true })).toBeVisible();
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
  const small = page.getByRole("region", { name: "Nhóm nhỏ mô phỏng" });
  await expect(small.getByRole("progressbar")).toHaveCount(0);
  await expect(small.locator("dl")).toHaveCount(0);
  await expect(small.getByText("4 sinh viên")).toHaveCount(0);
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

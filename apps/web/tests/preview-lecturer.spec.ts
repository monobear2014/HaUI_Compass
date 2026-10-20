import { test, expect } from "@playwright/test";

test("Preview lecturer dashboard and server authorization", async ({
  page,
  request,
  baseURL,
}) => {
  const username = process.env.LECTURER_USERNAME;
  const password = process.env.LECTURER_PASSWORD;
  if (!username || !password) throw new Error("Lecturer credentials required");
  await test.step("lecturer normal login", async () => {
    await page.goto("/login");
    await page.getByLabel(/^(Username|Tên đăng nhập)$/).fill(username);
    await page.getByLabel(/^(Password|Mật khẩu)$/).fill(password);
    await page.getByRole("button", { name: /^(Sign in|Đăng nhập)$/ }).click();
    await expect(page).toHaveURL(/\/lecturer$/);
  });
  await test.step("KPI suppression timestamp and responsive presentation", async () => {
    await expect(
      page.getByRole("heading", { name: "Tiến độ lớp học", exact: true }),
    ).toBeVisible();
    const course = page.getByRole("region", {
      name: "AI Engineering · Lớp mô phỏng",
    });
    await expect(
      course.getByRole("region", { name: /Hoạt động học tập/ }),
    ).toBeVisible();
    await expect(
      course.getByText("Trước sử dụng · lịch sử giả lập"),
    ).toBeVisible();
    await expect(
      course.getByText("Sau sử dụng · nộp bài mô phỏng"),
    ).toBeVisible();
    const small = page.getByRole("region", { name: "Nhóm nhỏ mô phỏng" });
    await expect(small.getByRole("progressbar")).toHaveCount(0);
    await expect(small.locator("dl")).toHaveCount(0);
    await expect(small.getByText("4 sinh viên")).toHaveCount(0);
    await expect(
      small.getByText("Ẩn thống kê để bảo vệ nhóm quá nhỏ."),
    ).toBeVisible();
    expect(
      Number.isFinite(
        Date.parse((await page.locator("time").getAttribute("datetime"))!),
      ),
    ).toBe(true);
    await expect(page.getByText(/UTC\+7/)).toBeVisible();
    await page.locator("details summary").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText(/submitted_at ≤ due_at/)).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
  await test.step("server grants class isolation and aggregate allowlist", async () => {
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
    expect(
      (
        await page.request.get("/compass-api/lecturer/classes/unknown/progress")
      ).status(),
    ).toBe(404);
    const response = await page.request.get("/compass-api/lecturer/classes");
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");
    const data = await response.json();
    expect(Object.keys(data).sort()).toEqual([
      "as_of",
      "classes",
      "minimum_cohort",
      "mode",
      "simulated",
      "source",
    ]);
    expect(data.simulated).toBe(true);
    expect(data.classes.length).toBe(2);
    for (const item of data.classes) {
      expect(Object.keys(item).sort()).toEqual([
        "activity",
        "class_id",
        "comparison",
        "enrollment_count",
        "progress",
        "suppressed",
        "title",
      ]);
      if (item.suppressed) {
        expect(item.progress).toBeNull();
        expect(item.enrollment_count).toBeNull();
        expect(item.comparison).toBeNull();
        expect(item.activity).toBeNull();
      } else {
        expect(item.progress).toEqual(item.comparison.after);
        expect(item.comparison.simulated).toBe(true);
        expect(item.comparison.before.due_obligations).toBe(
          item.enrollment_count,
        );
        expect(Object.keys(item.activity).sort()).toEqual([
          "completed_tasks",
          "learners_reflected",
          "learners_with_plan",
          "study_minutes",
          "tasks",
        ]);
      }
    }
  });
  await test.step("student registration cannot self elevate or forge identity", async () => {
    const registered = await request.post("/api/auth/register", {
      headers: { Origin: baseURL! },
      data: {
        username: `student_${crypto.randomUUID().slice(0, 10)}`,
        password: crypto.randomUUID(),
        name: "Synthetic student",
        role: "lecturer",
      },
    });
    expect(registered.status()).toBe(201);
    expect((await registered.json()).role).toBe("student");
    expect(
      (
        await request.get("/compass-api/lecturer/classes", {
          headers: {
            "X-Compass-Role": "lecturer",
            "X-Compass-User": "student-demo",
          },
        })
      ).status(),
    ).toBe(403);
  });
});

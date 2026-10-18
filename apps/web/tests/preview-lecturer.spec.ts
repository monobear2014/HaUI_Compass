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
    await page.getByLabel("Username", { exact: true }).fill(username);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/lecturer$/);
  });
  await test.step("KPI suppression timestamp and responsive presentation", async () => {
    await expect(
      page.getByRole("heading", { name: "Tiến độ lớp học", exact: true }),
    ).toBeVisible();
    const course = page.getByRole("region", {
      name: "AI Engineering · Lớp mô phỏng",
    });
    await expect(course.getByText("50%", { exact: true })).toBeVisible();
    await expect(course.getByText("6 / 12", { exact: true })).toBeVisible();
    await expect(course.getByRole("progressbar")).toHaveAttribute(
      "value",
      "50",
    );
    await expect(course.getByRole("progressbar")).toHaveAttribute(
      "aria-valuetext",
      /6 trên 12/,
    );
    const small = page.getByRole("region", { name: "Nhóm nhỏ mô phỏng" });
    await expect(small.getByRole("progressbar")).toHaveCount(0);
    await expect(small.locator("dl")).toHaveCount(0);
    await expect(small.getByText("4 sinh viên")).toHaveCount(0);
    await expect(
      small.getByText("Ẩn thống kê để bảo vệ nhóm quá nhỏ."),
    ).toBeVisible();
    expect(
      Date.parse((await page.locator("time").getAttribute("datetime"))!),
    ).toBe(Date.UTC(2026, 9, 18, 5));
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
      "simulated",
      "source",
    ]);
    expect(data.simulated).toBe(true);
    expect(data.classes.length).toBe(2);
    for (const item of data.classes) {
      expect(Object.keys(item).sort()).toEqual([
        "class_id",
        "enrollment_count",
        "progress",
        "suppressed",
        "title",
      ]);
      if (item.suppressed) {
        expect(item.progress).toBeNull();
        expect(item.enrollment_count).toBeNull();
      } else {
        expect(Object.keys(item.progress).sort()).toEqual([
          "due_obligations",
          "late",
          "no_deadline",
          "not_submitted",
          "not_yet_due",
          "on_time",
          "on_time_due",
          "on_time_rate",
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

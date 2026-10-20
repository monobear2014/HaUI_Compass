import { test, expect } from "@playwright/test";

test("sở thích được xác nhận, dùng ở tuần sau, riêng tư và xoá được", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(60000);
  const a = await browser.newContext();
  const b = await browser.newContext();
  for (const context of [a, b]) {
    const response = await context.request.post("/api/auth/register", {
      headers: { Origin: baseURL! },
      data: {
        username: `prefs_${crypto.randomUUID().slice(0, 12)}`,
        password: crypto.randomUUID(),
        name: "Sinh viên thử nghiệm",
      },
    });
    expect(response.status()).toBe(201);
    await context.addInitScript(() =>
      localStorage.setItem("haui-compass-language", "vi"),
    );
  }
  const page = await a.newPage();
  await page.goto(baseURL! + "/plan");
  await page.getByText("Sở thích học tập của tôi", { exact: true }).click();
  const prefs = page.locator(".learning-preferences");
  await prefs
    .getByLabel("Mục tiêu phút học mỗi tuần", { exact: true })
    .fill("240");
  await prefs.getByLabel("Ngày học 1", { exact: true }).selectOption("2");
  await prefs.getByLabel("Giờ bắt đầu 1", { exact: true }).fill("19:30");
  await prefs.getByLabel("Số phút mỗi buổi 1", { exact: true }).fill("60");
  await prefs
    .getByLabel("Chủ đề tôi thấy khó (mỗi dòng một chủ đề, tối đa 5)", {
      exact: true,
    })
    .fill("Bayes\nTích vô hướng");
  await prefs
    .getByRole("button", { name: "Xác nhận & lưu sở thích", exact: true })
    .click();
  await expect(prefs).toContainText("Đã lưu theo xác nhận của bạn");
  await expect(prefs).toContainText("Bayes, Tích vô hướng");
  const target = page.getByLabel("Thời lượng muốn học (phút)");
  await target.fill("90");
  await prefs
    .getByRole("button", {
      name: "Áp dụng sở thích đã lưu vào bản nháp",
      exact: true,
    })
    .click();
  await expect(target).toHaveValue("240");
  await expect(
    page.getByLabel("Tuần này bạn muốn đạt được điều gì?"),
  ).toHaveValue(/Bayes/);
  await expect(prefs).toContainText("Đã đưa sở thích đã lưu vào bản nháp");
  // Saving/applying creates no plan until the student reviews and approves.
  const ctx = await (
    await a.request.get(baseURL! + "/compass-api/demo/context")
  ).json();
  const query = new URLSearchParams({
    student_provider: ctx.student.provider,
    student_id: ctx.student.id,
    period_start: ctx.period.start,
    period_end: ctx.period.end,
  });
  expect(
    await (
      await a.request.get(
        baseURL! + "/compass-api/weekly-plans/history?" + query,
      )
    ).json(),
  ).toEqual([]);
  await page.reload();
  await page.getByText("Sở thích học tập của tôi", { exact: true }).click();
  await expect(
    prefs.getByLabel("Mục tiêu phút học mỗi tuần", { exact: true }),
  ).toHaveValue("240");
  expect(
    (
      await (
        await b.request.get(baseURL! + "/compass-api/learning-preferences")
      ).json()
    ).preferences,
  ).toBeNull();
  await a.request.post(baseURL! + "/compass-api/demo/clock/advance", {
    headers: { Origin: baseURL! },
    data: { to: "next_week" },
  });
  await page.reload();
  await page.getByText("Sở thích học tập của tôi", { exact: true }).click();
  await prefs
    .getByRole("button", {
      name: "Áp dụng sở thích đã lưu vào bản nháp",
      exact: true,
    })
    .click();
  await expect(prefs).toContainText("Đã đưa sở thích đã lưu vào bản nháp");
  await expect(target).toHaveValue("240");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await prefs
    .getByLabel("Mục tiêu phút học mỗi tuần", { exact: true })
    .fill("300");
  await prefs
    .getByRole("button", { name: "Xác nhận & lưu sở thích", exact: true })
    .click();
  await expect(prefs).toContainText("Đã lưu theo xác nhận của bạn");
  await page
    .getByRole("button", { name: "Xem kế hoạch đề xuất", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Duyệt kế hoạch", exact: true })
    .click();
  await expect(page.getByText("Đã duyệt kế hoạch tuần.")).toBeVisible();
  await page.getByText("Sở thích học tập của tôi", { exact: true }).click();
  await expect(
    prefs.getByLabel("Mục tiêu phút học mỗi tuần", { exact: true }),
  ).toHaveValue("300");
  await expect(
    prefs.getByRole("button", {
      name: "Áp dụng sở thích đã lưu vào bản nháp",
      exact: true,
    }),
  ).toHaveCount(0);
  await prefs
    .getByRole("button", { name: "Xoá sở thích đã lưu", exact: true })
    .click();
  await expect(prefs).toContainText("Đã xoá sở thích đã lưu");
  expect(
    (
      await (
        await a.request.get(baseURL! + "/compass-api/learning-preferences")
      ).json()
    ).preferences,
  ).toBeNull();
  await a.close();
  await b.close();
});

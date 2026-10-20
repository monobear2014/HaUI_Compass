import { expect, test } from "@playwright/test";

test("nộp bài mô phỏng lưu mốc server, thay nút bằng trạng thái và bỏ nhắc hạn", async ({
  page,
  context,
  baseURL,
}) => {
  const origin = baseURL!;
  await page.addInitScript(() =>
    localStorage.setItem("haui-compass-language", "vi"),
  );
  await page.goto("/login");
  await expect(page.getByText(/Tài khoản demo|Demo account/)).toHaveCount(0);
  await expect(page.getByText("demo / haui123", { exact: true })).toHaveCount(
    0,
  );
  const registered = await context.request.post("/api/auth/register", {
    headers: { Origin: origin },
    data: {
      username: `submit_${crypto.randomUUID().slice(0, 10)}`,
      password: crypto.randomUUID(),
      name: "Sinh viên mô phỏng",
    },
  });
  expect(registered.status()).toBe(201);
  await page.goto("/academic");
  await page.getByLabel("Lọc môn học", { exact: true }).selectOption("Học máy");
  await expect(page.locator(".assignment-card")).toHaveCount(2);
  await page.getByLabel("Tìm bài tập", { exact: true }).fill("không tồn tại");
  await expect(
    page.getByText("Không có bài tập phù hợp bộ lọc."),
  ).toBeVisible();
  await page.getByLabel("Tìm bài tập", { exact: true }).fill("");
  await page.getByLabel("Lọc môn học", { exact: true }).selectOption("");
  const title = "Bài tập 1: Thiết kế lược đồ quan hệ";
  const card = page.locator(".assignment-card").filter({ hasText: title });
  await card.getByText("Yêu cầu & syllabus mô phỏng").click();
  await expect(card).toContainText("không phải quy định của HaUI");
  await card
    .getByRole("button", { name: `Nộp bài mô phỏng: ${title}`, exact: true })
    .click();
  await expect(card.getByRole("status")).toContainText("Đã nộp mô phỏng");
  await expect(card.getByRole("status")).toContainText("đúng hạn");
  await expect(
    card.getByRole("button", { name: /^Nộp bài mô phỏng/ }),
  ).toHaveCount(0);
  const events = await (
    await context.request.get("/compass-api/demo/submissions")
  ).json();
  expect(events.submissions).toHaveLength(1);
  const current = await (
    await context.request.get("/compass-api/demo/context")
  ).json();
  expect(events.submissions[0].submitted_at).toBe(current.now);
  expect(
    current.tasks.filter(
      (task: { status: string }) => task.status === "completed",
    ),
  ).toHaveLength(0);
  await page
    .getByLabel("Lọc trạng thái nộp", { exact: true })
    .selectOption("on_time");
  await expect(page.locator(".assignment-card")).toHaveCount(1);
  await page.getByLabel("Lọc trạng thái nộp", { exact: true }).selectOption("");
  await page.reload();
  await expect(card.getByRole("status")).toContainText("Đã nộp mô phỏng");
  for (let day = 0; day < 4; day++) {
    await page
      .getByRole("button", { name: "Sang ngày mai", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Sang ngày mai", exact: true }),
    ).toBeEnabled();
  }
  const retry = await context.request.post(
    `/compass-api/demo/submissions/${events.submissions[0].assignment_id}`,
    { headers: { Origin: origin }, data: {} },
  );
  expect((await retry.json()).submitted_at).toBe(
    events.submissions[0].submitted_at,
  );
  const late = page
    .locator(".assignment-card")
    .filter({ hasText: "Lab 2: Hồi quy tuyến tính" });
  await late.getByRole("button", { name: /^Nộp bài mô phỏng:/ }).click();
  await expect(late.getByRole("status")).toContainText("trễ hạn");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto("/dashboard");
  await expect(page.getByTestId("personal-submission-kpi")).toContainText(
    "50% · 1 / 2",
  );
  await expect(page.getByTestId("overview-deadlines")).not.toContainText(title);
  await page.goto("/today");
  const alerts = page.locator(".weekly-alerts");
  await expect(alerts.getByText(title, { exact: false })).toHaveCount(0);
});

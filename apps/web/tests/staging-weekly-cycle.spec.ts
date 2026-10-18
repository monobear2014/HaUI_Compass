import { expect, test, type BrowserContext, type Page } from "@playwright/test";

// Runs only with playwright.staging.config.ts: production build, PostgreSQL for web and
// API, per-account simulated workspaces and real registration. Each run uses fresh
// accounts, so Student A and Student B never share fixture data, plans or clocks.

type Credentials = { username: string; password: string };

// context.request shares the browser context's cookie jar, so the session cookie
// set by the auth route is immediately used by the context's pages.
async function signIn(
  context: BrowserContext,
  origin: string,
  action: "register" | "login",
  account: Credentials,
) {
  await context.clearCookies();
  const response = await context.request.post(`/api/auth/${action}`, {
    headers: { Origin: origin },
    data: { ...account, name: "Sinh viên thử nghiệm" },
  });
  expect(response.status()).toBe(action === "register" ? 201 : 200);
}

function account(prefix: string): Credentials {
  return {
    username: `${prefix}_${crypto.randomUUID().slice(0, 10)}`,
    password: crypto.randomUUID(),
  };
}

async function vietnamese(page: Page) {
  await page.addInitScript(() =>
    window.localStorage.setItem("haui-compass-language", "vi"),
  );
}

async function noTechnicalJson(page: Page) {
  const text = await page.locator("main").innerText();
  expect(text).not.toMatch(/\{\s*"|student_id|simulated-canvas-g\d/);
}

test("hai sinh viên staging có tuần học, đồng hồ và dữ liệu riêng", async ({
  browser,
  baseURL,
}) => {
  const origin = baseURL!;
  const studentA = account("sva");
  const studentB = account("svb");
  const editedTitle = "Phân tích yêu cầu đồ án (đã chỉnh)";
  const contextA = await browser.newContext();
  const page = await contextA.newPage();
  await vietnamese(page);
  await signIn(contextA, origin, "register", studentA);
  const nextDay = () =>
    page.getByRole("button", { name: "Sang ngày mai", exact: true }).click();

  // PLAN — a new account starts with its own simulated Canvas week, no plan.
  await page.goto("/today");
  await expect(page.getByText("Tuần này chưa có kế hoạch")).toBeVisible();
  await expect(page.getByTestId("demo-clock")).toContainText(
    "Dữ liệu Canvas giả lập",
  );
  await expect(page.getByTestId("demo-clock")).toContainText("Thứ Hai");
  await noTechnicalJson(page);
  await page.getByRole("link", { name: "Lập kế hoạch tuần" }).click();
  await expect(
    page
      .locator(".weekly-assignment")
      .getByText("Bài tập 1: Thiết kế lược đồ quan hệ", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Tuần này bạn muốn đạt được điều gì?")
    .fill("Nộp bài CSDL và Lab 2 đúng hạn");
  await page.getByRole("button", { name: "Chia thành bước nhỏ" }).click();
  // The student edits a suggestion before confirming it.
  await page.getByLabel("Candidate 1 title").fill(editedTitle);
  await page.getByLabel("Candidate 1 estimate").fill("45");
  await page.getByRole("button", { name: "Thêm công việc đã chọn" }).click();
  await expect(
    page.locator(".weekly-assignment").filter({ hasText: "Đồ án nhỏ" }),
  ).toContainText("việc nhỏ");
  await page.getByRole("button", { name: "Xem kế hoạch đề xuất" }).click();
  await expect(
    page.getByRole("heading", { name: "Kế hoạch đề xuất cho tuần này" }),
  ).toBeVisible();
  await expect(page.getByText(editedTitle).first()).toBeVisible();
  await page.getByRole("button", { name: "Duyệt kế hoạch" }).click();
  await expect(page.getByText("Đã duyệt kế hoạch tuần.")).toBeVisible();
  await noTechnicalJson(page);
  await page.getByRole("link", { name: "Bắt đầu hôm nay" }).click();

  // DO
  const card = page.locator(".next-action");
  await card.getByRole("button", { name: "Bắt đầu", exact: true }).click();
  await expect(card.getByText("ĐANG LÀM")).toBeVisible();
  await card.getByRole("button", { name: "Hoàn thành" }).click();
  await page.getByLabel("Bạn đã học bao nhiêu phút?").fill("80");
  await page.getByRole("button", { name: "Lưu", exact: true }).click();
  await expect(page.getByText(/Đã hoàn thành:/)).toBeVisible();

  // ADAPT
  await nextDay();
  await expect(page.getByTestId("demo-clock")).toContainText("Thứ Ba");
  await nextDay();
  await expect(page.getByText(/Bạn đã lỡ \d+ buổi học/)).toBeVisible();
  await page.getByRole("link", { name: "Sắp xếp lại lịch" }).click();
  await page.getByRole("button", { name: "Tôi bận 1" }).click();
  await page.getByRole("button", { name: "Xem lịch đề xuất" }).click();
  await expect(
    page.getByText("Chưa có gì thay đổi cho đến khi bạn xác nhận."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Áp dụng lịch mới" }).click();
  await expect(page.getByText("Bản sửa đổi 2").first()).toBeVisible();

  // Student B, in parallel: a separate account sees none of A's progress.
  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await vietnamese(pageB);
  await signIn(contextB, origin, "register", studentB);
  await pageB.goto("/today");
  await expect(pageB.getByText("Tuần này chưa có kế hoạch")).toBeVisible();
  await expect(pageB.getByTestId("demo-clock")).toContainText("Thứ Hai");
  const ctxA = await (
    await contextA.request.get("/compass-api/demo/context")
  ).json();
  const ctxB = await (
    await contextB.request.get("/compass-api/demo/context")
  ).json();
  expect(ctxB.student.id).not.toBe(ctxA.student.id);
  expect(ctxB.tasks.map((t: { id: string }) => t.id)).not.toContain(
    ctxA.tasks[0].id,
  );
  const stolen = await contextB.request.get(
    "/compass-api/weekly-history?" +
      new URLSearchParams({
        student_provider: ctxA.student.provider,
        student_id: ctxA.student.id,
      }),
  );
  expect(stolen.status()).toBe(403);
  const forged = await contextB.request.post(
    "/compass-api/daily-recommendation",
    {
      headers: { Origin: origin },
      data: {
        student: ctxA.student,
        available_minutes: 60,
        assignment_capacities: [],
      },
    },
  );
  expect(forged.status()).toBe(403);
  // Neither the media type nor a borrowed task id lets B change A's tasks.
  const execution = (student: unknown, taskId: string) =>
    JSON.stringify({
      student,
      task_id: taskId,
      record_id: crypto.randomUUID(),
      started_at: new Date(Date.parse(ctxB.now) - 30 * 60_000).toISOString(),
      ended_at: ctxB.now,
      outcome: "completed",
    });
  const attempts: [string, string, number][] = [
    [execution(ctxA.student, ctxA.tasks[0].id), "application/json", 403],
    [execution(ctxA.student, ctxA.tasks[0].id), "application/JSON", 403],
    [
      execution(ctxA.student, ctxA.tasks[0].id),
      "Application/Json; charset=utf-8",
      403,
    ],
    [execution(ctxA.student, ctxA.tasks[0].id), "text/plain", 415],
    [execution(ctxB.student, ctxA.tasks[0].id), "application/JSON", 404],
  ];
  for (const [data, contentType, status] of attempts) {
    const attempt = await contextB.request.post(
      "/compass-api/task-executions",
      { headers: { Origin: origin, "Content-Type": contentType }, data },
    );
    expect(attempt.status(), contentType).toBe(status);
  }
  const ctxAAfter = await (
    await contextA.request.get("/compass-api/demo/context")
  ).json();
  expect(ctxAAfter.tasks).toEqual(ctxA.tasks);
  const internal = await contextB.request.post(
    "/compass-api/internal/compass/answer",
    { headers: { Origin: origin }, data: { message: "x", evidence: [] } },
  );
  expect(internal.status()).toBe(403);
  await pageB
    .getByRole("button", { name: "Sang ngày mai", exact: true })
    .click();
  await expect(pageB.getByTestId("demo-clock")).toContainText("Thứ Ba");
  await page.reload();
  await expect(page.getByTestId("demo-clock")).toContainText("Thứ Tư");

  // REFLECT
  for (let day = 0; day < 4; day += 1) {
    await nextDay();
    await expect(
      page.getByRole("button", { name: "Sang ngày mai" }),
    ).toBeEnabled();
  }
  await expect(page.getByTestId("demo-clock")).toContainText("Chủ Nhật");
  await page.goto("/reflect");
  const summary = page.getByRole("region", { name: "Tổng kết tuần" });
  await expect(summary).toContainText("80");
  await expect(summary).toContainText("Compass gợi ý phản tư");
  await page.locator('input[name="reflected"]').first().check();
  await page.getByLabel("Quá nặng", { exact: true }).check();
  await page.getByLabel("Chủ đề khiến bạn thấy khó").fill("Chuẩn hoá 3NF");
  await page.getByRole("button", { name: "Xem lại phản hồi" }).click();
  const choices = page.locator(".insight-choice input");
  await expect(choices.first()).toBeVisible();
  for (const choice of await choices.all()) await choice.check();
  await page.getByRole("button", { name: "Lưu điều đã chọn" }).click();
  await noTechnicalJson(page);

  // NEXT WEEK
  await page.getByRole("button", { name: "Lập kế hoạch tuần sau" }).click();
  await expect(page.getByTestId("demo-clock")).toContainText("Thứ Hai");
  const suggestions = page.locator(".weekly-suggestions");
  await expect(suggestions).toContainText("mang sang tuần này");
  await expect(suggestions).toContainText("Chuẩn hoá 3NF");
  await page.getByRole("button", { name: "Xem kế hoạch đề xuất" }).click();
  await page.getByRole("button", { name: "Duyệt kế hoạch" }).click();
  await expect(page.getByText("Đã duyệt kế hoạch tuần.")).toBeVisible();

  // PERSISTENCE — sign out, sign back in: plan, reflection and clock are still A's.
  await signIn(contextA, origin, "login", studentA);
  await page.goto("/history");
  await expect(page.getByText("Mục tiêu & phản tư theo tuần")).toBeVisible();
  await expect(page.getByText("Chủ đề khó: Chuẩn hoá 3NF")).toBeVisible();
  await expect(page.getByTestId("demo-clock")).toContainText("Thứ Hai");
  await noTechnicalJson(page);

  // B is still on its own Tuesday with no history from A.
  await pageB.goto("/history");
  await expect(pageB.getByTestId("demo-clock")).toContainText("Thứ Ba");
  await expect(pageB.getByText("Chủ đề khó: Chuẩn hoá 3NF")).toHaveCount(0);

  // Reset affects only B.
  const reset = await contextB.request.post(
    "/compass-api/demo/scenarios/select",
    {
      headers: { Origin: origin },
      data: { scenario_id: "week" },
    },
  );
  expect(reset.ok()).toBeTruthy();
  expect((await reset.json()).generation).toBe(2);
  await page.reload();
  await expect(page.getByText("Chủ đề khó: Chuẩn hoá 3NF")).toBeVisible();

  await contextA.close();
  await contextB.close();
});

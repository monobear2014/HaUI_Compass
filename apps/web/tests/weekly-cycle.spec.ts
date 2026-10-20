import { expect, test } from "./fixtures";

// The student's full week in the default Vietnamese UI against the real demo API:
// Plan → Do → Adapt → Reflect → next week's plan.
test.use({
  storageState: {
    cookies: [],
    origins: [
      {
        origin: `http://127.0.0.1:${process.env.PLAYWRIGHT_WEB_PORT || "3000"}`,
        localStorage: [{ name: "haui-compass-language", value: "vi" }],
      },
    ],
  },
});

test.beforeEach(async ({ request, baseURL }) => {
  const response = await request.post("/compass-api/demo/scenarios/select", {
    headers: { Origin: baseURL! },
    data: { scenario_id: "week" },
  });
  expect(response.ok()).toBeTruthy();
});

test("sinh viên hoàn thành một tuần học và kế hoạch tuần sau dùng kết quả phản tư", async ({
  page,
}) => {
  test.setTimeout(120000);
  const nextDay = () =>
    page.getByRole("button", { name: "Sang ngày mai", exact: true }).click();

  // PLAN
  await page.goto("/today");
  await expect(page.getByText("Tuần này chưa có kế hoạch")).toBeVisible();
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
  await page.getByRole("button", { name: "Thêm công việc đã chọn" }).click();
  await expect(
    page.locator(".weekly-assignment").filter({ hasText: "Đồ án nhỏ" }),
  ).toContainText("việc nhỏ");
  await page.getByRole("button", { name: "Xem kế hoạch đề xuất" }).click();
  await expect(
    page.getByRole("heading", { name: "Kế hoạch đề xuất cho tuần này" }),
  ).toBeVisible();
  // Edit before approving: drop one free-time window and re-preview.
  await page.getByRole("button", { name: "Chỉnh sửa" }).click();
  await page.getByRole("button", { name: "Xoá 5" }).click();
  await page.getByRole("button", { name: "Xem kế hoạch đề xuất" }).click();
  await page.getByRole("button", { name: "Duyệt kế hoạch" }).click();
  await expect(page.getByText("Đã duyệt kế hoạch tuần.")).toBeVisible();
  await page.getByRole("link", { name: "Bắt đầu hôm nay" }).click();

  // DO
  const card = page.locator(".next-action");
  await card.getByRole("button", { name: "Bắt đầu", exact: true }).click();
  await expect(card.getByText("ĐANG LÀM")).toBeVisible();
  await card.getByRole("button", { name: "Hoàn thành" }).click();
  await page.getByLabel("Bạn đã học bao nhiêu phút?").fill("80");
  await page.getByRole("button", { name: "Lưu", exact: true }).click();
  await expect(page.getByText(/Đã hoàn thành:/)).toBeVisible();
  await expect(page.locator(".compact-progress strong")).toContainText("1/");
  await expect(
    page.getByRole("link", { name: /Tài liệu & Trợ lý Compass/ }),
  ).toBeVisible();

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
  await expect(page.getByText("Đánh giá lại rủi ro deadline")).toBeVisible();
  await page.getByRole("button", { name: "Áp dụng lịch mới" }).click();
  await expect(page.getByText("Bản sửa đổi 2").first()).toBeVisible();

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
  await expect(summary).toContainText("Hoàn thành được việc trong tuần");
  await expect(summary).toContainText("Compass gợi ý phản tư");
  await page.locator('input[name="reflected"]').first().check();
  await page.getByLabel("Quá nặng", { exact: true }).check();
  await page.getByLabel("Chủ đề khiến bạn thấy khó").fill("Chuẩn hoá 3NF");
  await page.getByRole("button", { name: "Xem lại phản hồi" }).click();
  const choices = page.locator(".insight-choice input");
  await expect(choices.first()).toBeVisible();
  for (const choice of await choices.all()) await choice.check();
  await page.getByRole("button", { name: "Lưu điều đã chọn" }).click();

  // NEXT WEEK
  await page.getByRole("button", { name: "Lập kế hoạch tuần sau" }).click();
  await expect(page.getByTestId("demo-clock")).toContainText("Thứ Hai");
  const suggestions = page.locator(".weekly-suggestions");
  await expect(suggestions).toContainText("mang sang tuần này");
  await expect(suggestions).toContainText("mục tiêu giảm");
  await expect(suggestions).toContainText("Chuẩn hoá 3NF");
  await page.getByRole("button", { name: "Xem kế hoạch đề xuất" }).click();
  await page.getByRole("button", { name: "Duyệt kế hoạch" }).click();
  await expect(page.getByText("Đã duyệt kế hoạch tuần.")).toBeVisible();
  await page.goto("/history");
  await expect(page.getByText("Mục tiêu & phản tư theo tuần")).toBeVisible();
  await expect(page.getByText("Chủ đề khó: Chuẩn hoá 3NF")).toBeVisible();
});

import { expect, test } from "./fixtures";

test.beforeEach(async ({ page, request, baseURL }, info) => {
  if (info.project.name === "desktop")
    await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addInitScript(() =>
    localStorage.setItem("haui-compass-language", "vi"),
  );
  const reset = await request.post("/compass-api/demo/scenarios/select", {
    headers: { Origin: baseURL! },
    data: { scenario_id: "week" },
  });
  expect(reset.ok()).toBeTruthy();
});

test("preview actions stay reachable, match the proposal and approve only once", async ({
  page,
}, info) => {
  const draft = page.waitForResponse((response) =>
    response.url().includes("/compass-api/weekly-goals/draft?"),
  );
  await page.goto("/plan");
  expect((await draft).status()).toBe(200);
  const previewButton = page.getByRole("button", {
    name: "Xem kế hoạch đề xuất",
  });
  // The existing async draft initializes both free-time rows and the goal.
  // Wait for that initialization before acting as a student editing the draft.
  await expect(previewButton).toBeEnabled();
  const goal = page.getByLabel("Tuần này bạn muốn đạt được điều gì?");
  await goal.fill("Duyệt kế hoạch dễ dàng trên mọi màn hình");
  await expect(previewButton).toHaveCount(1);
  await expect(previewButton).toHaveClass("primary");
  await page.screenshot({
    path: info.outputPath(`plan-input-${info.project.name}.png`),
    fullPage: true,
  });

  const response = page.waitForResponse("**/compass-api/weekly-plans/preview");
  await previewButton.click();
  const proposal = (await (await response).json()).plan;
  const bar = page.getByRole("region", { name: "Duyệt kế hoạch tuần" });
  await expect(bar).toBeVisible();
  const totalMinutes = Math.round(
    proposal.blocks.reduce(
      (sum: number, block: { starts_at: string; ends_at: string }) =>
        sum + (Date.parse(block.ends_at) - Date.parse(block.starts_at)) / 60000,
      0,
    ),
  );
  for (const [label, expected] of [
    ["Phút học", totalMinutes],
    ["Phiên học", proposal.blocks.length],
    ["Việc chưa xếp", proposal.unplanned_tasks.length],
  ] as const) {
    await expect(
      bar
        .locator("dl > div")
        .filter({ has: page.getByText(label, { exact: true }) })
        .locator("dd"),
    ).toHaveText(String(expected));
  }
  const approve = page.getByRole("button", {
    name: "Duyệt kế hoạch",
    exact: true,
  });
  await expect(approve).toHaveCount(1);
  // The weekly ticket board now precedes the editor. Test sticky actions while
  // reading the proposal, rather than scrolling back above the entire editor.
  await page
    .getByRole("region", { name: "Kế hoạch đề xuất", exact: true })
    .evaluate((element) =>
      element.scrollIntoView({ block: "start", behavior: "instant" }),
    );
  await expect(bar).toBeInViewport({ ratio: 1 });
  await expect(approve).toBeInViewport({ ratio: 1 });
  expect(
    await bar.evaluate((element) => getComputedStyle(element).position),
  ).toBe("sticky");
  expect(
    await bar.evaluate((element) =>
      parseFloat(getComputedStyle(element).paddingBottom),
    ),
  ).toBeGreaterThanOrEqual(16);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: info.outputPath(`plan-preview-${info.project.name}.png`),
    fullPage: true,
  });
  await page.screenshot({
    path: info.outputPath(`plan-sticky-${info.project.name}.png`),
  });

  // At the bottom, the last content row has room above the bar, not behind it.
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  const lastContent = page
    .locator(".weekly-step > .attention, .weekly-step > .plan-fit-note")
    .last();
  await expect(lastContent).toBeInViewport({ ratio: 1 });
  const contentBox = await lastContent.boundingBox();
  const barBox = await bar.boundingBox();
  expect(contentBox!.y + contentBox!.height).toBeLessThanOrEqual(barBox!.y);

  if (info.project.name === "mobile") {
    // Chromium cannot summon a native OS keyboard: exercise its reduced-height
    // viewport effect and focus/scroll behavior without claiming device coverage.
    await page.setViewportSize({ width: 390, height: 420 });
    expect(
      await bar.evaluate((element) => getComputedStyle(element).position),
    ).toBe("static");
    await approve.focus();
    await expect(approve).toBeInViewport({ ratio: 1 });
    await page.screenshot({
      path: info.outputPath("plan-short-viewport-mobile.png"),
    });
    await page.setViewportSize({ width: 390, height: 844 });
  }

  // Edit reuses the original draft; entering text in a short viewport is unobscured.
  await bar.getByRole("button", { name: "Chỉnh sửa" }).click();
  await expect(goal).toHaveValue("Duyệt kế hoạch dễ dàng trên mọi màn hình");
  await expect(bar).toHaveCount(0);
  if (info.project.name === "mobile") {
    await page.setViewportSize({ width: 390, height: 420 });
    await goal.focus();
    await expect(goal).toBeInViewport({ ratio: 1 });
    await goal.fill("Mục tiêu vẫn chỉnh được khi nhập liệu");
    await page.screenshot({
      path: info.outputPath("plan-input-short-viewport-mobile.png"),
    });
    await goal.blur();
    await page.setViewportSize({ width: 390, height: 844 });
  }
  await previewButton.click();
  await expect(bar).toBeVisible();

  let approvals = 0;
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/compass-api/weekly-plans/approve", async (route) => {
    approvals += 1;
    await hold;
    await route.continue();
  });
  try {
    await approve.click();
    await expect(bar.getByRole("button", { name: "Đang lưu…" })).toBeDisabled();
    await expect(bar.getByRole("button", { name: "Chỉnh sửa" })).toBeDisabled();
    // A second keyboard activation cannot submit while the same handler is busy.
    await page.keyboard.press("Enter");
    await expect.poll(() => approvals).toBe(1);
  } finally {
    release();
  }
  await expect(page.getByText("Đã duyệt kế hoạch tuần.")).toBeVisible();
  await expect(bar).toHaveCount(0);
  expect(approvals).toBe(1);
});

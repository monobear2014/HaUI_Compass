import { expect, test } from "./fixtures";

test.beforeEach(async ({ request, baseURL }) => {
  const response = await request.post("/compass-api/demo/scenarios/select", {
    headers: { Origin: baseURL! },
    data: { scenario_id: "normal" },
  });
  expect(response.ok()).toBeTruthy();
});

test("today keeps ticket actions in details and account settings collapsed", async ({
  page,
}) => {
  await page.goto("/today");
  await expect(
    page.getByRole("heading", { name: "Today, one step at a time" }),
  ).toBeVisible();
  expect(
    await page.getByTestId("account-menu").getAttribute("open"),
  ).toBeNull();
  const ticket = page.getByRole("article").first();
  await expect(ticket).toBeVisible();
  await expect(
    ticket.getByRole("button", { name: "Start", exact: true }),
  ).toHaveCount(0);
  await ticket.getByRole("button").first().click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Start", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await page.getByRole("button", { name: "Tiếng Việt", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Hôm nay, từng việc một" }),
  ).toBeVisible();
  if (page.viewportSize()!.width <= 700)
    await expect(
      page.locator('aside[aria-label="Điều hướng chính"]'),
    ).toBeHidden();
});

test("reflection progressively reviews feedback without losing the student's input", async ({
  page,
}) => {
  await page.goto("/reflect");
  await expect(page.locator(".insights")).toHaveCount(0);
  await page
    .getByLabel("Topics that felt difficult")
    .fill("Database normalization");
  await page.getByRole("button", { name: "Review my notes" }).click();
  await expect(page.locator(".insight-choice")).toHaveCount(1);
  expect(
    await page.locator(".reflection-input").getAttribute("open"),
  ).toBeNull();
  await expect(
    page.getByRole("button", { name: "Save selected notes" }),
  ).toBeDisabled();
  await page.locator(".reflection-input > summary").click();
  await expect(page.getByLabel("Topics that felt difficult")).toHaveValue(
    "Database normalization",
  );
  await page.getByLabel("Topics that felt difficult").fill("Join operations");
  await expect(page.locator(".insights")).toHaveCount(0);
});

test("assignment entry is optional and document questions start blank", async ({
  page,
}) => {
  await page.goto("/academic");
  await expect(page.getByLabel("Course name")).toBeHidden();
  await page
    .getByRole("button", { name: "Add assignment", exact: true })
    .click();
  await expect(page.getByLabel("Course name")).toBeVisible();
  await expect(page.locator('.import-drawer input[type="file"]')).toBeHidden();
  await page.goto("/knowledge");
  const assistant = page.locator("#compass-chat-panel");
  await expect(
    assistant.getByRole("textbox", { name: "Message Compass", exact: true }),
  ).toBeEnabled();
  await expect(
    assistant.getByRole("textbox", { name: "Message Compass", exact: true }),
  ).toHaveValue("");
  await expect(page.getByLabel("Question", { exact: true })).toHaveCount(0);
});

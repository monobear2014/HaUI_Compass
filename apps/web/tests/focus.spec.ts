import { expect, test, openPreferences } from "./fixtures";

test.beforeEach(async ({ request, baseURL }) => {
  const response = await request.post("/compass-api/demo/scenarios/select", {
    headers: { Origin: baseURL! },
    data: { scenario_id: "normal" },
  });
  expect(response.ok()).toBeTruthy();
});

test("today puts the study action before optional explanations", async ({
  page,
}) => {
  await page.goto("/today");
  const action = page.getByRole("button", { name: "Record work", exact: true });
  await expect(action).toBeVisible();
  expect(
    await page.getByTestId("workspace-settings").getAttribute("open"),
  ).toBeNull();
  expect(await page.locator(".why-box").getAttribute("open")).toBeNull();
  const box = await action.boundingBox();
  expect(box!.y + box!.height).toBeLessThan(page.viewportSize()!.height);
  await expect(
    page.getByText("Template · offline", { exact: true }),
  ).toBeHidden();
  await page.locator(".why-box > summary").click();
  await page.locator(".why-box .decision-evidence > summary").click();
  await expect(
    page.getByText("Template · offline", { exact: true }),
  ).toBeVisible();
  await page.locator(".why-box > summary").click();
  await openPreferences(page);
  await page.getByRole("button", { name: "VI", exact: true }).click();
  const vietnameseAction = await page
    .getByRole("button", { name: "Ghi nhận buổi học", exact: true })
    .boundingBox();
  expect(vietnameseAction!.y + vietnameseAction!.height).toBeLessThan(
    page.viewportSize()!.height,
  );
  if (page.viewportSize()!.width <= 700) {
    await expect(
      page.locator('aside[aria-label="Điều hướng chính"]'),
    ).toBeHidden();
  }
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
  await expect(page.getByLabel("Question")).toHaveValue("");
  await page.getByRole("button", { name: "Try an example" }).click();
  await expect(page.getByLabel("Question")).not.toHaveValue("");
});

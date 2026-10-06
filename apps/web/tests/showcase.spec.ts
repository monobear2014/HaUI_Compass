import { test, expect, navigate, openDemo, openPreferences } from "./fixtures";

test.beforeEach(async ({ request, baseURL }) => {
  const response = await request.post("/compass-api/demo/scenarios/select", {
    headers: { Origin: baseURL! },
    data: { scenario_id: "normal" },
  });
  expect(response.ok()).toBeTruthy();
});

test("presentation preferences switch language and theme without changing the workspace", async ({
  page,
}) => {
  await page.goto("/today");
  await openPreferences(page);
  await page.getByRole("button", { name: "VI", exact: true }).click();
  await expect(page.locator('aside a[href="/today"]')).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(
    page.getByRole("heading", { name: "Tôi nên làm gì ngay bây giờ?" }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "vi");

  await page.getByRole("button", { name: "Chuyển sang giao diện tối" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("Vietnamese preference covers the student workflow screens", async ({
  page,
}) => {
  await page.goto("/today");
  await openPreferences(page);
  await page.getByRole("button", { name: "VI", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Tôi nên làm gì ngay bây giờ?" }),
  ).toBeVisible();
  await navigate(page, "/plan");
  await expect(
    page.getByRole("heading", { name: "Kế hoạch tuần của bạn." }),
  ).toBeVisible();
  await navigate(page, "/reflect");
  await expect(
    page.getByRole("heading", { name: "Buổi học vừa rồi thế nào?" }),
  ).toBeVisible();
  await navigate(page, "/history");
  await expect(
    page.getByRole("heading", { name: "Lịch sử kế hoạch." }),
  ).toBeVisible();
  await navigate(page, "/academic");
  await expect(
    page.getByRole("heading", { name: "Môn học & bài tập." }),
  ).toBeVisible();
});

test("showcase: normal → crunch → execute, reflect and replan disrupted week", async ({
  page,
}, info) => {
  await page.goto("/today");
  await expect(
    page.getByRole("heading", { name: "What should I do now?" }),
  ).toBeVisible();
  await navigate(page, "/plan");
  await expect(page.locator(".plan-toolbar")).toContainText("Revision 1");
  await expect(
    page.getByText("All requested work fits in your study windows."),
  ).toBeVisible();

  await openDemo(page);
  await page
    .getByLabel("Demo scenario", { exact: true })
    .selectOption("crunch");
  await expect(
    page.getByRole("heading", { name: "Needs attention" }),
  ).toBeVisible();
  await navigate(page, "/academic");
  await expect(
    page.getByRole("heading", {
      name: "Your assignments",
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Today → Risk & next action" }).click();
  await expect(
    page.locator(".next-action").getByText("High risk", { exact: true }),
  ).toBeVisible();
  await page.locator(".why-box > summary").click();
  await page.locator(".why-box .decision-evidence > summary").click();
  await expect(
    page.getByText("Template · offline", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".why-box")).toContainText("150 phút");
  await expect(page.locator(".why-box")).toContainText("60 phút");

  await expect(page.locator(".why-box .decision-evidence")).toContainText(
    "effort_exceeds_capacity",
  );
  await page.locator(".risk-overview > summary").click();
  await expect(
    page.locator(".risk-row").filter({ hasText: "Regression Lab" }),
  ).toContainText("Needs attention");
  await page.screenshot({
    path: info.outputPath("crunch-evidence.png"),
    fullPage: true,
  });

  await openDemo(page);
  await page
    .getByLabel("Demo scenario", { exact: true })
    .selectOption("disrupted");
  await expect(
    page.locator(".next-action").getByText("On track", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Record work", exact: true }).click();
  await page.locator('input[name="start"]').fill("2026-10-05T00:00");
  await page.locator('input[name="end"]').fill("2026-10-05T00:25");
  await page.getByLabel("Completed the task", { exact: true }).check();
  await page.getByRole("button", { name: "Save execution" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".action-title")).toHaveText(
    "Implement the regression baseline",
  );
  await page.getByRole("button", { name: "Record work", exact: true }).click();
  // Playwright's browser uses UTC. Fixed clock: 02:00 UTC; a 90-minute partial session.
  await page.locator('input[name="start"]').fill("2026-10-05T00:30");
  await page.locator('input[name="end"]').fill("2026-10-05T02:00");
  await page.getByRole("button", { name: "Save execution" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await navigate(page, "/reflect");
  await page.locator('input[name="reflected"]').nth(1).check();
  await page.getByLabel("Too heavy", { exact: true }).check();
  await page
    .getByLabel("Topics that felt difficult")
    .fill("Regression assumptions");
  await page.getByRole("button", { name: "Review my notes" }).click();
  await expect(page.locator(".insights")).toContainText("recorded 90 min");
  await expect(page.locator(".insight-choice input:checked")).toHaveCount(0);
  for (const checkbox of await page.locator(".insight-choice input").all())
    await checkbox.check();
  await page.getByRole("button", { name: "Save selected notes" }).click();
  await expect(
    page.getByText(
      "Your selected reflection signals were confirmed and saved.",
    ),
  ).toBeVisible();

  await navigate(page, "/plan");
  await page.getByRole("button", { name: "Adjust & replan" }).click();
  await expect(page.getByRole("spinbutton")).toHaveCount(3);
  await page
    .getByLabel("Remaining minutes for Implement the regression baseline")
    .fill("90");
  await page.getByRole("button", { name: "Remove study window 2" }).click();
  await page.getByRole("button", { name: "Create revised plan" }).click();
  await expect(
    page.getByRole("heading", { name: "Plan updated" }),
  ).toBeVisible();
  await expect(page.locator(".change-review")).toContainText("Task completed");
  await expect(page.locator(".change-review")).toContainText(
    "Remaining effort changed",
  );
  await expect(page.locator(".change-review")).toContainText(
    "Study window changed",
  );
  await page.getByText("Blocks kept unchanged", { exact: true }).click();
  await expect(page.locator(".preserved-blocks")).toContainText(
    "Outline the presentation",
  );
  await page.screenshot({
    path: info.outputPath("disrupted-comparison.png"),
    fullPage: true,
  });
  await navigate(page, "/history");
  await expect(page.locator("details.revision")).toHaveCount(2);
  await page.locator("details.revision").last().locator("summary").click();
  await expect(page.locator("details.revision").last()).toContainText(
    "Draft the relational schema",
  );
  await openDemo(page);
  await page.getByRole("button", { name: "Reset this scenario" }).click();
  await expect(page.locator("details.revision")).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("switching scenario clears unsaved reflection candidates and plan editor", async ({
  page,
}) => {
  await page.goto("/reflect");
  await page
    .getByLabel("Topics that felt difficult")
    .fill("Old scenario insight");
  await page.getByRole("button", { name: "Review my notes" }).click();
  await expect(page.locator(".insight-choice")).toHaveCount(1);
  await openDemo(page);
  await page
    .getByLabel("Demo scenario", { exact: true })
    .selectOption("disrupted");
  await expect(page.locator(".insight-choice")).toHaveCount(0);
  await expect(page.getByLabel("Topics that felt difficult")).toHaveValue("");
  await navigate(page, "/plan");
  await page.getByRole("button", { name: "Adjust & replan" }).click();
  await page
    .getByLabel("Remaining minutes for Implement the regression baseline")
    .fill("999");
  await openDemo(page);
  await page
    .getByLabel("Demo scenario", { exact: true })
    .selectOption("normal");
  await expect(
    page.getByRole("heading", { name: "Adjust your next steps" }),
  ).toHaveCount(0);
});

test("AI task candidates require review and confirmation before deterministic planning", async ({
  page,
}) => {
  await page.goto("/academic");
  const assignment = page
    .locator(".assignment-card")
    .filter({ hasText: "Database Mini Project" });
  await expect(assignment).toContainText("No confirmed study tasks yet");
  await assignment.getByRole("button", { name: "Break into steps" }).click();
  await expect(
    assignment.getByText("Template · offline", { exact: true }),
  ).toBeVisible();
  await expect(assignment.locator(".decomposition-candidate")).toHaveCount(4);
  await expect(assignment).toContainText("Edit the titles and estimates");

  const before = await page.request.get("/compass-api/demo/context");
  expect((await before.json()).tasks).toHaveLength(4);

  await assignment
    .getByLabel("Candidate 1 title")
    .fill("Clarify rubric and project scope");
  await assignment.getByLabel("Candidate 1 estimate").fill("40");
  await assignment
    .locator('.decomposition-candidate input[type="checkbox"]')
    .nth(1)
    .uncheck();
  await assignment.getByRole("button", { name: "Add selected tasks" }).click();
  await expect(assignment.getByRole("status")).toContainText(
    "Added 3 confirmed tasks",
  );

  const after = await page.request.get("/compass-api/demo/context");
  const context = await after.json();
  expect(context.tasks).toHaveLength(7);
  expect(context.tasks.map((task: { title: string }) => task.title)).toContain(
    "Clarify rubric and project scope",
  );
  expect(
    context.tasks.map((task: { title: string }) => task.title),
  ).not.toContain("Design the approach for Database Mini Project");

  await navigate(page, "/today");
  await expect(page.locator(".action-title")).toHaveText(
    /Clarify rubric and project scope|Implement one core increment|Test and review/,
  );
  await navigate(page, "/plan");
  await page.getByRole("button", { name: "Adjust & replan" }).click();
  await expect(
    page.getByLabel("Remaining minutes for Clarify rubric and project scope"),
  ).toHaveValue("40");
  await page.getByRole("button", { name: "Create revised plan" }).click();
  await expect(
    page.getByRole("heading", { name: "Plan updated" }),
  ).toBeVisible();
  await expect(page.locator(".plan-days")).toContainText(
    "Clarify rubric and project scope",
  );
});

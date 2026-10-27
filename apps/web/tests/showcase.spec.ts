import { test, expect, navigate, openDemo, openExecution } from "./fixtures";

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
  await page.getByRole("button", { name: "Tiếng Việt", exact: true }).click();
  await expect(page.locator('aside a[href="/today"]')).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(
    page.getByRole("heading", { name: "Hôm nay, từng việc một" }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "vi");

  await page.getByRole("button", { name: "Chuyển sang giao diện tối" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("Vietnamese preference covers the student workflow screens", async ({
  page,
}) => {
  await page.goto("/today");
  await page.getByRole("button", { name: "Tiếng Việt", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Hôm nay, từng việc một" }),
  ).toBeVisible();
  await navigate(page, "/plan");
  await expect(
    page.getByRole("heading", { name: "Kế hoạch tuần của bạn." }),
  ).toBeVisible();
  await navigate(page, "/reflect");
  await expect(
    page.getByRole("heading", { name: "Nhìn lại tuần học" }),
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
    page.getByRole("heading", { name: "Today, one step at a time" }),
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
  await navigate(page, "/today");
  await expect(page.getByRole("article")).toHaveCount(4);
  await expect(
    page.getByRole("article", {
      name: "Implement the regression baseline",
      exact: true,
    }),
  ).toContainText("Implement the regression baseline");
  await openDemo(page);
  await page
    .getByLabel("Demo scenario", { exact: true })
    .selectOption("disrupted");
  await openExecution(page, "Draft the relational schema", "completed");
  await page.getByRole("dialog").getByRole("spinbutton").fill("25");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await openExecution(page, "Implement the regression baseline");
  await page.getByRole("dialog").getByRole("spinbutton").fill("90");
  await page.getByRole("button", { name: "Save", exact: true }).click();
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
  await page.getByText("Re-estimate remaining time (optional)").click();
  await expect(page.getByRole("spinbutton")).toHaveCount(3);
  await page
    .getByLabel("Remaining minutes for Implement the regression baseline")
    .fill("90");
  await page.getByRole("button", { name: "I'm busy 2" }).click();
  await page.getByRole("button", { name: "Preview new schedule" }).click();
  await expect(
    page.getByText("Nothing changes until you confirm."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Apply new schedule" }).click();
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
  await page.getByText("Re-estimate remaining time (optional)").click();
  await page
    .getByLabel("Remaining minutes for Implement the regression baseline")
    .fill("999");
  await openDemo(page);
  await page
    .getByLabel("Demo scenario", { exact: true })
    .selectOption("normal");
  await expect(
    page.getByRole("heading", { name: "What changed?" }),
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
  await expect(
    assignment.getByLabel("Candidate 1 title", { exact: true }),
  ).toBeEditable();
  await expect(
    assignment.getByLabel("Candidate 1 estimate", { exact: true }),
  ).toBeEditable();

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
  await expect(
    page.getByRole("region", { name: "Choose more tasks", exact: true }),
  ).toContainText(
    /Clarify rubric and project scope|Implement one core increment|Test and review/,
  );
  await navigate(page, "/plan");
  await page.getByRole("button", { name: "Adjust & replan" }).click();
  await page.getByText("Re-estimate remaining time (optional)").click();
  await expect(
    page.getByLabel("Remaining minutes for Clarify rubric and project scope"),
  ).toHaveValue("40");
  await page.getByRole("button", { name: "Preview new schedule" }).click();
  await page.getByRole("button", { name: "Apply new schedule" }).click();
  await expect(
    page.getByRole("heading", { name: "Plan updated" }),
  ).toBeVisible();
  await expect(page.locator(".plan-days")).toContainText(
    "Clarify rubric and project scope",
  );
});

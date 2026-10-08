import { test, expect, Page, navigate } from "./fixtures";

test.beforeEach(async ({ request, baseURL }) => {
  const reset = await request.post("/compass-api/demo/scenarios/select", {
    headers: { Origin: baseURL! },
    data: { scenario_id: "crunch" },
  });
  expect(reset.ok()).toBeTruthy();
});

async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

test("four screens are readable and responsive", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const screens = [
    ["/today", "today"],
    ["/plan", "plan"],
    ["/reflect", "reflect"],
    ["/history", "history"],
  ];
  for (const [path, name] of screens) {
    await page.goto(path);
    await expect(page.locator("main h1")).toBeVisible();
    await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
    await noOverflow(page);
    await page.screenshot({
      path: info.outputPath(`${name}.png`),
      fullPage: true,
    });
  }
  expect(errors).toEqual([]);
});

test("manual academic data becomes an explicit study task", async ({
  page,
}) => {
  await page.goto("/academic");
  await page
    .getByRole("button", { name: "Add assignment", exact: true })
    .click();
  await page.getByLabel("Course name").fill("Pilot Databases");
  await page.getByLabel("Course code").fill("DB-PILOT");
  await page.getByLabel("Assignment title").fill("Normalize the pilot schema");
  await page
    .getByLabel("Deadline (your device timezone)")
    .fill("2026-10-08T17:00");
  await page.getByLabel("Planning estimate (minutes)").fill("90");
  await page.getByRole("button", { name: "Import manual data" }).click();
  await page.getByText("Provenance", { exact: true }).click();
  await expect(page.getByText("Provenance: MANUAL")).toBeVisible();
  await expect(
    page.getByText("student-provided pilot data, never official HaUI data"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Create study task" }).click();
  await page.getByRole("button", { name: "Save study task" }).click();
  await expect(
    page.getByText(
      "Study task created. It can now be used by the existing planning loop.",
    ),
  ).toBeVisible();
  await navigate(page, "/today");
  await expect(
    page.getByText("Work on Normalize the pilot schema"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Record work", exact: true }),
  ).toBeVisible();
});

test("real HTTP learning loop preserves explicit student choices", async ({
  page,
}) => {
  let contextNow = "";
  let contextWindows: { starts_at: string; ends_at: string }[] = [];
  await page.route("**/compass-api/demo/context", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    contextNow = body.now;
    contextWindows = body.study_windows;
    await route.fulfill({ response, json: body });
  });
  await page.goto("/today");
  await page.getByRole("button", { name: "Record work", exact: true }).click();
  const executionRequest = page.waitForRequest((request) =>
    request.url().includes("/compass-api/task-executions"),
  );
  await expect(page.getByRole("dialog")).toBeVisible();
  const executionNow = contextNow;
  await page.getByRole("button", { name: "Save execution" }).click();
  expect(
    Math.floor(
      Date.parse((await executionRequest).postDataJSON().ended_at) / 60000,
    ),
  ).toBe(Math.floor(Date.parse(executionNow) / 60000));
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await navigate(page, "/reflect");
  await expect(page.locator('input[name="reflected"]')).toHaveCount(4);
  for (const checkbox of await page.locator('input[name="reflected"]').all()) {
    await checkbox.check();
  }
  await page.getByLabel("Too heavy", { exact: true }).check();
  await page.getByLabel("Topics that felt difficult").fill("Normalization");
  await page.getByRole("button", { name: "Review my notes" }).click();
  await expect(page.locator(".insight-choice")).not.toHaveCount(0);
  await expect(
    page
      .locator(".insights")
      .getByText("FROM RECORDED WORK", { exact: true })
      .first(),
  ).toBeVisible();
  await expect(
    page
      .locator(".insights")
      .getByText("YOUR FEEDBACK", { exact: true })
      .first(),
  ).toBeVisible();
  await expect(page.locator(".insight-choice input:checked")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Save selected notes" }),
  ).toBeDisabled();
  await page.getByRole("checkbox", { name: "Workload felt too heavy" }).check();
  const confirmation = page.waitForRequest((request) =>
    request.url().includes("/compass-api/reflections/confirm"),
  );
  await page.getByRole("button", { name: "Save selected notes" }).click();
  expect((await confirmation).postDataJSON().selected_signal_ids).toHaveLength(
    1,
  );
  await expect(
    page.getByText(
      "Your selected reflection signals were confirmed and saved.",
    ),
  ).toBeVisible();
  await navigate(page, "/plan");
  await expect(
    page.getByRole("heading", { name: "Needs attention" }),
  ).toBeVisible();
  const revision = Number(
    (await page.locator(".plan-toolbar .badge").innerText()).replace(
      "Revision ",
      "",
    ),
  );
  await page.getByRole("button", { name: "Adjust & replan" }).click();
  const remaining = page.getByRole("spinbutton").first();
  await remaining.fill(String(45 + revision));
  await page.getByRole("button", { name: "Remove study window 2" }).click();
  await noOverflow(page);
  const replanRequest = page.waitForRequest((request) =>
    request.url().includes("/compass-api/weekly-plans/replan"),
  );
  const replanNow = contextNow;
  await page.getByRole("button", { name: "Create revised plan" }).click();
  const replanPayload = (await replanRequest).postDataJSON();
  expect(Date.parse(replanPayload.effective_at)).toBe(Date.parse(replanNow));
  expect(replanPayload.study_windows).toHaveLength(2);
  expect(replanPayload.study_windows).not.toContainEqual(contextWindows[1]);
  await expect(
    page.getByRole("heading", { name: "Plan updated" }),
  ).toBeVisible();
  await expect(page.getByText("BEFORE", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("AFTER", { exact: true }).first()).toBeVisible();
  await navigate(page, "/history");
  await expect(page.locator("details.revision").nth(1)).toBeVisible();
  await page.locator("details.revision summary").first().click();
  await expect(page.locator(".revision-content").first()).toBeVisible();
  await noOverflow(page);
});

test("failed execution keeps input and uses the same ID for an exact retry", async ({
  page,
}) => {
  const payloads: { record_id: string; outcome: string }[] = [];
  await page.route("**/compass-api/task-executions", async (route) => {
    payloads.push(route.request().postDataJSON());
    if (payloads.length === 1) {
      await route.fulfill({
        status: 503,
        json: {
          error: {
            code: "unavailable",
            message: "Execution service unavailable.",
          },
        },
      });
    } else {
      await route.continue();
    }
  });
  await page.goto("/today");
  await page.getByRole("button", { name: "Record work", exact: true }).click();
  await page.getByRole("button", { name: "Save execution" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Execution service unavailable.",
  );
  await expect(
    page.locator('input[name="outcome"][value="partial"]'),
  ).toBeChecked();
  await page.getByRole("button", { name: "Save execution" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(payloads).toHaveLength(2);
  expect(payloads[1]).toEqual(payloads[0]);
});

test("editing answers during review discards stale candidate results", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/compass-api/reflections/candidates", async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto("/reflect");
  await page.getByLabel("Topics that felt difficult").fill("Old topic");
  await page.getByRole("button", { name: "Review my notes" }).click();
  await expect(page.getByRole("button", { name: "Reviewing…" })).toBeVisible();
  await page.getByLabel("Topics that felt difficult").fill("New topic");
  release();
  await expect(
    page.getByRole("button", { name: "Review my notes" }),
  ).toBeEnabled();
  await expect(page.locator(".insight-choice")).toHaveCount(0);
  await page.unroute("**/compass-api/reflections/candidates");
  await page.getByRole("button", { name: "Review my notes" }).click();
  await expect(
    page.getByRole("checkbox", { name: "Difficult topic: New topic" }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "Difficult topic: Old topic" }),
  ).toHaveCount(0);
});

test("loading, API failure and retry remain understandable", async ({
  page,
}) => {
  await page.route("**/compass-api/demo/context", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.fulfill({
      status: 503,
      json: {
        error: { code: "unavailable", message: "Demo API unavailable." },
      },
    });
  });
  await page.goto("/today");
  await expect(page.getByRole("status")).toContainText(
    "Loading your workspace",
  );
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Demo API unavailable.",
  );
  await noOverflow(page);
  await page.unroute("**/compass-api/demo/context");
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(
    page.getByRole("button", { name: "Record work", exact: true }),
  ).toBeVisible();
});

test("empty recommendation and plan do not fabricate work", async ({
  page,
}) => {
  await page.route("**/compass-api/daily-recommendation", (route) =>
    route.fulfill({
      json: {
        recommendation: { kind: "no_recommendation" },
        assignment_risks: [],
      },
    }),
  );
  await page.route("**/compass-api/weekly-plans/history?*", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.goto("/today");
  await expect(
    page.getByRole("heading", { name: "You're clear for now." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Record work", exact: true }),
  ).toHaveCount(0);
  await navigate(page, "/plan");
  await expect(
    page.getByRole("button", { name: "Generate plan", exact: true }),
  ).toBeVisible();
  await navigate(page, "/history");
  await expect(
    page.getByRole("heading", { name: "Your story starts with a plan" }),
  ).toBeVisible();
  await noOverflow(page);
});

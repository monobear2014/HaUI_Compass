import { test, expect } from "./fixtures";

test.beforeEach(async ({ context, baseURL }) => {
  await context.request.post("/compass-api/demo/scenarios/select", {
    headers: { Origin: baseURL! },
    data: { scenario_id: "normal" },
  });
  const state = await (
    await context.request.get("/compass-api/ticket-board")
  ).json();
  await context.request.post("/compass-api/ticket-board", {
    headers: { Origin: baseURL! },
    data: {
      scope: state.scope,
      version: state.board?.version || 0,
      task_ids: [],
      active_task_id: null,
      planned_minutes: {},
      capacity_minutes: 90,
    },
  });
});

test("compact tickets reveal actions only in details and move both ways", async ({
  page,
}, info) => {
  await page.goto("/plan");
  const week = page.getByRole("region", {
    name: "Weekly ticket board",
    exact: true,
  });
  const first = week.getByRole("article").first();
  const title = await first
    .getByRole("button")
    .filter({ hasNotText: "⠿" })
    .innerText();
  await expect(first.getByRole("button")).toHaveCount(2);
  await expect(first.getByRole("combobox")).toHaveCount(0);
  await expect(first).not.toContainText("approved sessions");
  expect((await first.boundingBox())!.height).toBeLessThan(180);
  await week.getByRole("searchbox").fill("no-matching-ticket");
  await expect(week.getByRole("article")).toHaveCount(0);
  await week.getByRole("searchbox").fill("");
  for (const column of [
    "progress",
    "review",
    "done",
    "review",
    "progress",
    "todo",
  ]) {
    await week.getByRole("button", { name: title, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Estimated");
    await expect(dialog).toContainText("Approved study sessions");
    await dialog
      .getByRole("combobox", { name: `Move ticket ${title}`, exact: true })
      .selectOption(column);
    await expect(dialog.getByRole("combobox")).toBeEnabled();
    await dialog
      .getByRole("button", { name: "Close ticket details", exact: true })
      .click();
    await page.reload();
    await week.getByRole("button", { name: title, exact: true }).click();
    await expect(dialog.getByRole("combobox")).toHaveValue(column);
    await dialog
      .getByRole("button", { name: "Close ticket details", exact: true })
      .click();
  }
  if (info.project.name === "desktop")
    for (const column of ["In review", "To do"]) {
      const source = week
        .getByRole("article", { name: title, exact: true })
        .getByRole("button", { name: `Drag ticket ${title}`, exact: true });
      await expect(source).toBeEnabled();
      await source.scrollIntoViewIfNeeded();
      const from = await source.boundingBox();
      if (!from) throw new Error("Missing source");
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        from.x + from.width / 2 + 10,
        from.y + from.height / 2,
        { steps: 4 },
      );
      const heading = week
        .getByRole("region", { name: column, exact: true })
        .getByRole("heading");
      await heading.scrollIntoViewIfNeeded();
      const to = await heading.boundingBox();
      if (!to) throw new Error("Missing destination");
      await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
        steps: 20,
      });
      await expect(
        week.getByRole("region", { name: column, exact: true }),
      ).toHaveAttribute("data-drop-active", "true");
      await page.mouse.up();
      await expect(
        week
          .getByRole("region", { name: column, exact: true })
          .getByRole("article", { name: title, exact: true }),
      ).toBeVisible();
    }
  await page.screenshot({
    path: info.outputPath("compact-tickets.png"),
    fullPage: true,
  });
});

test("daily selection and actual study logging remain available in details", async ({
  page,
}) => {
  await page.goto("/plan");
  const first = page
    .getByRole("region", { name: "Weekly ticket board", exact: true })
    .getByRole("article")
    .first();
  const title = await first
    .getByRole("button")
    .filter({ hasNotText: "⠿" })
    .innerText();
  await first.getByRole("button").filter({ hasNotText: "⠿" }).click();
  const details = page.getByRole("dialog");
  await details.getByRole("button", { name: "+ Today", exact: true }).click();
  await expect(
    details.getByRole("button", { name: "Remove from today", exact: true }),
  ).toBeEnabled();
  await details.getByRole("button", { name: "Start", exact: true }).click();
  await expect(
    details.getByRole("button", { name: "Pause", exact: true }),
  ).toBeEnabled();
  await details.getByRole("button", { name: "Pause", exact: true }).click();
  const execution = page.getByRole("dialog");
  await execution.getByRole("spinbutton").fill("7");
  await execution.getByRole("button", { name: "Save", exact: true }).click();
  await expect(execution).not.toBeVisible();
  await page.goto("/today");
  const queue = page.getByRole("region", { name: "Today's list", exact: true });
  await queue.getByRole("button", { name: title, exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Studied: 7 min");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Start", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Complete", exact: true })
    .click();
  await page.getByRole("dialog").getByRole("spinbutton").fill("5");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await queue.getByRole("button", { name: title, exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("combobox")).toHaveValue(
    "done",
  );
});

test("ticket details edit, cancel and persist across reload and days", async ({
  page,
  context,
  baseURL,
}) => {
  await page.goto("/plan");
  const week = page.getByRole("region", {
    name: "Weekly ticket board",
    exact: true,
  });
  const card = week.getByRole("article").first();
  const original = await card
    .getByRole("button")
    .filter({ hasNotText: "⠿" })
    .innerText();
  await card.getByRole("button", { name: original, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox", { name: "Ticket title", exact: true })
    .fill("Unsaved title");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    week.getByRole("article", { name: original, exact: true }),
  ).toBeVisible();
  await week.getByRole("button", { name: original, exact: true }).click();
  await dialog
    .getByRole("textbox", { name: "Ticket title", exact: true })
    .fill("Personal study step");
  await dialog
    .getByRole("textbox", { name: "Description / notes", exact: true })
    .fill("Read the original source and write my own summary.");
  await dialog
    .getByRole("button", { name: "Save ticket", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await week
    .getByRole("button", { name: "Personal study step", exact: true })
    .click();
  await expect(
    dialog.getByRole("textbox", { name: "Description / notes", exact: true }),
  ).toHaveValue("Read the original source and write my own summary.");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await context.request.post("/compass-api/demo/clock/advance", {
    headers: { Origin: baseURL! },
    data: { to: "next_day" },
  });
  await page.reload();
  await expect(
    week.getByRole("article", { name: "Personal study step", exact: true }),
  ).toBeVisible();
});

async function pointerDrop(
  page: import("@playwright/test").Page,
  title: string,
  targetTitle: string,
  edge: "before" | "after",
) {
  const source = page.getByRole("article", { name: title, exact: true });
  const target = page.getByRole("article", { name: targetTitle, exact: true });
  await expect(
    source.getByRole("button", { name: `Drag ticket ${title}`, exact: true }),
  ).toBeEnabled();
  await source.evaluate((node) =>
    node.scrollIntoView({ block: "center", behavior: "instant" }),
  );
  const handle = await source
    .getByRole("button", { name: `Drag ticket ${title}`, exact: true })
    .boundingBox();
  if (!handle) throw new Error("Drag handle missing");
  await page.mouse.move(
    handle.x + handle.width / 2,
    handle.y + handle.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    handle.x + handle.width / 2 + 10,
    handle.y + handle.height / 2,
    { steps: 4 },
  );
  await target.scrollIntoViewIfNeeded();
  const rect = await target.boundingBox();
  if (!rect) throw new Error("Target missing");
  await page.mouse.move(
    rect.x + rect.width / 2,
    rect.y + rect.height * (edge === "before" ? 0.2 : 0.8),
    { steps: 20 },
  );
  try {
    await expect(target.locator("..")).toHaveAttribute("data-drop-edge", edge);
  } catch (error) {
    await page.screenshot({ path: "/tmp/haui-local-drag-debug.png" });
    throw error;
  }
  await page.mouse.up();
}

test("pointer places tickets above or below, reorders the same column and persists", async ({
  page,
  context,
  baseURL,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "Mouse-specific regression; mobile uses touch/keyboard.",
  );
  const state = await (
    await context.request.get("/compass-api/ticket-board")
  ).json();
  const tasks = (
    await (await context.request.get("/compass-api/demo/context")).json()
  ).tasks;
  const [a, b, moving] = tasks;
  await context.request.post("/compass-api/ticket-board", {
    headers: { Origin: baseURL! },
    data: {
      ...state.board,
      scope: state.scope,
      ticket_order: tasks.map((t: { id: string }) => t.id),
      columns: { [moving.id]: "progress" },
    },
  });
  await page.goto("/plan");
  const column = page.getByRole("region", { name: "To do", exact: true });
  await pointerDrop(page, moving.title, a.title, "before");
  await expect(column.getByRole("article").first()).toHaveAccessibleName(
    moving.title,
  );
  await expect(
    page.getByRole("button", { name: "Reload", exact: true }),
  ).toBeEnabled();
  await page.reload();
  await expect(column.getByRole("article").first()).toHaveAccessibleName(
    moving.title,
  );
  await pointerDrop(page, moving.title, b.title, "after");
  await expect(column.getByRole("article").nth(2)).toHaveAccessibleName(
    moving.title,
  );
  await expect(
    page.getByRole("button", { name: "Reload", exact: true }),
  ).toBeEnabled();
  await page.reload();
  await expect(column.getByRole("article").nth(2)).toHaveAccessibleName(
    moving.title,
  );
  // Put the last ticket back at the top using the same column's insertion target.
  await pointerDrop(page, moving.title, a.title, "before");
  await expect(column.getByRole("article").first()).toHaveAccessibleName(
    moving.title,
  );
});

test("drag can cancel and a failed optimistic move restores the saved order", async ({
  page,
  context,
}, info) => {
  test.skip(info.project.name !== "desktop", "Mouse-specific regression.");
  await page.goto("/plan");
  const column = page.getByRole("region", { name: "To do", exact: true });
  await expect(column.getByRole("article").first()).toBeVisible();
  const titles = await column
    .getByRole("article")
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("aria-label")));
  const version = (
    await (await context.request.get("/compass-api/ticket-board")).json()
  ).board.version;
  const handle = column
    .getByRole("article")
    .first()
    .getByRole("button", { name: `Drag ticket ${titles[0]}`, exact: true });
  await expect(handle).toBeEnabled();
  await handle.focus();
  await page.keyboard.press("Space", { delay: 50 });
  await expect(page.locator("[data-drag-active=true]")).toHaveCount(1);
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("[data-drop-edge=after]")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-drag-active=true]")).toHaveCount(0);
  expect(
    (await (await context.request.get("/compass-api/ticket-board")).json())
      .board.version,
  ).toBe(version);
  await page.reload();
  await expect(column.getByRole("article").first()).toBeVisible();
  await page.route("**/compass-api/ticket-board", (route) =>
    route.request().method() === "POST" ? route.abort() : route.continue(),
  );
  await pointerDrop(page, titles[0]!, titles[1]!, "after");
  await expect(
    page.getByRole("alert").filter({ hasText: "Could not save" }),
  ).toBeVisible();
  expect(
    await column
      .getByRole("article")
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("aria-label"))),
  ).toEqual(titles);
  await page.unroute("**/compass-api/ticket-board");
  await page.getByRole("button", { name: "Reload", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Could not save" }),
  ).toHaveCount(0);
});

test("keyboard can choose and save a new ticket position", async ({ page }) => {
  await page.goto("/plan");
  const column = page.getByRole("region", { name: "To do", exact: true });
  await expect(column.getByRole("article").first()).toBeVisible();
  const title = (await column
    .getByRole("article")
    .first()
    .getAttribute("aria-label"))!;
  const handle = column.getByRole("button", {
    name: `Drag ticket ${title}`,
    exact: true,
  });
  await expect(handle).toBeEnabled();
  await handle.focus();
  await page.keyboard.press("Space", { delay: 50 });
  await expect(page.locator("[data-drag-active=true]")).toHaveCount(1);
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("[data-drop-edge=after]")).toHaveCount(1);
  await page.keyboard.press("Space", { delay: 50 });
  await expect(column.getByRole("article").nth(1)).toHaveAccessibleName(title);
  await expect(
    page.getByRole("button", { name: "Reload", exact: true }),
  ).toBeEnabled();
  await page.reload();
  await expect(column.getByRole("article").nth(1)).toHaveAccessibleName(title);
});

test("touch hold can reorder compact tickets", async ({
  page,
  context,
}, info) => {
  test.skip(info.project.name !== "mobile", "Touch viewport regression.");
  await page.goto("/plan");
  const column = page.getByRole("region", { name: "To do", exact: true });
  const first = column.getByRole("article").first();
  await expect(first.getByRole("button").first()).toBeEnabled();
  await first.evaluate((node) =>
    node.scrollIntoView({ block: "center", behavior: "instant" }),
  );
  const title = (await first.getAttribute("aria-label"))!;
  const from = await first
    .getByRole("button", { name: `Drag ticket ${title}`, exact: true })
    .boundingBox();
  const target = await column.getByRole("article").nth(1).boundingBox();
  if (!from || !target) throw new Error("Touch target missing");
  const cdp = await context.newCDPSession(page);
  const x = from.x + from.width / 2,
    y = from.y + from.height / 2;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  await expect(page.locator("[data-drag-active=true]")).toHaveCount(1);
  for (let step = 1; step <= 12; step++)
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x: x + ((target.x + target.width / 2 - x) * step) / 12,
          y: y + ((target.y + target.height * 0.8 - y) * step) / 12,
        },
      ],
    });
  await expect(page.locator("[data-drop-edge=after]")).toHaveCount(1);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(column.getByRole("article").nth(1)).toHaveAccessibleName(title);
  await expect(
    page.getByRole("button", { name: "Reload", exact: true }),
  ).toBeEnabled();
  await page.reload();
  await expect(column.getByRole("article").nth(1)).toHaveAccessibleName(title);
  await cdp.detach();
});

test("create personal tickets and keep multiple tickets in every column", async ({
  page,
}) => {
  await page.goto("/plan");
  const week = page.getByRole("region", {
    name: "Weekly ticket board",
    exact: true,
  });
  for (let i = 0; i < 3; i++) {
    await week
      .getByRole("button", { name: "+ Create ticket", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("textbox", { name: "Ticket title", exact: true })
      .fill(`My personal ticket ${i}`);
    await dialog
      .getByRole("textbox", { name: "Description / notes" })
      .fill("Review concepts before class");
    await dialog
      .getByRole("button", { name: "Create ticket", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(
      week.getByRole("button", {
        name: `My personal ticket ${i}`,
        exact: true,
      }),
    ).toBeVisible();
  }
  for (const [value, label] of [
    ["progress", "In progress"],
    ["review", "In review"],
    ["done", "Done"],
    ["todo", "To do"],
  ]) {
    for (let i = 0; i < 3; i++) {
      const title = `My personal ticket ${i}`;
      await week.getByRole("button", { name: title, exact: true }).click();
      const dialog = page.getByRole("dialog");
      await expect(
        dialog.getByRole("textbox", { name: "Description / notes" }),
      ).toHaveValue("Review concepts before class");
      await dialog
        .getByRole("combobox", { name: `Move ticket ${title}`, exact: true })
        .selectOption(value);
      await expect(dialog.getByRole("combobox")).toBeEnabled();
      await dialog
        .getByRole("button", { name: "Close ticket details" })
        .click();
    }
    await page.reload();
    for (let i = 0; i < 3; i++) {
      await expect(
        week
          .getByRole("region", { name: label, exact: true })
          .getByRole("article", {
            name: `My personal ticket ${i}`,
            exact: true,
          }),
      ).toBeVisible();
    }
  }
  for (let i = 0; i < 3; i++) {
    await week
      .getByRole("button", { name: `My personal ticket ${i}`, exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Start", exact: true }).click();
    await expect(dialog.getByRole("combobox")).toBeEnabled();
    await dialog.getByRole("button", { name: "Close ticket details" }).click();
  }
  await expect(
    week
      .getByRole("region", { name: "In progress", exact: true })
      .getByRole("article")
      .filter({ hasText: "My personal ticket" }),
  ).toHaveCount(3);
});

test("drag several tickets into an already populated column", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "Mouse regression");
  await page.goto("/plan");
  const week = page.getByRole("region", {
    name: "Weekly ticket board",
    exact: true,
  });
  await expect(week.getByRole("article").nth(2)).toBeVisible();
  const titles = await week
    .getByRole("article")
    .evaluateAll((nodes) =>
      nodes.slice(0, 3).map((node) => node.getAttribute("aria-label")!),
    );
  expect(titles).toHaveLength(3);
  for (const [column, label] of [
    ["progress", "In progress"],
    ["review", "In review"],
    ["done", "Done"],
    ["todo", "To do"],
  ]) {
    await week.getByRole("button", { name: titles[0], exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("combobox", { name: `Move ticket ${titles[0]}`, exact: true })
      .selectOption(column);
    await expect(dialog.getByRole("combobox")).toBeEnabled();
    await dialog.getByRole("button", { name: "Close ticket details" }).click();
    await pointerDrop(page, titles[1], titles[0], "after");
    await expect(
      week
        .getByRole("region", { name: label, exact: true })
        .getByRole("article", { name: titles[1], exact: true }),
    ).toBeVisible();
    await pointerDrop(page, titles[2], titles[1], "before");
    await expect(
      week
        .getByRole("region", { name: label, exact: true })
        .getByRole("article", { name: titles[2], exact: true }),
    ).toBeVisible();
  }
});

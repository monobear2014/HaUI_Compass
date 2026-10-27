import { test, expect } from "./fixtures";

test.beforeEach(async ({ context, baseURL }) => {
  await context.request.delete("/compass-api/companion/history", {
    headers: { Origin: baseURL! },
  });
  const current = await context.request.get("/compass-api/companion");
  for (const memory of (await current.json()).memories || [])
    await context.request.delete(`/compass-api/companion/memory/${memory.id}`, {
      headers: { Origin: baseURL! },
    });
});

async function openChat(page: import("@playwright/test").Page) {
  await expect(
    page.getByRole("button", { name: /^(Open chatbot|Close chatbot)$/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^(Open chatbot|Close chatbot)$/ }),
  ).toBeEnabled();
  const open = page.getByRole("button", { name: "Open chatbot", exact: true });
  if (await open.isVisible()) await open.click();
  return page.getByRole("complementary", {
    name: "Compass chatbot",
    exact: true,
  });
}

test("workbench panels collapse independently, persist and do not overflow", async ({
  page,
}, info) => {
  await page.goto("/today");
  const chat = await openChat(page);
  await expect(chat).toBeVisible();
  if (info.project.name === "desktop") {
    await page
      .getByRole("button", { name: "Collapse left menu", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Expand left menu", exact: true }),
    ).toHaveAttribute("aria-expanded", "false");
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Expand left menu", exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("navigation", { name: "YOUR WORKSPACE", exact: true })
        .getByRole("link", { name: "Today", exact: true }),
    ).toBeVisible();
  }
  await page
    .getByRole("button", { name: "Close chatbot", exact: true })
    .click();
  await expect(chat).toBeHidden();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Open chatbot", exact: true }),
  ).toBeVisible();
  await openChat(page);
  await expect(chat).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(chat).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("global assistant uses specialist handoff and explicit long-term memory", async ({
  page,
}) => {
  await page.goto("/today");
  const chat = await openChat(page);
  await chat.getByRole("button", { name: /^Memory/ }).click();
  await chat
    .getByLabel("What I want remembered", { exact: true })
    .fill("Tôi học tốt hơn với ví dụ ngắn và từng bước.");
  const save = chat.getByRole("button", {
    name: "Confirm & remember",
    exact: true,
  });
  await expect(save).toBeDisabled();
  await chat.getByRole("checkbox").check();
  await save.click();
  await expect(chat.getByRole("status")).toContainText(
    "Saved with your confirmation",
  );
  await chat.getByRole("button", { name: "Chat", exact: true }).click();
  await chat
    .getByRole("textbox", { name: "Message Compass", exact: true })
    .fill("Dựa vào tuần trước, giúp tôi lên kế hoạch tuần sau.");
  await chat.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    chat.getByRole("link", { name: "Review and approve a plan", exact: true }),
  ).toBeVisible();
  const exchanges = await (
    await page.request.get("/compass-api/companion")
  ).json();
  expect(exchanges.exchanges.at(-1).response.agents).toEqual([
    "supervisor",
    "memory",
    "reflector",
    "planner",
    "validation",
  ]);
  expect(exchanges.exchanges.at(-1).response.memory_used).toBeGreaterThan(0);
  await page.reload();
  await openChat(page);
  await expect(chat.getByRole("log")).toContainText("Dựa vào tuần trước");
  await chat.getByRole("button", { name: /^Memory/ }).click();
  await expect(chat).toContainText(
    "Tôi học tốt hơn với ví dụ ngắn và từng bước.",
  );
  await chat.getByRole("button", { name: "Edit", exact: true }).click();
  await chat
    .getByLabel("What I want remembered", { exact: true })
    .fill("Tôi thích tự giải thích bằng ví dụ.");
  await chat.getByRole("checkbox").check();
  await save.click();
  await expect(chat).toContainText("Tôi thích tự giải thích bằng ví dụ.");
  await chat.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(chat).toContainText("Memory deleted");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("side tutor shows real sources and redirects graded outsourcing to guidance", async ({
  page,
}) => {
  await page.goto("/knowledge");
  await expect(page).toHaveURL(/\/learn\?assistant=1/);
  const chat = await openChat(page);
  await chat.getByLabel("Support mode", { exact: true }).selectOption("tutor");
  await chat.locator("summary[title]").click();
  await chat
    .getByRole("button", { name: "Automatic control", exact: true })
    .click();
  await chat
    .getByRole("textbox", { name: "Message Compass", exact: true })
    .fill("PID control gồm những thành phần nào?");
  await chat.getByRole("button", { name: "Send", exact: true }).click();
  await expect(chat.getByText(/Sources ·/)).toBeVisible();
  await chat.getByText(/Sources ·/).click();
  await expect(
    chat.getByRole("link", { name: /MIT 16.06/ }).first(),
  ).toHaveAttribute("href", /\.pdf#page=\d+$/);
  await chat
    .getByRole("textbox", { name: "Message Compass", exact: true })
    .fill("Write my graded assignment, just the final answer");
  await chat.getByRole("button", { name: "Send", exact: true }).click();
  await expect(chat.getByRole("log")).toContainText(
    "không viết lời giải hoàn chỉnh",
  );
});

test("new conversations keep separate saved histories and restore selection", async ({
  page,
  context,
}, info) => {
  await page.goto("/today");
  const chat = await openChat(page);
  const composer = chat.getByRole("textbox", {
    name: "Message Compass",
    exact: true,
  });
  const first = "Giúp tôi lên kế hoạch ôn đại số tuần này.";
  await chat.getByLabel("Support mode", { exact: true }).selectOption("plan");
  await composer.fill(first);
  await chat.getByRole("button", { name: "Send", exact: true }).click();
  await expect(chat.getByRole("log")).toContainText(first);
  await expect(
    chat.getByRole("button", { name: "New conversation", exact: true }),
  ).toBeEnabled();
  const listing = await (
    await context.request.get("/compass-api/companion/conversations")
  ).json();
  const firstId = listing.conversations[0].id;
  await chat
    .getByRole("button", { name: "New conversation", exact: true })
    .click();
  await expect(chat.getByRole("log")).not.toContainText(first);
  await expect(composer).toBeFocused();
  const second = "Lập kế hoạch học xác suất vào buổi tối.";
  await composer.fill(second);
  await chat.getByRole("button", { name: "Send", exact: true }).click();
  await expect(chat.getByRole("log")).toContainText(second);
  await chat.getByRole("button", { name: "History", exact: true }).click();
  const history = chat.getByRole("region", {
    name: "Conversation history",
    exact: true,
  });
  await expect(
    history.getByRole("button", { name: new RegExp(first) }),
  ).toBeVisible();
  await history.getByRole("button", { name: new RegExp(first) }).click();
  await expect(chat.getByRole("log")).toContainText(first);
  await expect(chat.getByRole("log")).not.toContainText(second);
  await page.reload();
  await openChat(page);
  await expect(chat.getByRole("log")).toContainText(first);
  await expect(chat.getByRole("log")).not.toContainText(second);
  const current = await (
    await context.request.get(`/compass-api/companion/conversations/${firstId}`)
  ).json();
  expect(current.exchanges).toHaveLength(1);
  await chat.getByRole("button", { name: "History", exact: true }).click();
  await page.screenshot({ path: info.outputPath("conversation-history.png") });
});

test("failed conversation creation retries without duplicate history", async ({
  page,
  context,
}) => {
  await page.goto("/today");
  const chat = await openChat(page);
  const create = chat.getByRole("button", {
    name: "New conversation",
    exact: true,
  });
  await expect(create).toBeEnabled();
  let fail = true;
  await page.route("**/compass-api/companion/conversations", async (route) => {
    if (route.request().method() === "POST" && fail) {
      fail = false;
      const saved = await route.fetch();
      expect(saved.status()).toBe(200);
      await route.abort();
    } else await route.continue();
  });
  await create.click();
  await expect(chat.getByRole("alert")).toContainText("Could not create");
  await create.click();
  await expect(chat.getByRole("alert")).toHaveCount(0);
  const listing = await (
    await context.request.get("/compass-api/companion/conversations")
  ).json();
  expect(listing.conversations).toHaveLength(1);
});

test("older messages remain available beyond the latest thirty", async ({
  page,
  context,
  baseURL,
}) => {
  const identifier = crypto.randomUUID();
  expect(
    (
      await context.request.post("/compass-api/companion/conversations", {
        headers: { Origin: baseURL! },
        data: { identifier },
      })
    ).status(),
  ).toBe(200);
  for (let i = 0; i < 32; i++)
    expect(
      (
        await context.request.post("/compass-api/companion/messages", {
          headers: { Origin: baseURL! },
          data: {
            request_id: crypto.randomUUID(),
            conversation_id: identifier,
            text: `Lập kế hoạch mục số ${i}.`,
            mode: "plan",
          },
        })
      ).status(),
    ).toBe(200);
  await page.goto("/today");
  const chat = await openChat(page);
  await expect(chat.getByRole("log")).not.toContainText(
    "Lập kế hoạch mục số 0.",
  );
  await chat
    .getByRole("button", { name: "Earlier messages", exact: true })
    .click();
  await expect(chat.getByRole("log")).toContainText("Lập kế hoạch mục số 0.");
  await expect(
    chat.getByRole("button", { name: "Earlier messages", exact: true }),
  ).toHaveCount(0);
});

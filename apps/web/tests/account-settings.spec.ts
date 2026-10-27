import { test, expect } from "./fixtures";

test("appearance and account menu edit a private persistent profile", async ({
  page,
  context,
  baseURL,
}, info) => {
  const account = {
    username: `profile_${crypto.randomUUID().slice(0, 8)}`,
    password: crypto.randomUUID(),
    name: "Profile student",
  };
  expect(
    (
      await context.request.post("/api/auth/register", {
        headers: { Origin: baseURL! },
        data: account,
      })
    ).status(),
  ).toBe(201);
  await page.goto("/learn");
  await expect(
    page.getByRole("link", { name: "Ask documents", exact: true }),
  ).toHaveCount(0);
  const appearance = page.getByRole("group", {
    name: "Language and appearance",
    exact: true,
  });
  await expect(
    appearance.getByRole("button", { name: "English", exact: true }),
  ).toBeVisible();
  await appearance.getByRole("button", { name: /dark mode/i }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await appearance.getByRole("button", { name: /light mode/i }).click();
  if (info.project.name === "desktop")
    await page
      .getByRole("button", { name: "Collapse left menu", exact: true })
      .click();
  if (info.project.name === "mobile")
    await page
      .getByRole("button", { name: "Toggle navigation", exact: true })
      .click();
  const menu = page.getByTestId("account-menu");
  await menu.locator("summary").first().click();
  await expect(
    menu.getByRole("button", { name: "Sign out", exact: true }),
  ).toBeVisible();
  await menu
    .getByRole("link", { name: "Account settings", exact: true })
    .click();
  await page
    .getByLabel("Display name", { exact: true })
    .fill("Tên sinh viên đã sửa");
  await page.getByRole("button", { name: "Tiếng Việt", exact: true }).click();
  await expect(page.getByLabel("Tên hiển thị", { exact: true })).toHaveValue(
    "Tên sinh viên đã sửa",
  );
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.getByLabel("Date of birth", { exact: true }).fill("2003-07-15");
  await page
    .getByLabel("Field of study", { exact: true })
    .fill("AI Engineering");
  await page
    .getByLabel("About you", { exact: true })
    .fill("Tôi thích học theo từng bước.");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "Personal information saved",
  );
  await page.reload();
  await expect(page.getByLabel("Display name", { exact: true })).toHaveValue(
    "Tên sinh viên đã sửa",
  );
  await expect(page.getByLabel("Date of birth", { exact: true })).toHaveValue(
    "2003-07-15",
  );
  await page.screenshot({
    path: info.outputPath("account-settings.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    (
      await context.request.patch("/api/account", {
        headers: { Origin: baseURL! },
        data: { name: "Student", birth_date: "2099-01-01", major: "", bio: "" },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await context.request.patch("/api/account", {
        headers: { Origin: baseURL! },
        data: {
          name: "Student",
          birth_date: null,
          major: "",
          bio: "",
          user_id: "other",
        },
      })
    ).status(),
  ).toBe(400);
  if (info.project.name === "mobile")
    await page
      .getByRole("button", { name: "Toggle navigation", exact: true })
      .click();
  await page.getByTestId("account-menu").locator("summary").first().click();
  await page
    .getByTestId("account-menu")
    .getByRole("button", { name: "Sign out", exact: true })
    .click();
  await expect(page).toHaveURL(/\/login$/);
});

test("password update verifies the current secret and rotates old sessions", async ({
  context,
  browser,
  baseURL,
}) => {
  const account = {
    username: `security_${crypto.randomUUID().slice(0, 8)}`,
    password: crypto.randomUUID(),
    name: "Security student",
  };
  expect(
    (
      await context.request.post("/api/auth/register", {
        headers: { Origin: baseURL! },
        data: account,
      })
    ).status(),
  ).toBe(201);
  const second = await browser.newContext();
  try {
    expect(
      (
        await second.request.post(`${baseURL}/api/auth/login`, {
          headers: { Origin: baseURL! },
          data: account,
        })
      ).status(),
    ).toBe(200);
    const path = "/api/account/password",
      next = crypto.randomUUID();
    expect(
      (
        await context.request.post(path, {
          headers: { Origin: baseURL! },
          data: { current_password: "incorrect-password", new_password: next },
        })
      ).status(),
    ).toBe(401);
    expect(
      (
        await context.request.post(path, {
          headers: { Origin: baseURL! },
          data: { current_password: account.password, new_password: "short" },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await context.request.post(path, {
          data: { current_password: account.password, new_password: next },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await context.request.post(path, {
          headers: { Origin: baseURL! },
          data: { current_password: account.password, new_password: next },
        })
      ).status(),
    ).toBe(200);
    expect(
      (await (await context.request.get("/api/auth/session")).json()).user,
    ).not.toBeNull();
    expect(
      (await (await second.request.get(`${baseURL}/api/auth/session`)).json())
        .user,
    ).toBeNull();
    expect(
      (
        await second.request.post(`${baseURL}/api/auth/login`, {
          headers: { Origin: baseURL! },
          data: account,
        })
      ).status(),
    ).toBe(401);
    expect(
      (
        await second.request.post(`${baseURL}/api/auth/login`, {
          headers: { Origin: baseURL! },
          data: { ...account, password: next },
        })
      ).status(),
    ).toBe(200);
  } finally {
    await second.close();
  }
});

test("document Q&A redirects to the single assistant with its course", async ({
  page,
}) => {
  await page.goto("/knowledge?course=ml");
  await expect(page).toHaveURL(/\/learn\?assistant=1&course=ml/);
  const chat = page.getByRole("complementary", {
    name: "Compass chatbot",
    exact: true,
  });
  await expect(chat).toBeVisible();
  await expect(chat.locator("summary[title='Machine Learning']")).toBeVisible();
  await chat.getByRole("button", { name: "Materials", exact: true }).click();
  await expect(chat.locator("summary[title='Machine Learning']")).toBeVisible();
});

test("avatar raster uploads persist, reject fake images and can reset", async ({
  page,
  context,
  baseURL,
}) => {
  const sharp = (await import("sharp")).default;
  const image = await sharp({
    create: { width: 32, height: 24, channels: 3, background: "#8760ad" },
  })
    .png()
    .toBuffer();
  await page.goto("/settings");
  await page
    .getByLabel("Upload profile picture", { exact: true })
    .setInputFiles({
      name: "avatar.png",
      mimeType: "image/png",
      buffer: image,
    });
  await expect(
    page.getByRole("status").filter({ hasText: "Profile picture updated" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page
      .getByRole("region", { name: "Profile picture", exact: true })
      .locator("img"),
  ).toBeVisible();
  const headers = { Origin: baseURL!, "Content-Type": "image/png" };
  for (const format of ["jpeg", "webp", "gif", "avif"] as const) {
    const bytes = await sharp(image).toFormat(format).toBuffer();
    expect(
      (
        await context.request.put("/api/account/avatar", {
          headers,
          data: bytes,
        })
      ).status(),
    ).toBe(200);
  }
  expect(
    (
      await context.request.put("/api/account/avatar", {
        headers,
        data: Buffer.from("<svg><script>alert(1)</script></svg>"),
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await context.request.put("/api/account/avatar", {
        headers,
        data: Buffer.alloc(5 * 1024 * 1024 + 1),
      })
    ).status(),
  ).toBe(413);
  expect(
    (
      await context.request.put("/api/account/avatar", {
        headers: { Origin: "https://invalid.example" },
        data: image,
      })
    ).status(),
  ).toBe(403);
  await page.getByRole("button", { name: "Use initials", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Profile picture", exact: true })
      .locator("img"),
  ).toHaveCount(0);
});

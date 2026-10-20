import { test, expect } from "@playwright/test";

test("PostgreSQL profile, password rotation and single-assistant navigation", async ({
  browser,
  baseURL,
}, info) => {
  const a = await browser.newContext();
  const b = await browser.newContext();
  try {
    const credentials = {
      username: `account_${crypto.randomUUID().slice(0, 8)}`,
      password: crypto.randomUUID(),
      name: "Account student",
    };
    expect(
      (
        await a.request.post(`${baseURL}/api/auth/register`, {
          headers: { Origin: baseURL! },
          data: credentials,
        })
      ).status(),
    ).toBe(201);
    const profile = {
      name: "Updated PG student",
      birth_date: "2002-04-12",
      major: "AI Engineering",
      bio: "Synthetic profile",
    };
    expect(
      (
        await a.request.patch(`${baseURL}/api/account`, {
          headers: { Origin: baseURL! },
          data: profile,
        })
      ).status(),
    ).toBe(200);
    const page = await a.newPage();
    await page.addInitScript(() =>
      localStorage.setItem("haui-compass-language", "en"),
    );
    await page.goto(`${baseURL}/settings`);
    await expect(page.getByLabel("Display name", { exact: true })).toHaveValue(
      profile.name,
    );
    await expect(page.getByLabel("Date of birth", { exact: true })).toHaveValue(
      profile.birth_date,
    );
    await page
      .getByLabel("Display name", { exact: true })
      .fill("PG profile saved from UI");
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Personal information saved",
    );
    await page.reload();
    await expect(page.getByLabel("Display name", { exact: true })).toHaveValue(
      "PG profile saved from UI",
    );
    expect(
      (
        await b.request.post(`${baseURL}/api/auth/login`, {
          headers: { Origin: baseURL! },
          data: credentials,
        })
      ).status(),
    ).toBe(200);
    const password = crypto.randomUUID();
    expect(
      (
        await a.request.post(`${baseURL}/api/account/password`, {
          headers: { Origin: baseURL! },
          data: {
            current_password: credentials.password,
            new_password: password,
          },
        })
      ).status(),
    ).toBe(200);
    expect(
      (await (await b.request.get(`${baseURL}/api/auth/session`)).json()).user,
    ).toBeNull();
    expect((await a.request.get(`${baseURL}/api/account`)).status()).toBe(200);
    expect(
      (
        await b.request.post(`${baseURL}/api/auth/login`, {
          headers: { Origin: baseURL! },
          data: credentials,
        })
      ).status(),
    ).toBe(401);
    expect(
      (
        await b.request.post(`${baseURL}/api/auth/login`, {
          headers: { Origin: baseURL! },
          data: { ...credentials, password },
        })
      ).status(),
    ).toBe(200);
    await page.goto(`${baseURL}/knowledge?course=stats`);
    await expect(page).toHaveURL(/\/learn\?assistant=1&course=stats/);
    const chat = page.getByRole("complementary", {
      name: "Compass chatbot",
      exact: true,
    });
    await expect(
      chat.getByLabel("Chatbot course", { exact: true }),
    ).toHaveValue("stats");
    await page
      .getByRole("button", { name: "Close chatbot", exact: true })
      .click();
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
  } finally {
    await a.close();
    await b.close();
  }
});

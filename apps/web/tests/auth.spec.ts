import { test, expect } from "@playwright/test";

test("protected screens and learning API reject anonymous or forged sessions", async ({
  page,
  context,
}) => {
  await page.goto("/plan");
  await expect(page).toHaveURL(/\/login\?next=%2Fplan$/);
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
  expect(
    (await context.request.get("/compass-api/demo/context")).status(),
  ).toBe(401);
  await page.getByRole("button", { name: "Fill demo account" }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding\?next=%2Fdashboard$/);
  await page
    .getByRole("link", { name: "Student — enter your study space" })
    .click();
  await expect(page).toHaveURL(/\/onboarding\/upload\?next=%2Fdashboard$/);
  await page
    .getByRole("link", { name: "I'll do this later", exact: true })
    .click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole("heading", { name: "Your learning, at a glance." }),
  ).toBeVisible();
  await context.addCookies([
    {
      name: "compass_session",
      value: "A".repeat(43),
      url: "http://127.0.0.1:" + new URL(page.url()).port,
    },
  ]);
  expect(
    (await context.request.get("/compass-api/demo/context")).status(),
  ).toBe(401);
});

test("demo login validates credentials, remembers the session and revokes it on logout", async ({
  page,
  context,
  baseURL,
  request,
}) => {
  await page.goto("/login?next=%2Fplan");
  await page.getByLabel("Username", { exact: true }).fill("demo");
  await page.getByLabel("Password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Incorrect username or password",
  );
  await expect(page.getByLabel("Username", { exact: true })).toHaveValue(
    "demo",
  );
  await page.getByRole("button", { name: "Fill demo account" }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding\?next=%2Fplan$/);
  await expect(page.getByRole("heading", { name: "I'm a…" })).toBeVisible();
  await page
    .getByRole("link", { name: "Student — enter your study space" })
    .click();
  await expect(page).toHaveURL(/\/onboarding\/upload\?next=%2Fplan$/);
  await page
    .getByRole("link", { name: "I'll do this later", exact: true })
    .click();
  await expect(page).toHaveURL(/\/plan$/);
  await expect(
    page.getByRole("heading", { name: "Your weekly plan." }),
  ).toBeVisible();
  const cookie = (await context.cookies()).find(
    (item) => item.name === "compass_session",
  )!;
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.sameSite).toBe("Lax");
  expect(cookie.expires).toBeGreaterThan(Date.now() / 1000 + 6 * 86400);
  expect(await page.evaluate(() => document.cookie)).not.toContain(
    "compass_session",
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your weekly plan." }),
  ).toBeVisible();
  await page.getByLabel("Settings", { exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await request.get("/compass-api/demo/context")).status()).toBe(401);
  const replay = await request.get(`${baseURL}/api/auth/session`, {
    headers: { Cookie: `compass_session=${cookie.value}` },
  });
  expect((await replay.json()).user).toBeNull();
});

test("registration checks matching passwords, creates a persistent account and prevents duplicate usernames", async ({
  page,
  request,
  baseURL,
}) => {
  const username = `test_${crypto.randomUUID().slice(0, 12)}`;
  await page.goto("/register");
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Display name").fill("Test student");
  await page.getByLabel("Password", { exact: true }).fill("test123");
  await page.getByLabel("Confirm password").fill("test456");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveText(
    "Passwords do not match.",
  );
  await page.getByLabel("Confirm password").fill("test123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding\?next=%2Flearn$/);
  await page
    .getByRole("link", { name: "Student — enter your study space" })
    .click();
  await expect(page).toHaveURL(/\/onboarding\/upload\?next=%2Flearn$/);
  await page
    .getByRole("link", { name: "I'll do this later", exact: true })
    .click();
  await expect(page).toHaveURL(/\/learn$/);
  await expect(
    page.getByRole("heading", { name: "What will you learn today?" }),
  ).toBeVisible();
  await expect(
    page.getByText("Hi Test student. Your materials, your pace."),
  ).toBeVisible();
  await page.getByLabel("Settings", { exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  const login = await request.post("/api/auth/login", {
    headers: { Origin: baseURL! },
    data: { username, password: "test123" },
  });
  expect(login.ok()).toBeTruthy();
  expect(await login.json()).toMatchObject({
    user: { username, name: "Test student" },
  });
  const duplicate = await request.post("/api/auth/register", {
    headers: { Origin: baseURL! },
    data: { username, name: "Test student", password: "test123" },
  });
  expect(duplicate.status()).toBe(409);
  expect((await duplicate.json()).error).toBe("username_taken");
});

test("auth mutations reject foreign origins, invalid inputs and repeated failed logins", async ({
  request,
  baseURL,
}) => {
  const data = { username: "demo", password: "haui123" };
  expect(
    (
      await request.post("/api/auth/login", {
        headers: { Origin: "https://untrusted.example" },
        data,
      })
    ).status(),
  ).toBe(403);
  const signedIn = await request.post("/api/auth/login", {
    headers: { Origin: baseURL! },
    data,
  });
  expect(signedIn.ok()).toBeTruthy();
  expect(
    (
      await request.post("/compass-api/demo/scenarios/select", {
        headers: { Origin: "https://untrusted.example" },
        data: { scenario_id: "normal" },
      })
    ).status(),
  ).toBe(403);
  expect((await request.post("/api/auth/login", { data })).status()).toBe(403);
  expect(
    (
      await request.post("/api/auth/register", {
        headers: { Origin: baseURL! },
        data: { username: "!", name: "X", password: "1" },
      })
    ).status(),
  ).toBe(400);
  const username = `unknown_${crypto.randomUUID().slice(0, 12)}`;
  for (let i = 0; i < 5; i++) {
    expect(
      (
        await request.post("/api/auth/login", {
          headers: { Origin: baseURL! },
          data: { username, password: "wrong123" },
        })
      ).status(),
    ).toBe(401);
  }
  expect(
    (
      await request.post("/api/auth/login", {
        headers: { Origin: baseURL! },
        data: { username, password: "wrong123" },
      })
    ).status(),
  ).toBe(429);
});

test("login ignores external return URLs and Vietnamese forms remain responsive", async ({
  page,
}) => {
  await page.goto("/login?next=https%3A%2F%2Funtrusted.example");
  await page.getByRole("radio", { name: "VI", exact: true }).click();
  await page.getByRole("button", { name: "Điền tài khoản demo" }).click();
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding\?next=%2Flearn$/);
  await expect(page.getByRole("heading", { name: "Tôi là…" })).toBeVisible();
  await page
    .getByRole("link", { name: "Sinh viên — vào không gian học tập" })
    .click();
  await expect(page).toHaveURL(/\/onboarding\/upload\?next=%2Flearn$/);
  await page
    .getByRole("link", { name: "Để sau, vào không gian học", exact: true })
    .click();
  await expect(page).toHaveURL(/\/learn$/);
  await page.getByLabel("Tuỳ chọn", { exact: true }).click();
  await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await page.getByRole("link", { name: "Đăng ký", exact: true }).click();
  await expect(page).toHaveURL(/\/register\?next=%2Flearn$/);
  await expect(page.getByLabel("Tên hiển thị")).toHaveCount(0);
  await page.getByLabel("Tên đăng nhập", { exact: true }).fill("thu_nghiem");
  await expect(page.getByLabel("Tên đăng nhập", { exact: true })).toHaveValue(
    "thu_nghiem",
  );
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await expect(page.getByLabel("Tên hiển thị")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("registration keeps the first step focused and preserves details when going back", async ({
  page,
  isMobile,
}) => {
  await page.goto("/register");
  await expect(page.locator("form input")).toHaveCount(1);
  const companion = page.getByRole("complementary", {
    name: "A companion for your study week",
  });
  if (isMobile || (await page.viewportSize())!.width < 980) {
    await expect(companion).toBeHidden();
  } else {
    await expect(companion).toBeVisible();
  }
  await expect(page.locator("body")).not.toContainText(
    /StudyFetch|Harvard|Yale|92%|Continue with Google/,
  );
  await page.getByLabel("Username", { exact: true }).fill("invalid name");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.locator("form input")).toHaveCount(1);
  expect(
    await page
      .getByLabel("Username", { exact: true })
      .evaluate((el: HTMLInputElement) => el.validity.patternMismatch),
  ).toBe(true);
  await page.getByLabel("Username", { exact: true }).fill("my_compass");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.locator("form input")).toHaveCount(4);
  await page.getByLabel("Display name").fill("My student");
  await page.getByLabel("Password", { exact: true }).fill("example123");
  await page
    .getByRole("button", { name: "Show password", exact: true })
    .click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "type",
    "text",
  );
  await page.getByRole("button", { name: "Go back", exact: true }).click();
  await expect(page.locator("form input")).toHaveCount(1);
  await expect(page.getByLabel("Username", { exact: true })).toHaveValue(
    "my_compass",
  );
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByLabel("Display name")).toHaveValue("My student");
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue(
    "example123",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

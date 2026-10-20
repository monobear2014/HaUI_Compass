import { test, expect } from "./fixtures";

test("the root URL opens the login page directly", async ({ page, context }) => {
  await context.clearCookies();
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Welcome back.",
  );
  await expect(
    page.getByRole("textbox", { name: "Username", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
});

test("Vietnamese preferences and student-first entry lead to the working workspace", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByRole("radio", { name: "VI", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Chào mừng bạn trở lại.",
  );
  await page.getByRole("switch", { name: "Switch to dark mode" }).click();
  await expect(page.locator("[data-theme=dark]").first()).toBeVisible();
  await page.screenshot({ path: info.outputPath("compass-dark-vi.png") });
  await page.goto("/demo");
  await expect(
    page.getByRole("heading", { name: "Bạn muốn bắt đầu từ đâu?" }),
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText(
    /Teacher|Admin|Quản trị viên/,
  );
  await page.screenshot({
    path: info.outputPath("student-demo-entry.png"),
    fullPage: true,
  });
  await page
    .getByRole("link", { name: /Việc hôm nay.*Bắt đầu tại đây/ })
    .click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(
    page.getByRole("heading", { name: "Tôi nên làm gì ngay bây giờ?" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("public entry pages keep HaUI identity and expose the demo authentication form", async ({
  page,
}) => {
  await page.goto("/demo/select-role");
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.locator("body")).not.toContainText(
    /Cursus|Teacher|Admin|Neural Forge/,
  );
  for (const route of [
    "/login",
    "/register",
    "/request-access",
    "/privacy",
    "/terms",
    "/forgot-password",
  ]) {
    await page.goto(route);
    await expect(
      page.getByRole("link", { name: "HaUI Compass — go to homepage" }),
    ).toBeVisible();
    await expect(page.locator("body")).not.toContainText(
      /Cursus|3-role|institutional access|Neural Forge/,
    );
    await expect(
      page.locator("input[type=password], input[type=email]"),
    ).toHaveCount(["/login", "/forgot-password"].includes(route) ? 1 : 0);
    if (route === "/register") {
      await expect(
        page.getByRole("button", { name: "Continue", exact: true }),
      ).toBeVisible();
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

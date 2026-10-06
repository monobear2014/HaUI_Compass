import { test, expect } from "./fixtures";

test("HaUI Compass landing uses its own identity and explains real student flows", async ({
  page,
}, info) => {
  const errors: string[] = [];
  const apiRequests: string[] = [];
  const referenceRequests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.url().includes("/compass-api/"))
      apiRequests.push(request.url());
    if (/cursus|vercel.app/.test(request.url()))
      referenceRequests.push(request.url());
  });
  await page.goto("/");
  await expect(page).toHaveTitle(/HaUI Compass/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Study with a plan.",
  );
  await expect(
    page.getByRole("link", { name: "HaUI Compass — go to homepage" }).first(),
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText(
    /Cursus|Neural Forge|SSA101|institutional access/i,
  );
  await expect(page.locator('img[src*="study-hero"]')).toBeVisible();
  await expect(page.locator("video")).toHaveCount(0);
  await expect(page.locator(".app-shell")).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("compass-hero.png") });
  await page.getByRole("tab", { name: /Document Q&A/ }).click();
  await page
    .locator("#product-canvas-panel")
    .getByText("Database assignments · Database Mini Project", { exact: true })
    .click();
  await expect(page.locator("#product-canvas-panel details")).toHaveAttribute(
    "open",
    "",
  );
  await expect(page.locator("#product-canvas-panel")).toContainText(
    "fictional demo material",
  );
  await page.getByRole("tab", { name: /Document Q&A/ }).press("ArrowUp");
  await expect(
    page.getByRole("tab", { name: /AI assignment breakdown/ }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("link", { name: "Open this screen" }),
  ).toHaveAttribute("href", "/academic");
  await page
    .getByRole("button", {
      name: "Do I need an account to try it?",
      exact: true,
    })
    .click();
  await expect(page.locator("#faq-panel-1")).toBeVisible();
  await expect(page.locator("#faq-panel-0")).toBeHidden();
  await page
    .getByRole("button", { name: "Open the HaUI Compass guide" })
    .click();
  await expect(
    page.getByRole("complementary", { name: "HaUI Compass guide" }),
  ).toContainText("not an AI conversation");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(apiRequests).toEqual([]);
  expect(referenceRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test("Vietnamese preferences and student-first entry lead to the working workspace", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByRole("radio", { name: "VI", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Học có kế hoạch.",
  );
  await page.getByRole("switch", { name: "Switch to dark mode" }).click();
  await expect(page.locator("[data-theme=dark]").first()).toBeVisible();
  await page.screenshot({ path: info.outputPath("compass-dark-vi.png") });
  await expect(
    page.getByRole("link", { name: "Mở việc hôm nay", exact: true }),
  ).toHaveAttribute("href", "/today");
  await page.goto("/demo");
  await expect(
    page.getByRole("heading", { name: "Bạn muốn bắt đầu từ đâu?" }),
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText(
    /Teacher|Admin|Giảng viên|Quản trị viên/,
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

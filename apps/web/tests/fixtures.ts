import { test as base, expect } from "@playwright/test";
export { expect };
export type { Page } from "@playwright/test";
import type { Page } from "@playwright/test";

export async function openPreferences(page: Page) {
  const settings = page.getByTestId("account-menu");
  const toggle = page.getByRole("button", {
    name: /Toggle navigation|Mở điều hướng/,
  });
  if (
    (await toggle.isVisible()) &&
    (await toggle.getAttribute("aria-expanded")) === "false"
  )
    await toggle.click();
  if ((await settings.getAttribute("open")) === null)
    await settings.locator("summary").first().click();
}

export async function openDemo(page: Page) {
  await openPreferences(page);
  const demo = page.getByTestId("demo-controls");
  if ((await demo.getAttribute("open")) === null)
    await demo.locator("summary").click();
}

export async function navigate(page: Page, path: string) {
  const settings = page.getByTestId("account-menu");
  if ((await settings.getAttribute("open")) !== null)
    await settings.locator("summary").first().click();
  const navigation = page.locator(
    'aside[aria-label="Main navigation"], aside[aria-label="Điều hướng chính"]',
  );
  if (!(await navigation.isVisible()))
    await page
      .getByRole("button", { name: /Toggle navigation|Mở điều hướng/ })
      .click();
  const link = navigation.locator(`a[href="${path}"]`);
  if (!(await link.isVisible()))
    await page.getByTestId("review-navigation").locator("summary").click();
  await link.click();
}

export const test = base.extend<{ authenticated: undefined }>({
  authenticated: [
    async ({ request, baseURL, context }, use) => {
      const response = await request.post("/api/auth/login", {
        headers: { Origin: baseURL! },
        data: { username: "demo", password: "haui123" },
      });
      expect(response.ok()).toBeTruthy();
      // Playwright's standalone request fixture has a separate cookie jar.
      await context.addCookies((await request.storageState()).cookies);
      await use(undefined);
    },
    { auto: true },
  ],
});

// Execution actions now live in ticket details on the Today screen.
export async function openExecution(
  page: Page,
  title?: string,
  outcome: "partial" | "completed" = "partial",
) {
  const toggle = page.getByRole("button", {
    name: /Toggle navigation|Mở điều hướng/,
  });
  if (
    (await toggle.isVisible()) &&
    (await toggle.getAttribute("aria-expanded")) === "true"
  )
    await toggle.click();
  const ticket = title
    ? page.getByRole("article", { name: title, exact: true })
    : page
        .getByRole("region", { name: "Choose more tasks", exact: true })
        .getByRole("article")
        .first();
  await ticket.getByRole("button").first().click();
  const details = page.getByRole("dialog");
  const pause = details.getByRole("button", { name: "Pause", exact: true });
  if (!(await pause.isVisible()))
    await details.getByRole("button", { name: "Start", exact: true }).click();
  await expect(pause).toBeEnabled();
  await details
    .getByRole("button", {
      name: outcome === "completed" ? "Complete" : "Pause",
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog").getByRole("spinbutton")).toBeVisible();
}

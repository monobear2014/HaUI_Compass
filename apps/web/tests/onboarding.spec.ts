import { test, expect } from "@playwright/test";

test("onboarding requires a session, preserves the intended screen and rejects external return paths", async ({
  page,
  context,
  baseURL,
}) => {
  await page.goto("/onboarding?next=%2Fplan");
  await expect(page).toHaveURL(/\/login\?next=%2Fplan$/);
  const response = await context.request.post("/api/auth/login", {
    headers: { Origin: baseURL! },
    data: { username: "demo", password: "haui123" },
  });
  expect(response.ok()).toBeTruthy();
  await page.goto("/onboarding?next=https%3A%2F%2Funtrusted.example");
  await expect(
    page.getByRole("link", { name: "Student — enter your study space" }),
  ).toHaveAttribute("href", "/learn");
  await page.getByRole("link", { name: "Back", exact: true }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Flearn$/);
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await page.goto("/onboarding?next=%2Fplan");
  await page
    .getByRole("link", { name: "Student — enter your study space" })
    .press("Enter");
  await expect(page).toHaveURL(/\/plan$/);
});

test("role selection exposes only supported student and authorized lecturer routes", async ({
  page,
  context,
  baseURL,
}, info) => {
  const response = await context.request.post("/api/auth/login", {
    headers: { Origin: baseURL! },
    data: { username: "demo", password: "haui123" },
  });
  expect(response.ok()).toBeTruthy();
  await page.goto("/onboarding");
  await expect(page.getByRole("heading", { name: "I'm a…" })).toBeVisible();
  const student = page.getByRole("link", {
    name: "Student — enter your study space",
  });
  const teacher = page.getByRole("link", {
    name: "Lecturer Authorized accounts",
    exact: true,
  });
  await expect(teacher).toHaveAttribute("href", "/login?next=%2Flecturer");
  await expect(page.getByRole("button", { name: /Coming soon/ })).toHaveCount(
    0,
  );
  await expect(student).toBeVisible();
  await expect(page.locator(".sidebar, .topbar")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath("compass-onboarding.png") });
  await page.getByRole("radio", { name: "VI", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tôi là…" })).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: "Giảng viên Tài khoản được cấp quyền",
      exact: true,
    }),
  ).toHaveAttribute("href", "/login?next=%2Flecturer");
  await page.getByRole("switch", { name: "Switch to dark mode" }).click();
  await expect(page.locator("main[data-theme=dark]")).toBeVisible();
  await page
    .getByRole("link", { name: "Sinh viên — vào không gian học tập" })
    .click();
  await expect(page).toHaveURL(/\/learn$/);
});

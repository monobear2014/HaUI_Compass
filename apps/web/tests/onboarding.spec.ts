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
  ).toHaveAttribute("href", "/onboarding/upload?next=%2Flearn");
  await page.getByRole("link", { name: "Back", exact: true }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Flearn$/);
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await page.goto("/onboarding?next=%2Fplan");
  await page
    .getByRole("link", { name: "Student — enter your study space" })
    .press("Enter");
  await expect(page).toHaveURL(/\/onboarding\/upload\?next=%2Fplan$/);
  await page
    .getByRole("link", { name: "I'll do this later", exact: true })
    .click();
  await expect(page).toHaveURL(/\/plan$/);
});

test("role selection uses a readable two-by-two layout without pretending unsupported roles work", async ({
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
  const teacher = page.getByRole("button", {
    name: "Teacher Coming soon",
    exact: true,
  });
  const professor = page.getByRole("button", {
    name: "Professor Coming soon",
    exact: true,
  });
  const parent = page.getByRole("button", {
    name: "Parent Coming soon",
    exact: true,
  });
  for (const role of [teacher, professor, parent])
    await expect(role).toBeDisabled();
  const a = (await student.boundingBox())!;
  const b = (await teacher.boundingBox())!;
  const c = (await professor.boundingBox())!;
  expect(Math.abs(a.y - b.y)).toBeLessThan(1);
  expect(b.x).toBeGreaterThan(a.x + a.width);
  expect(c.y).toBeGreaterThan(a.y + a.height);
  expect(Math.abs(a.x - c.x)).toBeLessThan(1);
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
    page.getByRole("button", { name: "Giảng viên Sắp có", exact: true }),
  ).toBeDisabled();
  await page.getByRole("switch", { name: "Switch to dark mode" }).click();
  await expect(page.locator("main[data-theme=dark]")).toBeVisible();
  await page
    .getByRole("link", { name: "Sinh viên — vào không gian học tập" })
    .click();
  await expect(page).toHaveURL(/\/onboarding\/upload\?next=%2Flearn$/);
  await page
    .getByRole("link", { name: "Để sau, vào không gian học", exact: true })
    .click();
  await expect(page).toHaveURL(/\/learn$/);
});

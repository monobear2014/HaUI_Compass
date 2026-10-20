import { expect, test } from "./fixtures";

test("real Markdown/PDF courseware can be read, paged and cited without mixing course content", async ({
  page,
}) => {
  await page.goto("/knowledge");
  await expect(page).toHaveURL(/\/learn\?assistant=1/);
  await page.getByRole("button", { name: "Materials", exact: true }).click();
  await page.getByLabel("Materials course", { exact: true }).selectOption("la");
  await page
    .getByText("Read public courseware · PDF / Markdown", { exact: true })
    .click();
  await page
    .getByLabel("Public material", { exact: true })
    .selectOption("d2l-linear-algebra.md");
  await expect(page.locator(".public-material-text")).toContainText(
    "dot product",
  );
  await expect(page.getByRole("article")).toContainText("CC BY-SA 4.0");
  await expect(
    page.getByRole("link", { name: "Open / download original", exact: true }),
  ).toHaveAttribute(
    "href",
    /raw\.githubusercontent\.com\/d2l-ai\/d2l-en\/[a-f0-9]{40}\//,
  );
  await page
    .getByLabel("Materials course", { exact: true })
    .selectOption("automation");
  await expect(page.locator(".public-material-text")).toHaveCount(0);
  await page
    .getByText("Read public courseware · PDF / Markdown", { exact: true })
    .click();
  await page
    .getByLabel("Public material", { exact: true })
    .selectOption("mit-pid.pdf");
  await expect(page.getByLabel("PDF page", { exact: true })).toHaveValue("1");
  await page.getByLabel("PDF page", { exact: true }).selectOption("2");
  await expect(
    page.getByRole("link", { name: "Open / download original", exact: true }),
  ).toHaveAttribute("href", /\.pdf#page=2$/);
  await expect(page.getByRole("article")).toContainText("Steven Hall");
  await expect(page.getByRole("article")).toContainText("CC BY-NC-SA 4.0");
  await page.getByRole("button", { name: "Chat", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Message Compass", exact: true })
    .fill("PID control gồm những thành phần nào?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const answer = page.getByRole("log");
  await answer
    .getByText(/^Sources ·/)
    .last()
    .click();
  await expect(
    answer.getByRole("link", { name: /MIT.*PID/ }).last(),
  ).toHaveAttribute("href", /\.pdf#page=\d+$/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("course links and catalog filtering keep original provenance", async ({
  page,
}) => {
  await page.goto("/knowledge?course=automation");
  await expect(page).toHaveURL(/\/learn\?assistant=1/);
  await page.getByRole("button", { name: "Materials", exact: true }).click();
  await expect(
    page.getByLabel("Materials course", { exact: true }),
  ).toHaveValue("automation");
  await page
    .getByText("Read public courseware · PDF / Markdown", { exact: true })
    .click();
  const search = page.getByLabel("Search the catalog", { exact: true });
  await search.fill("PID");
  await expect(page.getByRole("status")).toContainText(
    "1 / 2 matching materials",
  );
  await page
    .getByLabel("Public material", { exact: true })
    .selectOption("mit-pid.pdf");
  await expect(page.getByRole("article")).toContainText("Steven Hall");
  await search.fill("no-such-material");
  await expect(page.getByRole("status")).toContainText(
    "0 / 2 matching materials",
  );
  await expect(page.getByRole("article")).toContainText(
    "MIT 16.06 — PID Control",
  );
  await page.goto("/knowledge?course=unknown");
  await expect(page).toHaveURL(/\/learn\?assistant=1/);
  await page.getByRole("button", { name: "Materials", exact: true }).click();
  await expect(
    page.getByLabel("Materials course", { exact: true }),
  ).toHaveValue("ai");
});

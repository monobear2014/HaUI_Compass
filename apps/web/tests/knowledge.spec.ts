import { test, expect } from "./fixtures";

test("old Q&A routes resolve to the assistant instead of a duplicate question form", async ({
  page,
}) => {
  await page.goto("/knowledge?course=db");
  await expect(page).toHaveURL(/\/learn\?assistant=1&course=db/);
  const chat = page.getByRole("complementary", {
    name: "Compass chatbot",
    exact: true,
  });
  await expect(chat.locator("summary[title='Databases · demo']")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Ask documents", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "Message Compass", exact: true }),
  ).toHaveCount(1);
});

test("a tampered course cannot choose an unsupported assistant source", async ({
  page,
}) => {
  await page.goto("/knowledge?course=unknown");
  await expect(page).toHaveURL(/\/learn\?assistant=1$/);
  await expect(page.locator("summary[title='AI']")).toBeVisible();
});

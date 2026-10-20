import { test, expect } from "./fixtures";

for (const state of [
  "no-tasks",
  "completed",
  "submitted",
  "overdue",
] as const) {
  test(`deadline reminder matches authoritative submission state: ${state}`, async ({
    page,
  }) => {
    await page.route("**/compass-api/demo/context", async (route) => {
      const response = await route.fetch();
      const context = await response.json();
      const assignment = context.assignments[0];
      assignment.title = "Synthetic deadline reminder";
      assignment.deadline = new Date(
        Date.parse(context.now) + (state === "overdue" ? -3600000 : 3600000),
      ).toISOString();
      assignment.submitted_at = state === "submitted" ? context.now : null;
      context.assignments = [assignment];
      context.tasks =
        state === "no-tasks"
          ? []
          : context.tasks.map((task: object) => ({
              ...task,
              status: "completed",
            }));
      await route.fulfill({ response, json: context });
    });
    const loaded = page.waitForResponse("**/compass-api/demo/context");
    await page.goto("/today");
    await loaded;
    await expect(page.getByTestId("demo-clock")).toBeVisible();
    const reminder = page
      .locator(".weekly-alert.danger")
      .filter({ hasText: "Synthetic deadline reminder" });
    if (state === "submitted") {
      await expect(reminder).toHaveCount(0);
      await page.unrouteAll({ behavior: "wait" });
      return;
    }
    await expect(reminder).toBeVisible();
    if (state === "overdue")
      await expect(reminder).toContainText("Overdue, not submitted");
    await expect(
      reminder.getByRole("link", { name: "View assignment" }),
    ).toHaveAttribute("href", "/academic");
  });
}

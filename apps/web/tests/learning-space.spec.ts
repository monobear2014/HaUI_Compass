import { test, expect } from "@playwright/test";
import { SAMPLE_DOCUMENT } from "../src/lib/documents";

test.beforeEach(async ({ context, baseURL }) => {
  const response = await context.request.post("/api/auth/register", {
    headers: { Origin: baseURL! },
    data: {
      username: `space_${crypto.randomUUID().slice(0, 12)}`,
      name: "Learning student",
      password: "test123",
    },
  });
  expect(response.status()).toBe(201);
});

async function upload(
  context: import("@playwright/test").BrowserContext,
  baseURL: string,
  name = SAMPLE_DOCUMENT.name,
  content = SAMPLE_DOCUMENT.content,
) {
  const result = await context.request.post("/api/documents", {
    headers: { Origin: baseURL },
    multipart: {
      files: { name, mimeType: "text/plain", buffer: Buffer.from(content) },
    },
  });
  expect(result.status()).toBe(201);
  return (await result.json()).documents[0];
}

test("upload → ready → study set → reader → study set → library stays in one app", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/onboarding/upload?next=%2Fdashboard");
  await page.getByRole("button", { name: "Try a sample document" }).click();
  await page.getByRole("button", { name: "Upload & continue" }).click();
  await expect(
    page.getByRole("heading", { name: "Let's start learning!" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL(/\/study-set\/[a-f0-9-]{36}$/);
  const setUrl = page.url();
  await expect(
    page.getByRole("heading", { name: "nhap-mon-ai.md", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("group", { name: "Study mode" })).toBeVisible();
  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.locator(".sidebar, .main-shell, .topbar")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("new-study-set.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: "Read original material" }).click();
  await expect(page).toHaveURL(/\/documents\/[a-f0-9-]{36}$/);
  await expect(page.locator(".material-reader")).toContainText(
    "Không dùng tập kiểm tra",
  );
  await page.getByRole("link", { name: "Back to study set" }).click();
  await expect(page).toHaveURL(setUrl);
  await page.getByRole("link", { name: "All study sets" }).click();
  await expect(page).toHaveURL(/\/learn$/);
  await expect(
    page.getByRole("heading", { name: "Your study sets" }),
  ).toBeVisible();
  await page
    .getByRole("searchbox", { name: "Search materials" })
    .fill("not-a-file");
  await expect(page.getByRole("status")).toHaveText(
    "No matching materials. Try another name.",
  );
  await page
    .getByRole("searchbox", { name: "Search materials" })
    .fill("nhap-mon");
  await expect(
    page.getByRole("heading", { name: "nhap-mon-ai.md", exact: true }).last(),
  ).toBeVisible();
  if (info.project.name === "mobile")
    await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByRole("link", { name: "HaUI Compass", exact: true }).click();
  await expect(page).toHaveURL(/\/learn$/);
  await page.screenshot({
    path: info.outputPath("new-learning-home.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("progress persists; failed saving does not skip the topic; Markdown excerpts stop at the next heading", async ({
  page,
  context,
  baseURL,
}) => {
  const doc = await upload(
    context,
    baseURL!,
    "source.md",
    "# First\nFirst body.\n\n## Second\nSecond body.",
  );
  await page.goto(`/study-set/${doc.id}`);
  await expect(page.locator("pre")).toHaveText("First body.");
  const modes = page.getByRole("group", { name: "Study mode" });
  await modes.getByRole("button", { name: /^Flashcards/ }).click();
  await page.getByRole("button", { name: "Flip card · reveal notes" }).click();
  await page.route("**/progress", (route) =>
    route.fulfill({ status: 503, body: "{}" }),
  );
  await page.getByRole("button", { name: "I remembered" }).click();
  await expect(page.locator("main").getByRole("alert")).toBeVisible();
  await expect(page.getByText("Topic 1 of 2", { exact: true })).toBeVisible();
  await page.unroute("**/progress");
  await page.getByRole("button", { name: "I remembered" }).click();
  await expect(page.getByText("Topic 2 of 2", { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("progressbar", { name: "Topics mastered" }),
  ).toHaveAttribute("aria-valuenow", "50");
  await page.getByRole("link", { name: "All study sets" }).click();
  await expect(page.getByText("50%", { exact: true })).toBeVisible();
});

test("plain text is one topic and documents remain available when the demo planning API is down", async ({
  page,
  context,
  baseURL,
}) => {
  const doc = await upload(
    context,
    baseURL!,
    "notes.txt",
    "# This is plain text\n## Still plain\nA source.",
  );
  await page.route("**/compass-api/**", (route) =>
    route.fulfill({ status: 503, body: "{}" }),
  );
  await page.goto("/learn");
  await expect(
    page.getByRole("heading", { name: "Your study sets" }),
  ).toBeVisible();
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  await page.goto(`/study-set/${doc.id}`);
  await expect(page.locator("pre")).toContainText("# This is plain text");
  await expect(page.getByText("Topic 1 of 1", { exact: true })).toBeVisible();
});

test("all functional pages share the new bright frame with no horizontal overflow", async ({
  page,
}, info) => {
  for (const path of [
    "/learn",
    "/today",
    "/plan",
    "/academic",
    "/knowledge",
    "/dashboard",
    "/reflect",
    "/history",
  ]) {
    await page.goto(path);
    await expect(page.locator("main h1")).toBeVisible();
    await expect(page.locator(".sidebar, .main-shell, .topbar")).toHaveCount(0);
    expect(
      await page
        .locator("main h1")
        .evaluate((el) => getComputedStyle(el).fontFamily),
    ).toContain("CompassBitter");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`${path.slice(1)}-consistent.png`),
      fullPage: true,
    });
  }
});

import { test, expect } from "@playwright/test";
import { MAX_DOCUMENT_BYTES } from "../src/lib/documents";

test.beforeEach(async ({ context, baseURL }) => {
  const response = await context.request.post("/api/auth/register", {
    headers: { Origin: baseURL! },
    data: {
      username: `docs_${crypto.randomUUID().slice(0, 12)}`,
      name: "Document test student",
      password: "test123",
    },
  });
  expect(response.status()).toBe(201);
});

test("sample upload creates the three-panel ready page, survives reload and opens real content", async ({
  page,
  context,
}, info) => {
  await page.goto("/onboarding/upload?next=%2Fdashboard");
  await expect(
    page.getByRole("heading", { name: "Start with your study material." }),
  ).toBeVisible();
  await expect(page.locator(".sidebar, .topbar")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "Upload & continue" }),
  ).toBeDisabled();
  await page.screenshot({ path: info.outputPath("document-upload.png") });
  await page.getByRole("button", { name: "Try a sample document" }).click();
  await page.getByRole("button", { name: "Try a sample document" }).click();
  await expect(
    page.getByRole("list", { name: "Selected files" }).locator("li"),
  ).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Upload & continue" }).click();
  await expect(page).toHaveURL(
    /\/onboarding\/ready\?next=%2Fdashboard&ids=[a-f0-9-]+$/,
  );
  const readyUrl = page.url();
  await expect(
    page.getByRole("heading", { name: "Let's start learning!" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "nhap-mon-ai.md", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "02 Học có giám sát" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Plan my week", exact: true }),
  ).toHaveAttribute("href", "/plan");
  await expect(
    page.getByRole("link", { name: "Flashcards", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Recall quiz", exact: true }),
  ).toBeVisible();
  const panels = page.locator("main section");
  await expect(panels).toHaveCount(3);
  const boxes = await panels.evaluateAll((elements) =>
    elements.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width };
    }),
  );
  if ((await page.viewportSize())!.width <= 850) {
    expect(boxes[1].y).toBeGreaterThan(boxes[0].y);
    expect(boxes[1].x).toBe(boxes[0].x);
  } else {
    expect(boxes[1].y).toBe(boxes[0].y);
    expect(boxes[1].x).toBeGreaterThan(boxes[0].x + boxes[0].width);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("document-ready.png"),
    fullPage: true,
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Let's start learning!" }),
  ).toBeVisible();
  await page.getByRole("radio", { name: "VI", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Cùng bắt đầu học nhé!" }),
  ).toBeVisible();
  await page.getByRole("switch", { name: "Switch to dark mode" }).click();
  await expect(page.locator("main[data-theme=dark]")).toBeVisible();
  await page.getByRole("link", { name: "Đọc tài liệu", exact: true }).click();
  await expect(page).toHaveURL(/\/documents\/[a-f0-9-]{36}$/);
  await expect(page.locator(".material-reader")).toContainText(
    "Không dùng tập kiểm tra để chọn siêu tham số.",
  );
  const files = await context.request.get("/api/documents");
  expect((await files.json()).documents).toHaveLength(1);
  await page
    .getByRole("link", { name: "Quay lại bộ học tập", exact: true })
    .click();
  await expect(page).toHaveURL(/\/study-set\/[a-f0-9-]{36}$/);
  await page
    .getByRole("link", { name: "Tất cả bộ học tập", exact: true })
    .click();
  await expect(page).toHaveURL(/\/learn$/);
  await expect(
    page.getByRole("heading", { name: "Bộ học tập của bạn", exact: true }),
  ).toBeVisible();
  await page.goto(readyUrl);
  await page.getByRole("link", { name: "Tiếp tục", exact: true }).click();
  await expect(page).toHaveURL(/\/study-set\/[a-f0-9-]{36}$/);
});

test("selection validates formats and limits, and a failed upload keeps files for retry", async ({
  page,
}, info) => {
  await page.goto("/onboarding/upload?next=%2Fplan");
  const input = page.locator('input[type="file"]');
  const alert = page.locator("main").getByRole("alert");
  await input.setInputFiles({
    name: "slides.exe",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("not supported"),
  });
  await expect(alert).toContainText("Only PDF, TXT and Markdown");
  await input.setInputFiles({
    name: "large.txt",
    mimeType: "text/plain",
    buffer: Buffer.alloc(MAX_DOCUMENT_BYTES + 1, "x"),
  });
  await expect(alert).toContainText("no larger than 5 MB");
  await input.setInputFiles(
    Array.from({ length: 4 }, (_, i) => ({
      name: `note-${i}.txt`,
      mimeType: "text/plain",
      buffer: Buffer.from(`Note ${i}`),
    })),
  );
  await expect(alert).toContainText("Choose 1–3 files");
  const file = {
    name: "lecture.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(
      "# Lecture\n\n## Retrieval\nSearch source material before answering.",
    ),
  };
  await input.setInputFiles(file);
  await page
    .getByRole("button", { name: "Remove lecture.md", exact: true })
    .click();
  await expect(page.getByRole("list", { name: "Selected files" })).toHaveCount(
    0,
  );
  await input.setInputFiles(file);
  await page.route("**/api/documents", async (route) => {
    await route.fulfill({ status: 503, json: { error: "unavailable" } });
  });
  await page.getByRole("button", { name: "Upload & continue" }).click();
  await expect(alert).toContainText("Could not save your files");
  await expect(
    page.getByRole("list", { name: "Selected files" }),
  ).toContainText("lecture.md");
  await expect(
    page.getByRole("button", { name: "Upload & continue" }),
  ).toBeEnabled();
  await page.screenshot({ path: info.outputPath("upload-error.png") });
  await page.unroute("**/api/documents");
  await page.getByRole("button", { name: "Upload & continue" }).click();
  await expect(
    page.getByRole("heading", { name: "Let's start learning!" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL(/\/study-set\/[a-f0-9-]{36}$/);
});

test("upload API enforces owner isolation, same-origin writes, server validation and atomic batches", async ({
  context,
  request,
  page,
  baseURL,
}) => {
  const good = {
    name: "safe.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(
      `# ${crypto.randomUUID()}\n\n## Source\n<script>alert('xss')</script>`,
    ),
  };
  const post = (file = good, origin = baseURL!) =>
    context.request.post("/api/documents", {
      headers: { Origin: origin },
      multipart: { files: file },
    });
  expect((await request.get("/api/documents")).status()).toBe(401);
  expect(
    (
      await request.post("/api/documents", {
        headers: { Origin: baseURL! },
        multipart: { files: good },
      })
    ).status(),
  ).toBe(401);
  expect((await post(good, "https://untrusted.example")).status()).toBe(403);
  expect((await post({ ...good, name: "invalid.pdf" })).status()).toBe(400);
  expect((await post({ ...good, name: "file.html" })).status()).toBe(400);
  expect(
    (
      await post({
        ...good,
        name: "binary.txt",
        buffer: Buffer.from([0xff, 0x00]),
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await post({ ...good, name: "empty.txt", buffer: Buffer.alloc(0) })
    ).status(),
  ).toBe(413);
  expect(
    (
      await post({
        ...good,
        name: "large.txt",
        buffer: Buffer.alloc(MAX_DOCUMENT_BYTES + 1, "x"),
      })
    ).status(),
  ).toBe(413);
  const batch = new FormData();
  batch.append("files", new File(["valid content"], "first.txt"));
  batch.append("files", new File(["invalid content"], "second.exe"));
  expect(
    (
      await context.request.post("/api/documents", {
        headers: { Origin: baseURL! },
        multipart: batch,
      })
    ).status(),
  ).toBe(400);
  expect(
    (await (await context.request.get("/api/documents")).json()).documents,
  ).toHaveLength(0);
  const response = await post();
  expect(response.status()).toBe(201);
  const doc = (await response.json()).documents[0];
  expect(doc).not.toHaveProperty("content");
  const duplicate = await post();
  expect((await duplicate.json()).documents[0].id).toBe(doc.id);
  const outlined = await post({
    ...good,
    name: "outline.md",
    buffer: Buffer.from(
      "# Outline ###\n\n```python\n# Not a study section\n```\n\n## Retrieval\nRead the source.",
    ),
  });
  expect((await outlined.json()).documents[0].headings).toEqual([
    "Outline",
    "Retrieval",
  ]);
  const plain = await post({
    ...good,
    name: "plain.txt",
    buffer: Buffer.from(
      "# Plain text, not Markdown\nDifferent source content.",
    ),
  });
  expect((await plain.json()).documents[0].headings).toEqual([]);
  expect(
    (
      await post({
        ...good,
        name: "masked-header.pdf",
        buffer: Buffer.from([0xa5, 0x50, 0x44, 0x46, 0x2d]),
      })
    ).status(),
  ).toBe(400);
  expect((await request.get(`/api/documents/${doc.id}`)).status()).toBe(401);
  await page.goto(`/documents/${doc.id}`);
  await expect(page.locator(".material-reader")).toContainText(
    "<script>alert('xss')</script>",
  );
  await expect(page.locator("article script")).toHaveCount(0);
  const another = await request.post("/api/auth/register", {
    headers: { Origin: baseURL! },
    data: {
      username: `other_${crypto.randomUUID().slice(0, 10)}`,
      name: "Another student",
      password: "test123",
    },
  });
  expect(another.status()).toBe(201);
  expect((await request.get(`/api/documents/${doc.id}`)).status()).toBe(404);
  expect(
    (await (await request.get("/api/documents")).json()).documents,
  ).toHaveLength(0);
  await context.clearCookies();
  await context.addCookies((await request.storageState()).cookies);
  const result = await page.goto(`/documents/${doc.id}`);
  expect(result?.status()).toBe(404);
  await page.goto(`/onboarding/ready?next=%2Fplan&ids=${doc.id}`);
  await expect(page).toHaveURL(/\/onboarding\/upload\?next=%2Fplan$/);
});

test("upload routes protect sessions, sanitize destinations and do not invent a successful empty result", async ({
  page,
  context,
}) => {
  await page.goto("/onboarding/ready?next=https%3A%2F%2Funtrusted.example");
  await expect(page).toHaveURL(/\/onboarding\/upload\?next=%2Flearn$/);
  await expect(
    page.getByRole("link", { name: "I'll do this later" }),
  ).toHaveAttribute("href", "/learn");
  await context.clearCookies();
  await page.goto("/onboarding/upload?next=%2Fplan");
  await expect(page).toHaveURL(/\/login\?next=%2Fplan$/);
  await page.goto("/onboarding/ready?next=%2Fdashboard&ids=anything");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
});

// A real one-page PDF assembled in memory for preview testing; no personal source file.
function previewPdf() {
  const stream = "BT /F1 22 Tf 50 740 Td (HaUI Compass upload preview) Tj ET\n";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}endstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const start = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(pdf);
}

test("PDF uploads reopen byte-for-byte without claiming PDF extraction or AI planning", async ({
  page,
  context,
  baseURL,
}) => {
  const bytes = previewPdf();
  const response = await context.request.post("/api/documents", {
    headers: { Origin: baseURL! },
    multipart: {
      files: {
        name: "compass-preview.pdf",
        mimeType: "application/pdf",
        buffer: bytes,
      },
    },
  });
  expect(response.status()).toBe(201);
  const doc = (await response.json()).documents[0];
  expect(doc.kind).toBe("pdf");
  expect(doc.headings).toEqual([]);
  const original = await context.request.get(`/api/documents/${doc.id}`);
  expect(original.headers()["content-type"]).toBe("application/pdf");
  expect(original.headers()["cache-control"]).toBe("no-store");
  expect(original.headers()["x-content-type-options"]).toBe("nosniff");
  expect(await original.body()).toEqual(bytes);
  await page.goto(`/onboarding/ready?next=%2Fknowledge&ids=${doc.id}`);
  await expect(page.locator("main")).toContainText(
    "PDF content analysis and AI planning are not connected yet",
  );
  await page.getByRole("link", { name: "Read", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "compass-preview.pdf", exact: true }),
  ).toBeVisible();
  await expect(page.locator("iframe")).toHaveAttribute(
    "src",
    `/api/documents/${doc.id}`,
  );
  await expect(
    page.getByRole("link", { name: "Open original file" }),
  ).toHaveAttribute("href", `/api/documents/${doc.id}`);
});

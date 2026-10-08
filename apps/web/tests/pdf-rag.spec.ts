import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { chunkPages } from "../src/lib/document-chunking.cjs";
import {
  ingestDocument,
  migrateCompassChat,
} from "../src/lib/migrations/001-compass-chat";

test.beforeEach(async ({ context, baseURL }) => {
  const response = await context.request.post("/api/auth/register", {
    headers: { Origin: baseURL! },
    data: {
      username: `pdf_${crypto.randomUUID().slice(0, 12)}`,
      name: "PDF student",
      password: "test123",
    },
  });
  expect(response.status()).toBe(201);
});

test("page chunking skips blanks without renumbering and preserves offsets", () => {
  const pages = [
    { page_number: 1, text: "" },
    { page_number: 2, text: "Gradient descent. ".repeat(300) },
    { page_number: 3, text: "MRR" },
  ];
  const chunks = chunkPages(pages);
  expect(chunks.length).toBeGreaterThan(2);
  chunks.forEach((chunk, index) => {
    expect(chunk.chunk_index).toBe(index);
    expect(
      pages[chunk.page_number - 1].text.slice(
        chunk.start_offset,
        chunk.end_offset,
      ),
    ).toBe(chunk.content);
  });
  expect(chunks[0].page_number).toBe(2);
  expect(chunks.at(-1)?.page_number).toBe(3);
});

test("legacy unsupported PDF reingests once and keeps citation IDs on retry", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE documents (id TEXT PRIMARY KEY, name TEXT, kind TEXT, content BLOB)",
  );
  db.prepare("INSERT INTO documents VALUES (?, ?, ?, ?)").run(
    "pdf",
    "legacy.pdf",
    "pdf",
    Buffer.from("%PDF"),
  );
  migrateCompassChat(db);
  expect(
    db.prepare("SELECT ingestion_status FROM documents").get()
      ?.ingestion_status,
  ).toBe("unsupported");
  const document = {
    id: "pdf",
    name: "legacy.pdf",
    kind: "pdf",
    content: Buffer.from("%PDF"),
    pages: [{ page_number: 2, text: "Gradient descent" }],
  };
  ingestDocument(db, document);
  const before = db
    .prepare("SELECT id, page_number FROM document_chunks")
    .all();
  expect(before[0].page_number).toBe(2);
  migrateCompassChat(db);
  ingestDocument(db, document);
  expect(
    db.prepare("SELECT id, page_number FROM document_chunks").all(),
  ).toEqual(before);
  db.close();
});

test("real PDF ingestion, page citation navigation, original bytes, dedup and owner isolation", async ({
  page,
  context,
  browser,
  baseURL,
}) => {
  const bytes = readFileSync("../../evals/rag/fixtures/ml-pages.pdf");
  const upload = () =>
    context.request.post("/api/documents", {
      headers: { Origin: baseURL! },
      multipart: {
        files: {
          name: "ml-pages.pdf",
          mimeType: "application/pdf",
          buffer: bytes,
        },
      },
    });
  const response = await upload();
  expect(response.status()).toBe(201);
  const document = (await response.json()).documents[0];
  expect(document.ingestionStatus).toBe("ready");
  expect((await (await upload()).json()).documents[0].id).toBe(document.id);
  expect(
    await (await context.request.get(`/api/documents/${document.id}`)).body(),
  ).toEqual(bytes);
  const session = (
    await (
      await context.request.post(
        `/api/study-sets/${document.id}/chat/sessions`,
        { headers: { Origin: baseURL! }, data: {} },
      )
    ).json()
  ).session;
  const answer = await context.request.post(
    `/api/chat/sessions/${session.id}/messages`,
    {
      headers: { Origin: baseURL! },
      data: {
        message: "Gradient descent learning rate là gì?",
        request_id: crypto.randomUUID(),
        active_document_id: document.id,
      },
    },
  );
  expect(answer.status()).toBe(201);
  const messages = (await answer.json()).messages;
  const citation = messages.at(-1).citations[0];
  expect(citation.document_id).toBe(document.id);
  expect(citation.page_number).toBe(2);
  const source = await context.request.get(
    `/api/documents/${document.id}/chunks/${citation.chunk_id}`,
  );
  expect((await source.json()).chunk.page_number).toBe(2);
  const other = await browser.newContext({ baseURL });
  await other.request.post("/api/auth/register", {
    headers: { Origin: baseURL! },
    data: {
      username: `other_${crypto.randomUUID().slice(0, 12)}`,
      name: "Other",
      password: "test123",
    },
  });
  for (const path of [
    `/api/documents/${document.id}`,
    `/api/documents/${document.id}/chunks/${citation.chunk_id}`,
    `/api/chat/sessions/${session.id}/messages`,
  ])
    expect((await other.request.get(path)).status()).toBe(404);
  await other.close();
  await page.goto(`/study-set/${document.id}?session=${session.id}`);
  if ((page.viewportSize()?.width ?? 1280) < 600)
    await page.getByRole("button", { name: "✦ Hỏi trợ lý" }).click();
  await page
    .getByRole("button", { name: /\[1\] ml-pages.pdf · Trang 2/ })
    .filter({ visible: true })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/documents/${document.id}\\?page=2$`),
  );
  await expect(page.locator("iframe")).toHaveAttribute(
    "src",
    `/api/documents/${document.id}#page=2`,
  );
});

test("corrupt PDFs reject and valid empty/image PDFs remain unsupported", async ({
  context,
  baseURL,
}) => {
  for (const [name, bytes, status] of [
    ["corrupt.pdf", Buffer.from("%PDF-1.4\ncorrupt"), 400],
    [
      "image-only.pdf",
      readFileSync("../../evals/rag/fixtures/image-only.pdf"),
      201,
    ],
    ["empty.pdf", readFileSync("../../evals/rag/fixtures/empty.pdf"), 201],
  ] as const) {
    const response = await context.request.post("/api/documents", {
      headers: { Origin: baseURL! },
      multipart: {
        files: { name, mimeType: "application/pdf", buffer: bytes },
      },
    });
    expect(response.status()).toBe(status);
    if (status === 201)
      expect((await response.json()).documents[0].ingestionStatus).toBe(
        "unsupported",
      );
  }
});

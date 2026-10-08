import { test, expect } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { chunkText } from "../src/lib/document-chunks";
import { migrateCompassChat } from "../src/lib/migrations/001-compass-chat";

const source =
  "# Softmax\nSoftmax converts logits into a probability distribution. It uses exponential to keep values positive and normalizes by their sum.\n\n## Cross entropy\nCross entropy compares predicted probabilities to true labels.";
test.beforeEach(async ({ context, baseURL }) => {
  const response = await context.request.post("/api/auth/register", {
    headers: { Origin: baseURL! },
    data: {
      username: `chat_${crypto.randomUUID().slice(0, 12)}`,
      name: "Chat student",
      password: "test123",
    },
  });
  expect(response.status()).toBe(201);
});
async function upload(
  context: import("@playwright/test").BrowserContext,
  baseURL: string,
  name = "lecture.md",
  content: string | Buffer = source,
) {
  const result = await context.request.post("/api/documents", {
    headers: { Origin: baseURL },
    multipart: {
      files: {
        name,
        mimeType: "text/plain",
        buffer: typeof content === "string" ? Buffer.from(content) : content,
      },
    },
  });
  expect(result.status()).toBe(201);
  return (await result.json()).documents[0];
}
async function session(
  context: import("@playwright/test").BrowserContext,
  baseURL: string,
  id: string,
) {
  const result = await context.request.post(
    `/api/study-sets/${id}/chat/sessions`,
    { headers: { Origin: baseURL }, data: {} },
  );
  expect(result.status()).toBe(201);
  return (await result.json()).session;
}
async function send(
  context: import("@playwright/test").BrowserContext,
  baseURL: string,
  id: string,
  documentId: string,
  message: string,
  requestId = crypto.randomUUID(),
) {
  return context.request.post(`/api/chat/sessions/${id}/messages`, {
    headers: { Origin: baseURL },
    data: { message, active_document_id: documentId, request_id: requestId },
  });
}
async function panel(page: import("@playwright/test").Page, mobile: boolean) {
  if (mobile) {
    await page.getByRole("button", { name: "✦ Hỏi trợ lý" }).click();
    return page
      .locator("dialog")
      .getByRole("region", { name: "Trợ lý Compass", exact: true });
  }
  return page
    .getByRole("region", { name: "Trợ lý Compass", exact: true })
    .filter({ visible: true });
}

test("chunking preserves order, heading and exact offsets; migration backfills once", () => {
  const text = `${source}\n${"Softmax uses exponential. ".repeat(400)}`;
  const chunks = chunkText(text, true);
  expect(chunks.length).toBeGreaterThan(2);
  expect(chunks[0].heading).toBe("Softmax");
  chunks.forEach((chunk, index) => {
    expect(chunk.chunk_index).toBe(index);
    expect(text.slice(chunk.start_offset, chunk.end_offset)).toBe(
      chunk.content,
    );
    if (index)
      expect(chunk.start_offset).toBeGreaterThan(
        chunks[index - 1].start_offset,
      );
    expect(chunk.content.length).toBeLessThanOrEqual(3000);
  });
  expect(
    chunkText("```md\n# Injection heading\n```\n## Actual\nbody", true)[0]
      .heading,
  ).toBe("Actual");
  expect(chunkText("# Plain TXT", false)[0].heading).toBeNull();
  expect(() => chunkText("   ", false)).toThrow("empty_document");
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE documents (id TEXT PRIMARY KEY, name TEXT, kind TEXT, content BLOB)",
  );
  db.prepare("INSERT INTO documents VALUES (?, ?, ?, ?)").run(
    "old",
    "old.md",
    "text",
    Buffer.from(text),
  );
  db.prepare("INSERT INTO documents VALUES (?, ?, ?, ?)").run(
    "bad",
    "bad.txt",
    "text",
    Buffer.from([0xff]),
  );
  migrateCompassChat(db);
  migrateCompassChat(db);
  expect(
    Buffer.from(
      db.prepare("SELECT content FROM documents WHERE id = 'old'").get()
        ?.content as Uint8Array,
    ).toString("utf8"),
  ).toBe(text);
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM document_chunks WHERE document_id = 'old'",
      )
      .get()?.n,
  ).toBe(chunks.length);
  expect(
    db.prepare("SELECT ingestion_status FROM documents WHERE id = 'bad'").get()
      ?.ingestion_status,
  ).toBe("failed");
  expect(
    db.prepare("SELECT COUNT(*) AS n FROM document_schema_migrations").get()?.n,
  ).toBe(4);
  db.close();
});

test("real routes persist answers/citations and follow-up history; duplicate retry is idempotent", async ({
  context,
  baseURL,
}) => {
  const doc = await upload(context, baseURL!);
  expect(doc.ingestionStatus).toBe("ready");
  const chat = await session(context, baseURL!, doc.id);
  const requestId = crypto.randomUUID();
  const response = await send(
    context,
    baseURL!,
    chat.id,
    doc.id,
    "Softmax được giải thích như thế nào trong tài liệu?",
    requestId,
  );
  expect(response.status()).toBe(201);
  const answer = await response.json();
  expect(answer.messages.map((row: { role: string }) => row.role)).toEqual([
    "user",
    "assistant",
  ]);
  expect(answer.citations[0]).toMatchObject({
    document_id: doc.id,
    filename: "lecture.md",
    heading: "Softmax",
    index: 1,
  });
  const chunk = await context.request.get(
    `/api/documents/${doc.id}/chunks/${answer.citations[0].chunk_id}`,
  );
  expect((await chunk.json()).chunk.content).toBe(source);
  const duplicate = await send(
    context,
    baseURL!,
    chat.id,
    doc.id,
    "Softmax được giải thích như thế nào trong tài liệu?",
    requestId,
  );
  expect((await duplicate.json()).messages).toHaveLength(2);
  const next = await send(
    context,
    baseURL!,
    chat.id,
    doc.id,
    "Tại sao nó dùng exponential?",
  );
  expect((await next.json()).message.content).toContain("Hỏi tiếp về softmax");
  const restored = await context.request.get(
    `/api/chat/sessions/${chat.id}/messages`,
  );
  expect((await restored.json()).messages).toHaveLength(4);
  const second = await session(context, baseURL!, doc.id);
  expect(second.id).not.toBe(chat.id);
  expect(
    (
      await (
        await context.request.get(`/api/study-sets/${doc.id}/chat/sessions`)
      ).json()
    ).sessions,
  ).toHaveLength(2);
});

test("cross-user and cross-study-set access fail before storing messages; current document is the only evidence", async ({
  context,
  request,
  baseURL,
}) => {
  const doc = await upload(context, baseURL!);
  const otherDoc = await upload(
    context,
    baseURL!,
    "private.txt",
    "Unicornunique is a secret from the other Study Set.",
  );
  const chat = await session(context, baseURL!, doc.id);
  const wrongSet = await send(
    context,
    baseURL!,
    chat.id,
    otherDoc.id,
    "Unicornunique là gì?",
  );
  expect(wrongSet.status()).toBe(404);
  expect(
    (
      await (
        await context.request.get(`/api/chat/sessions/${chat.id}/messages`)
      ).json()
    ).messages,
  ).toHaveLength(0);
  const noEvidence = await send(
    context,
    baseURL!,
    chat.id,
    doc.id,
    "Unicornunique là gì?",
  );
  const body = await noEvidence.json();
  expect(body.message.status).toBe("abstained");
  expect(body.citations).toEqual([]);
  expect(body.message.content).toContain("chưa tìm thấy đủ thông tin");
  const foreign = await request.post("/api/auth/register", {
    headers: { Origin: baseURL! },
    data: {
      username: `foreign_${crypto.randomUUID().slice(0, 10)}`,
      name: "Foreign student",
      password: "test123",
    },
  });
  expect(foreign.status()).toBe(201);
  for (const path of [
    `/api/chat/sessions/${chat.id}/messages`,
    `/api/study-sets/${doc.id}/chat/sessions`,
    `/api/documents/${doc.id}`,
  ]) {
    const result = await request.get(path);
    expect(result.status()).toBe(404);
    expect(await result.text()).not.toContain("lecture.md");
  }
  expect(
    (
      await request.post(`/api/chat/sessions/${chat.id}/messages`, {
        headers: { Origin: baseURL! },
        data: {
          message: "Softmax là gì?",
          active_document_id: doc.id,
          request_id: crypto.randomUUID(),
        },
      })
    ).status(),
  ).toBe(404);
  const ownForeignDoc = await request.post("/api/documents", {
    headers: { Origin: baseURL! },
    multipart: {
      files: {
        name: "foreign.md",
        mimeType: "text/plain",
        buffer: Buffer.from("# Secret\nForeign source"),
      },
    },
  });
  const foreignId = (await ownForeignDoc.json()).documents[0].id;
  expect(
    (
      await send(context, baseURL!, chat.id, foreignId, "Secret là gì?")
    ).status(),
  ).toBe(404);
  expect(
    (
      await request.post(`/api/study-sets/${doc.id}/chat/sessions`, {
        headers: { Origin: baseURL! },
        data: {},
      })
    ).status(),
  ).toBe(404);
});

test("TXT and .markdown ingestion, unsupported files and no-origin mutations are handled", async ({
  context,
  baseURL,
}) => {
  for (const name of ["lecture.txt", "lecture.markdown"]) {
    const doc = await upload(context, baseURL!, name, `${source}\n${name}`);
    expect(doc.ingestionStatus).toBe("ready");
    const chat = await session(context, baseURL!, doc.id);
    expect(
      (
        await send(context, baseURL!, chat.id, doc.id, "Softmax là gì?")
      ).status(),
    ).toBe(201);
    expect(
      (
        await context.request.post(`/api/study-sets/${doc.id}/chat/sessions`, {
          data: {},
        })
      ).status(),
    ).toBe(403);
  }
  for (const [name, content] of [
    ["bad.docx", source],
    ["empty.txt", "   "],
  ]) {
    const result = await context.request.post("/api/documents", {
      headers: { Origin: baseURL! },
      multipart: {
        files: { name, mimeType: "text/plain", buffer: Buffer.from(content) },
      },
    });
    expect(result.status()).toBe(400);
  }
  const pdf = await upload(
    context,
    baseURL!,
    "unparsed.pdf",
    readFileSync("../../evals/rag/fixtures/image-only.pdf"),
  );
  expect(pdf.ingestionStatus).toBe("unsupported");
  const chat = await session(context, baseURL!, pdf.id);
  expect(
    (
      await send(context, baseURL!, chat.id, pdf.id, "Tóm tắt tài liệu này")
    ).status(),
  ).toBe(422);
});

test("panel quick action, submit, source navigation and selected session survive refresh", async ({
  page,
  context,
  baseURL,
}, info) => {
  const mobile = info.project.name === "mobile";
  const doc = await upload(context, baseURL!);
  await page.goto(`/study-set/${doc.id}`);
  let assistant = await panel(page, mobile);
  await expect(assistant).toContainText("Đang hỏi: lecture.md");
  await assistant
    .getByRole("button", { name: "✨ Tóm tắt tài liệu này" })
    .click();
  await expect(assistant.getByRole("button", { name: /^\[1\]/ })).toBeVisible();
  await assistant
    .getByRole("textbox", { name: "Hỏi về tài liệu", exact: true })
    .fill("Softmax là gì?");
  await assistant.getByRole("button", { name: "Gửi", exact: true }).click();
  await expect(assistant.locator("article")).toHaveCount(4);
  await expect(
    assistant.getByRole("button", { name: "Gửi", exact: true }),
  ).toBeDisabled();
  await page.screenshot({
    path: info.outputPath("compass-chat.png"),
    fullPage: true,
  });
  await assistant
    .getByRole("button", { name: /^\[1\]/ })
    .last()
    .click();
  await expect(
    page.getByRole("region", { name: "Đoạn nguồn được trích dẫn" }),
  ).toContainText("Softmax converts logits");
  if (mobile) assistant = await panel(page, mobile);
  const firstId = await assistant
    .getByRole("combobox", { name: "Lịch sử trò chuyện" })
    .inputValue();
  await assistant
    .getByRole("button", { name: "+ Cuộc trò chuyện mới", exact: true })
    .click();
  await expect(
    assistant.getByText("Bạn muốn tìm hiểu gì?", { exact: true }),
  ).toBeVisible();
  await assistant
    .getByRole("combobox", { name: "Lịch sử trò chuyện" })
    .selectOption(firstId);
  await expect(assistant.locator("article")).toHaveCount(4);
  await page.reload();
  assistant = await panel(page, mobile);
  await expect(assistant.locator("article")).toHaveCount(4);
  await expect(assistant.getByRole("combobox")).toHaveValue(firstId);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("network retry after completed response does not duplicate messages", async ({
  page,
  context,
  baseURL,
}, info) => {
  const doc = await upload(context, baseURL!);
  await page.goto(`/study-set/${doc.id}`);
  const assistant = await panel(page, info.project.name === "mobile");
  let first = true;
  await page.route("**/api/chat/sessions/*/messages", async (route) => {
    if (route.request().method() === "POST" && first) {
      first = false;
      await route.fetch(); // server committed; simulate a lost response at the client
      await route.fulfill({ status: 503, json: { error: "unavailable" } });
    } else await route.continue();
  });
  await assistant
    .getByRole("button", { name: "✨ Tóm tắt tài liệu này" })
    .click();
  await expect(assistant.getByRole("alert")).toBeVisible();
  await assistant.getByRole("button", { name: "Thử lại câu hỏi" }).click();
  await expect(assistant.getByRole("button", { name: /^\[1\]/ })).toBeVisible();
  await expect(assistant.locator("article")).toHaveCount(2);
  await expect(assistant.getByRole("alert")).toHaveCount(0);
});

test("concurrent sends are serialized; default active document, refusal UI and service gateway stay private", async ({
  page,
  context,
  request,
  baseURL,
}, info) => {
  const doc = await upload(context, baseURL!);
  const chat = await session(context, baseURL!, doc.id);
  const results = await Promise.all([
    send(context, baseURL!, chat.id, doc.id, "Softmax là gì?"),
    send(context, baseURL!, chat.id, doc.id, "Softmax là gì?"),
  ]);
  expect(results.map((result) => result.status()).sort()).toEqual([201, 409]);
  expect(
    (
      await (
        await context.request.get(`/api/chat/sessions/${chat.id}/messages`)
      ).json()
    ).messages,
  ).toHaveLength(2);
  const defaultDocument = await context.request.post(
    `/api/chat/sessions/${chat.id}/messages`,
    {
      headers: { Origin: baseURL! },
      data: { message: "Softmax là gì?", request_id: crypto.randomUUID() },
    },
  );
  expect(defaultDocument.status()).toBe(201);
  expect((await defaultDocument.json()).citations[0].document_id).toBe(doc.id);
  const gateway = await context.request.post(
    "/compass-api/internal/compass/answer",
    {
      headers: { Origin: baseURL! },
      data: { message: "x", evidence: [] },
    },
  );
  expect(gateway.status()).toBe(403);
  expect(
    (await request.get(`/api/chat/sessions/${chat.id}/messages`)).status(),
  ).toBe(401);
  const oversized = await context.request.post(
    `/api/chat/sessions/${chat.id}/messages`,
    {
      headers: { Origin: baseURL! },
      data: { message: "x".repeat(17000), request_id: crypto.randomUUID() },
    },
  );
  expect(oversized.status()).toBe(413);
  await page.goto(`/study-set/${doc.id}`);
  const assistant = await panel(page, info.project.name === "mobile");
  await assistant
    .getByRole("textbox", { name: "Hỏi về tài liệu", exact: true })
    .fill("Unicornunique là gì?");
  await assistant.getByRole("button", { name: "Gửi", exact: true }).click();
  await expect(assistant.locator("article").last()).toContainText(
    "chưa tìm thấy đủ thông tin",
  );
  await expect(
    assistant.locator("article").last().getByRole("button", { name: /^\[/ }),
  ).toHaveCount(0);
});

const longSource = [
  [
    "Linear Regression",
    "Linear regression minimizes squared error for continuous targets.",
  ],
  [
    "Logistic Regression",
    "Logistic regression uses sigmoid for binary classification.",
  ],
  [
    "Softmax",
    "Softmax converts logits into normalized probabilities using exponential. Softmax can amplify large logits and requires numerical stabilization.",
  ],
  [
    "Cross Entropy",
    "Cross entropy measures negative log probability of the true label.",
  ],
  [
    "Gradient Descent",
    "Gradient descent updates parameters by subtracting learning rate times gradient.",
  ],
]
  .map(([heading, content]) => `# ${heading}\n${(content + "\n\n").repeat(65)}`)
  .join("\n");

test("long-document retrieval ranks relevant evidence, refuses absent attention, and restores chained context", async ({
  context,
  baseURL,
}) => {
  const doc = await upload(context, baseURL!, "five-sections.md", longSource);
  const chat = await session(context, baseURL!, doc.id);
  for (const [query, heading] of [
    ["Softmax dùng để làm gì?", "Softmax"],
    ["Cross entropy là gì?", "Cross Entropy"],
    ["Gradient descent cập nhật tham số thế nào?", "Gradient Descent"],
  ]) {
    const response = await send(context, baseURL!, chat.id, doc.id, query);
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.message.status).toBe("answered");
    expect(body.citations[0].heading).toBe(heading);
    const chunk = await context.request.get(
      `/api/documents/${doc.id}/chunks/${body.citations[0].chunk_id}`,
    );
    expect((await chunk.json()).chunk.content.toLowerCase()).toContain(
      heading.toLowerCase(),
    );
  }
  const small = await upload(context, baseURL!, "limited.md", source);
  const isolated = await session(context, baseURL!, small.id);
  const absent = await send(
    context,
    baseURL!,
    isolated.id,
    small.id,
    "Transformer attention hoạt động thế nào?",
  );
  expect((await absent.json()).message).toMatchObject({
    status: "abstained",
    citations: [],
  });
  const contextual = await session(context, baseURL!, doc.id);
  for (const query of [
    "Softmax là gì?",
    "Tại sao nó dùng exponential?",
    "Nó có nhược điểm gì theo tài liệu?",
  ]) {
    const response = await send(
      context,
      baseURL!,
      contextual.id,
      doc.id,
      query,
    );
    const body = await response.json();
    expect(body.message.status).toBe("answered");
    expect(body.citations[0].heading).toBe("Softmax");
  }
});

test("chunk endpoint rejects a foreign owner and mismatched document even with valid chunk ID", async ({
  context,
  request,
  baseURL,
}) => {
  const doc = await upload(context, baseURL!);
  const other = await upload(
    context,
    baseURL!,
    "other.md",
    "# Other\nDifferent content",
  );
  const chat = await session(context, baseURL!, doc.id);
  const body = await (
    await send(context, baseURL!, chat.id, doc.id, "Softmax là gì?")
  ).json();
  const path = `/api/documents/${doc.id}/chunks/${body.citations[0].chunk_id}`;
  expect((await request.get(path)).status()).toBe(401);
  await request.post("/api/auth/register", {
    headers: { Origin: baseURL! },
    data: {
      username: `chunk_${crypto.randomUUID().slice(0, 12)}`,
      name: "Other user",
      password: "test123",
    },
  });
  const foreign = await request.get(path);
  expect(foreign.status()).toBe(404);
  expect(await foreign.text()).not.toContain("lecture.md");
  expect(
    (
      await context.request.get(
        `/api/documents/${other.id}/chunks/${body.citations[0].chunk_id}`,
      )
    ).status(),
  ).toBe(404);
});

test("expired worker cannot commit or fail a newer attempt with the same idempotency key", async ({
  context,
  baseURL,
}) => {
  const doc = await upload(context, baseURL!, "lease.md", `${source}\nlease`);
  const chat = await session(context, baseURL!, doc.id);
  const id = crypto.randomUUID();
  const db = new DatabaseSync(".playwright-data/documents.sqlite");
  try {
    const original = send(
      context,
      baseURL!,
      chat.id,
      doc.id,
      "Softmax lease là gì?",
      id,
    );
    await expect
      .poll(
        () =>
          db
            .prepare("SELECT generating_token FROM chat_sessions WHERE id = ?")
            .get(chat.id)?.generating_token,
      )
      .toBeTruthy();
    const oldToken = db
      .prepare("SELECT generating_token FROM chat_sessions WHERE id = ?")
      .get(chat.id)?.generating_token;
    db.prepare(
      "UPDATE chat_sessions SET generating_until = 0 WHERE id = ?",
    ).run(chat.id);
    const replacement = send(
      context,
      baseURL!,
      chat.id,
      doc.id,
      "Softmax lease là gì?",
      id,
    );
    await expect
      .poll(
        () =>
          db
            .prepare("SELECT generating_token FROM chat_sessions WHERE id = ?")
            .get(chat.id)?.generating_token,
      )
      .not.toBe(oldToken);
    expect((await original).status()).toBe(409);
    expect((await replacement).status()).toBe(201);
    const restored = await context.request.get(
      `/api/chat/sessions/${chat.id}/messages`,
    );
    expect((await restored.json()).messages).toHaveLength(2);
  } finally {
    db.close();
  }
});

test("reupload retries failed ingestion and preserves existing ready chunks and citations", async ({
  context,
  baseURL,
}) => {
  const doc = await upload(context, baseURL!);
  const db = new DatabaseSync(".playwright-data/documents.sqlite");
  try {
    const ids = () =>
      db
        .prepare(
          "SELECT id FROM document_chunks WHERE document_id = ? ORDER BY chunk_index",
        )
        .all(doc.id);
    const before = ids();
    expect((await upload(context, baseURL!)).id).toBe(doc.id);
    expect(ids()).toEqual(before);
    db.prepare(
      "UPDATE documents SET ingestion_status = 'failed' WHERE id = ?",
    ).run(doc.id);
    expect((await upload(context, baseURL!)).ingestionStatus).toBe("ready");
    expect(ids()).toHaveLength(before.length);
  } finally {
    db.close();
  }
});

test("rapid citation clicks keep the latest source on a long document", async ({
  page,
  context,
  baseURL,
}, info) => {
  const doc = await upload(context, baseURL!, "long.md", longSource);
  await page.goto(`/study-set/${doc.id}`);
  let assistant = await panel(page, info.project.name === "mobile");
  await assistant
    .getByRole("button", { name: "✨ Tóm tắt tài liệu này" })
    .click();
  const buttons = assistant.locator("article").last().getByRole("button");
  await expect(buttons).toHaveCount(6);
  const first = await buttons.first().innerText();
  const last = await buttons.last().innerText();
  expect(first).not.toBe(last);
  await page.route("**/api/documents/*/chunks/*", async (route) => {
    const response = await route.fetch();
    if ((await response.json()).chunk.heading === "Linear Regression")
      await new Promise((resolve) => setTimeout(resolve, 500));
    await route.fulfill({ response });
  });
  await buttons.first().click();
  if (info.project.name === "mobile") assistant = await panel(page, true);
  await assistant.locator("article").last().getByRole("button").last().click();
  const card = page.getByRole("region", { name: "Đoạn nguồn được trích dẫn" });
  await expect(card).toContainText("Gradient descent");
  await page.waitForTimeout(600);
  await expect(card).toContainText("Gradient descent");
  await expect(card).toBeFocused();
});

test("clean migrations, version-two upgrade, foreign keys and query indexes are intact", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(
      "CREATE TABLE documents (id TEXT PRIMARY KEY, name TEXT, kind TEXT, content BLOB)",
    );
    migrateCompassChat(db);
    migrateCompassChat(db);
    expect(db.prepare("PRAGMA foreign_keys").get()?.foreign_keys).toBe(1);
    for (const [table, field] of [
      ["document_chunks", "document_id"],
      ["chat_messages", "session_id"],
      ["message_citations", "message_id"],
    ]) {
      const plan = db
        .prepare(`EXPLAIN QUERY PLAN SELECT * FROM ${table} WHERE ${field} = ?`)
        .all("id");
      expect(JSON.stringify(plan)).toContain("USING INDEX");
      expect(
        db.prepare(`PRAGMA foreign_key_list(${table})`).all().length,
      ).toBeGreaterThan(0);
    }
    expect(
      db
        .prepare("PRAGMA index_list(chat_sessions)")
        .all()
        .some((row) => row.name === "chat_sessions_owner_set"),
    ).toBe(true);
    // Reproduce an existing migration-002 workspace before applying the new fix.
    db.exec(
      "ALTER TABLE chat_sessions DROP COLUMN generating_token; DELETE FROM document_schema_migrations WHERE version = 3",
    );
    migrateCompassChat(db);
    expect(
      db
        .prepare("PRAGMA table_info(chat_sessions)")
        .all()
        .some((row) => row.name === "generating_token"),
    ).toBe(true);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  } finally {
    db.close();
  }
});

test("duplicate sends and refusal invoke the provider at most once; invalid citations are never persisted", async ({
  context,
  baseURL,
}) => {
  const doc = await upload(context, baseURL!);
  const chat = await session(context, baseURL!, doc.id);
  const api = `http://127.0.0.1:${process.env.PLAYWRIGHT_API_PORT || "8005"}`;
  const count = async () =>
    (await (await context.request.get(`${api}/_test/compass/calls`)).json())
      .calls;
  const initial = await count();
  const id = crypto.randomUUID();
  const responses = await Promise.all([
    send(context, baseURL!, chat.id, doc.id, "Softmax là gì?", id),
    send(context, baseURL!, chat.id, doc.id, "Softmax là gì?", id),
  ]);
  expect(responses.map((row) => row.status()).sort()).toEqual([201, 409]);
  expect(
    (
      await send(context, baseURL!, chat.id, doc.id, "Softmax là gì?", id)
    ).status(),
  ).toBe(201);
  expect(await count()).toBe(initial + 1);
  await send(
    context,
    baseURL!,
    chat.id,
    doc.id,
    "Transformer attention hoạt động thế nào?",
  );
  expect(await count()).toBe(initial + 1);
  const invalid = await send(
    context,
    baseURL!,
    chat.id,
    doc.id,
    "Softmax kiểm tra giả là gì?",
  );
  const body = await invalid.json();
  expect(body.message).toMatchObject({ status: "abstained", citations: [] });
  const db = new DatabaseSync(".playwright-data/documents.sqlite");
  try {
    expect(
      db
        .prepare("SELECT * FROM message_citations WHERE message_id = ?")
        .all(body.message.id),
    ).toEqual([]);
  } finally {
    db.close();
  }
});

test("refresh during generation restores the same request and retry does not call LLM again", async ({
  page,
  context,
  baseURL,
}, info) => {
  const doc = await upload(context, baseURL!, "refresh.md", `${source}\nlease`);
  const chat = await session(context, baseURL!, doc.id);
  await page.goto(`/study-set/${doc.id}?chat=${chat.id}`);
  let assistant = await panel(page, info.project.name === "mobile");
  const generation = send(
    context,
    baseURL!,
    chat.id,
    doc.id,
    "Softmax lease là gì?",
  );
  const db = new DatabaseSync(".playwright-data/documents.sqlite");
  try {
    await expect
      .poll(
        () =>
          db
            .prepare(
              "SELECT status FROM chat_messages WHERE session_id = ? AND role = 'user'",
            )
            .get(chat.id)?.status,
      )
      .toBe("pending");
    await page.reload();
    assistant = await panel(page, info.project.name === "mobile");
    expect((await generation).status()).toBe(201);
    if (
      await assistant.getByRole("button", { name: "Thử lại câu hỏi" }).count()
    ) {
      await assistant.getByRole("button", { name: "Thử lại câu hỏi" }).click();
    }
    await expect(assistant.locator("article")).toHaveCount(2);
    const userRows = db
      .prepare(
        "SELECT * FROM chat_messages WHERE session_id = ? AND role = 'user'",
      )
      .all(chat.id);
    expect(userRows).toHaveLength(1);
  } finally {
    db.close();
  }
});

test("persisted citations are scoped to the session study set even if database data is inconsistent", async ({
  context,
  baseURL,
}) => {
  const a = await upload(context, baseURL!);
  const b = await upload(
    context,
    baseURL!,
    "other-set.md",
    "# Private\nOther study set metadata",
  );
  const chat = await session(context, baseURL!, a.id);
  const answer = await (
    await send(context, baseURL!, chat.id, a.id, "Softmax là gì?")
  ).json();
  const db = new DatabaseSync(".playwright-data/documents.sqlite");
  try {
    const chunk = db
      .prepare("SELECT id FROM document_chunks WHERE document_id = ?")
      .get(b.id)?.id;
    db.prepare(
      "UPDATE message_citations SET chunk_id = ? WHERE message_id = ?",
    ).run(chunk as string, answer.message.id);
    const history = await context.request.get(
      `/api/chat/sessions/${chat.id}/messages`,
    );
    expect((await history.json()).messages.at(-1).citations).toEqual([]);
  } finally {
    db.close();
  }
});

test("panel handles double send, long filename, loading and study-set switching with restored follow-up", async ({
  page,
  context,
  baseURL,
}, info) => {
  const name = `${"lecture-".repeat(20)}.md`;
  const doc = await upload(context, baseURL!, name, `${source}\nlease`);
  const other = await upload(
    context,
    baseURL!,
    "second.md",
    "# Logistic Regression\nLogistic regression uses sigmoid.",
  );
  await page.goto(`/study-set/${doc.id}`);
  let assistant = await panel(page, info.project.name === "mobile");
  await assistant
    .getByRole("textbox", { name: "Hỏi về tài liệu", exact: true })
    .fill("Softmax lease là gì?");
  await assistant
    .getByRole("button", { name: "Gửi", exact: true })
    .evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
  await expect(assistant.getByRole("status")).toContainText("đang xử lý");
  await expect(assistant.locator("article")).toHaveCount(2);
  await expect(
    assistant.locator("article").last().getByRole("button"),
  ).toBeVisible();
  await page.reload();
  assistant = await panel(page, info.project.name === "mobile");
  await assistant
    .getByRole("textbox", { name: "Hỏi về tài liệu", exact: true })
    .fill("Tại sao nó dùng exponential?");
  await assistant.getByRole("button", { name: "Gửi", exact: true }).click();
  await expect(assistant.locator("article")).toHaveCount(4);
  await expect(assistant.locator("article").last()).toContainText(
    "Hỏi tiếp về softmax",
  );
  await page.goto(`/study-set/${other.id}`);
  assistant = await panel(page, info.project.name === "mobile");
  await expect(assistant.locator("article")).toHaveCount(0);
  await expect(assistant).toContainText("Đang hỏi: second.md");
  await assistant
    .getByRole("button", { name: "✨ Tóm tắt tài liệu này" })
    .click();
  await expect(assistant.locator("article").last()).toContainText(
    "Logistic regression uses sigmoid",
  );
  await expect(assistant.locator("article").last()).not.toContainText(
    "Softmax converts logits",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("compass-verification-states.png"),
    fullPage: true,
  });
});

test("partial ingestion failure persists failed status without orphan chunks, then reupload recovers", async ({
  context,
  baseURL,
}) => {
  const db = new DatabaseSync(".playwright-data/documents.sqlite");
  try {
    db.exec(`CREATE TRIGGER verification_ingestion_failure BEFORE INSERT ON document_chunks
      WHEN NEW.chunk_index = 1 AND (SELECT name FROM documents WHERE id = NEW.document_id) = 'large-failed.md'
      BEGIN SELECT RAISE(ABORT, 'controlled ingestion failure'); END;`);
    const response = await context.request.post("/api/documents", {
      headers: { Origin: baseURL! },
      multipart: {
        files: {
          name: "large-failed.md",
          mimeType: "text/plain",
          buffer: Buffer.from(longSource),
        },
      },
    });
    expect(response.status()).toBe(422);
    expect((await response.json()).error).toBe("ingestion_failed");
    const list = await (await context.request.get("/api/documents")).json();
    const failed = list.documents.find(
      (row: { name: string }) => row.name === "large-failed.md",
    );
    expect(failed.ingestionStatus).toBe("failed");
    expect(
      db
        .prepare("SELECT * FROM document_chunks WHERE document_id = ?")
        .all(failed.id),
    ).toEqual([]);
    db.exec("DROP TRIGGER verification_ingestion_failure");
    const recovered = await upload(
      context,
      baseURL!,
      "large-failed.md",
      longSource,
    );
    expect(recovered).toMatchObject({
      id: failed.id,
      ingestionStatus: "ready",
    });
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM document_chunks WHERE document_id = ?",
        )
        .get(failed.id)?.n,
    ).toBe(chunkText(longSource, true).length);
    const empty = await context.request.post("/api/documents", {
      headers: { Origin: baseURL! },
      multipart: {
        files: {
          name: "empty.txt",
          mimeType: "text/plain",
          buffer: Buffer.alloc(0),
        },
      },
    });
    expect(empty.status()).toBe(413);
    expect((await empty.json()).error).toBe("file_size");
  } finally {
    db.exec("DROP TRIGGER IF EXISTS verification_ingestion_failure");
    db.close();
  }
});

test("a completed turn stays successful when session-list refresh is unavailable", async ({
  page,
  context,
  baseURL,
}, info) => {
  const doc = await upload(context, baseURL!);
  await page.goto(`/study-set/${doc.id}`);
  const assistant = await panel(page, info.project.name === "mobile");
  let reloads = 0;
  await page.route("**/api/study-sets/*/chat/sessions", async (route) => {
    if (route.request().method() === "GET") {
      reloads++;
      await route.fulfill({ status: 503, json: { error: "unavailable" } });
    } else await route.continue();
  });
  await assistant
    .getByRole("button", { name: "✨ Tóm tắt tài liệu này" })
    .click();
  await expect(assistant.locator("article")).toHaveCount(2);
  await expect(assistant.getByRole("button", { name: /^\[1\]/ })).toBeVisible();
  await expect(assistant.getByRole("alert")).toHaveCount(0);
  expect(reloads).toBe(0);
});

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
async function panel(page: import("@playwright/test").Page) {
  await expect(
    page.getByRole("button", {
      name: /^(Open chatbot|Mở chatbot|Close chatbot|Đóng chatbot)$/,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /^(Open chatbot|Mở chatbot|Close chatbot|Đóng chatbot)$/,
    }),
  ).toBeEnabled();
  const launcher = page.getByRole("button", {
    name: /^(Open chatbot|Mở chatbot)$/,
  });
  if (await launcher.isVisible()) await launcher.click();
  const assistant = page.locator("#compass-chat-panel");
  await expect(
    assistant.getByRole("textbox", { name: "Message Compass" }),
  ).toBeEnabled();
  return assistant;
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

test("document quick action, sources and unified conversation survive refresh", async ({
  page,
  context,
  baseURL,
}) => {
  const doc = await upload(context, baseURL!);
  await page.goto(`/study-set/${doc.id}`);
  const assistant = await panel(page);
  await expect(assistant.locator("summary").first()).toContainText(doc.name);
  await assistant
    .getByRole("button", { name: "Summarize this material", exact: true })
    .click();
  await expect(assistant.getByRole("log")).toContainText("Theo tài liệu");
  await assistant
    .getByRole("textbox", { name: "Message Compass" })
    .fill("Softmax là gì?");
  await assistant.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    assistant.getByRole("log").getByText("Softmax là gì?", { exact: true }),
  ).toHaveCount(1);
  await expect(
    assistant.getByRole("button", { name: "Send", exact: true }),
  ).toBeDisabled();
  await assistant.getByText("Sources", { exact: false }).last().click();
  const opened = page.waitForEvent("popup");
  await assistant
    .getByRole("link", { name: doc.name, exact: true })
    .last()
    .click();
  const reader = await opened;
  await expect(
    reader.getByRole("region", { name: "Đoạn nguồn được trích dẫn" }),
  ).toContainText("Softmax converts logits");
  await reader.close();
  await assistant
    .getByRole("button", { name: "New conversation", exact: true })
    .click();
  await expect(assistant.getByRole("log")).not.toContainText("Softmax là gì?");
  await assistant.getByRole("button", { name: "History", exact: true }).click();
  await assistant
    .getByRole("region", { name: "Conversation history", exact: true })
    .getByRole("button", { name: /Summarize the main ideas/ })
    .click();
  await expect(assistant.getByRole("log")).toContainText("Softmax là gì?");
  await page.reload();
  await panel(page);
  await expect(assistant.getByRole("log")).toContainText("Softmax là gì?");
  await expect(assistant.locator("summary").first()).toContainText(doc.name);
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
}) => {
  const doc = await upload(context, baseURL!);
  await page.goto(`/study-set/${doc.id}`);
  const assistant = await panel(page);
  let first = true;
  await page.route("**/compass-api/companion/messages", async (route) => {
    if (route.request().method() === "POST" && first) {
      first = false;
      const saved = await route.fetch();
      expect(saved.status()).toBe(200);
      await route.fulfill({ status: 503, json: { error: "unavailable" } });
    } else await route.continue();
  });
  await assistant
    .getByRole("button", { name: "Summarize this material", exact: true })
    .click();
  await expect(assistant.getByRole("alert")).toBeVisible();
  await assistant
    .getByRole("button", { name: "Retry message", exact: true })
    .click();
  await expect(assistant.getByRole("log")).toContainText("Theo tài liệu");
  await expect(assistant.getByRole("alert")).toHaveCount(0);
  const listing = await (
    await context.request.get("/compass-api/companion/conversations")
  ).json();
  const history = await (
    await context.request.get(
      `/compass-api/companion/conversations/${listing.conversations[0].id}`,
    )
  ).json();
  expect(history.exchanges).toHaveLength(1);
  expect(history.exchanges[0].response.citations.length).toBeGreaterThan(0);
});

test("concurrent sends are serialized; default active document, refusal UI and service gateway stay private", async ({
  page,
  context,
  request,
  baseURL,
}) => {
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
  const assistant = await panel(page);
  await assistant
    .getByRole("textbox", { name: "Message Compass", exact: true })
    .fill("Unicornunique là gì?");
  await assistant.getByRole("button", { name: "Send", exact: true }).click();
  await expect(assistant.getByRole("log")).toContainText(
    "chưa tìm thấy đủ thông tin",
  );
  await expect(assistant.getByRole("log").getByRole("link")).toHaveCount(0);
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

test("long-document citations open the selected original chunk", async ({
  page,
  context,
  baseURL,
}) => {
  const doc = await upload(context, baseURL!, "long.md", longSource);
  const chat = await session(context, baseURL!, doc.id);
  const answer = await (
    await send(context, baseURL!, chat.id, doc.id, "Tóm tắt tài liệu này")
  ).json();
  expect(answer.citations).toHaveLength(6);
  const first = answer.citations[0];
  const last = answer.citations.at(-1);
  expect(first.chunk_id).not.toBe(last.chunk_id);
  await page.goto(`/study-set/${doc.id}?chunk=${first.chunk_id}`);
  await expect(
    page.getByRole("region", { name: "Đoạn nguồn được trích dẫn" }),
  ).toContainText("Linear regression");
  await page.goto(`/study-set/${doc.id}?chunk=${last.chunk_id}`);
  const card = page.getByRole("region", { name: "Đoạn nguồn được trích dẫn" });
  const chunk = await (
    await context.request.get(
      `/api/documents/${doc.id}/chunks/${last.chunk_id}`,
    )
  ).json();
  await expect(card).toContainText(chunk.chunk.content.slice(0, 80));
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

test("duplicate sends invoke the provider once; refusal and invalid citations persist no sources", async ({
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
  const refusal = await send(
    context,
    baseURL!,
    chat.id,
    doc.id,
    "Transformer attention hoạt động thế nào?",
  );
  expect((await refusal.json()).message).toMatchObject({
    status: "abstained",
    citations: [],
  });
  // Empty evidence is sent to the answer service, whose fixture also counts refusals.
  expect(await count()).toBe(initial + 2);
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

test("retry after generation restores the same persisted request", async ({
  context,
  baseURL,
}) => {
  const doc = await upload(context, baseURL!, "refresh.md", `${source}\nlease`);
  const chat = await session(context, baseURL!, doc.id);
  const requestId = crypto.randomUUID();
  const generation = send(
    context,
    baseURL!,
    chat.id,
    doc.id,
    "Softmax lease là gì?",
    requestId,
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
    const during = await (
      await context.request.get(`/api/chat/sessions/${chat.id}/messages`)
    ).json();
    expect(
      during.messages.filter((row: { role: string }) => row.role === "user"),
    ).toHaveLength(1);
    expect((await generation).status()).toBe(201);
    const repeated = await send(
      context,
      baseURL!,
      chat.id,
      doc.id,
      "Softmax lease là gì?",
      requestId,
    );
    expect(repeated.status()).toBe(201);
    expect((await repeated.json()).messages).toHaveLength(2);
    expect(
      db
        .prepare(
          "SELECT * FROM chat_messages WHERE session_id = ? AND role = 'user'",
        )
        .all(chat.id),
    ).toHaveLength(1);
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

test("unified assistant prevents double send and switches document evidence within its thread", async ({
  page,
  context,
  baseURL,
}) => {
  const name = `${"lecture-".repeat(20)}.md`;
  const doc = await upload(context, baseURL!, name, `${source}\nlease`);
  const other = await upload(
    context,
    baseURL!,
    "second.md",
    "# Logistic Regression\nLogistic regression uses sigmoid.",
  );
  await page.goto(`/study-set/${doc.id}`);
  const assistant = await panel(page);
  // Hold the response so the in-flight state is deterministic, independently of provider speed.
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/compass-api/companion/messages", async (route) => {
    const response = await route.fetch();
    await held;
    await route.fulfill({ response });
  });
  await assistant
    .getByRole("textbox", { name: "Message Compass", exact: true })
    .fill("Softmax là gì?");
  await assistant
    .getByRole("button", { name: "Send", exact: true })
    .evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
  await expect(assistant.getByRole("status")).toContainText("checking");
  release();
  await expect(assistant.getByRole("log")).toContainText("Theo tài liệu");
  await page.unroute("**/compass-api/companion/messages");
  await page.reload();
  await panel(page);
  await expect(
    assistant.getByRole("log").getByText("Softmax là gì?", { exact: true }),
  ).toHaveCount(1);
  await page.goto(`/study-set/${other.id}`);
  await panel(page);
  await assistant.locator("summary").first().click();
  await assistant
    .getByRole("button", { name: other.name, exact: true })
    .click();
  await assistant
    .getByRole("textbox", { name: "Message Compass", exact: true })
    .fill("Logistic regression là gì?");
  await assistant.getByRole("button", { name: "Send", exact: true }).click();
  await expect(assistant.getByRole("log")).toContainText(
    "Logistic regression uses sigmoid",
  );
  const listing = await (
    await context.request.get("/compass-api/companion/conversations")
  ).json();
  const history = await (
    await context.request.get(
      `/compass-api/companion/conversations/${listing.conversations[0].id}`,
    )
  ).json();
  expect(history.exchanges).toHaveLength(2);
  expect(
    history.exchanges.map((row: { document_id: string }) => row.document_id),
  ).toEqual([doc.id, other.id]);
  expect(
    history.exchanges[1].response.citations.every(
      (row: { source_url: string }) => row.source_url.includes(other.id),
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
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

test("a completed unified turn needs no legacy session-list refresh", async ({
  page,
  context,
  baseURL,
}) => {
  const doc = await upload(context, baseURL!);
  await page.goto(`/study-set/${doc.id}`);
  const assistant = await panel(page);
  let reloads = 0;
  await page.route("**/api/study-sets/*/chat/sessions", async (route) => {
    if (route.request().method() === "GET") {
      reloads++;
      await route.fulfill({ status: 503, json: { error: "unavailable" } });
    } else await route.continue();
  });
  await assistant
    .getByRole("button", { name: "Summarize this material", exact: true })
    .click();
  await expect(assistant.getByRole("log")).toContainText("Theo tài liệu");
  await expect(assistant.getByRole("alert")).toHaveCount(0);
  expect(reloads).toBe(0);
});

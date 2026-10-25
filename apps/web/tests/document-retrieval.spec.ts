import { test, expect, type APIRequestContext } from "@playwright/test";

test.beforeEach(async ({ request, baseURL }) => {
  const response = await request.post("/api/auth/register", {
    headers: { Origin: baseURL! },
    data: {
      username: `retrieval_${crypto.randomUUID().slice(0, 12)}`,
      password: "test123",
      name: "Retrieval regression",
    },
  });
  expect(response.status()).toBe(201);
});

async function retrieve(
  request: APIRequestContext,
  origin: string,
  content: string,
  query: string,
) {
  const upload = await request.post("/api/documents", {
    headers: { Origin: origin },
    multipart: {
      files: {
        name: "retrieval.md",
        mimeType: "text/markdown",
        buffer: Buffer.from(content),
      },
    },
  });
  expect(upload.status()).toBe(201);
  const document = (await upload.json()).documents[0];
  const created = await request.post(
    `/api/study-sets/${document.id}/chat/sessions`,
    {
      headers: { Origin: origin },
      data: {},
    },
  );
  expect(created.status()).toBe(201);
  const session = (await created.json()).session;
  const response = await request.post(
    `/api/chat/sessions/${session.id}/messages`,
    {
      headers: { Origin: origin },
      data: {
        message: query,
        active_document_id: document.id,
        request_id: crypto.randomUUID(),
      },
    },
  );
  expect(response.status()).toBe(201);
  const result = await response.json();
  const sources = [];
  for (const citation of result.citations) {
    expect(citation.document_id).toBe(document.id);
    const source = await request.get(
      `/api/documents/${document.id}/chunks/${citation.chunk_id}`,
    );
    expect(source.status()).toBe(200);
    const chunk = (await source.json()).chunk;
    expect(content.slice(chunk.start_offset, chunk.end_offset)).toBe(
      chunk.content,
    );
    sources.push(chunk.content as string);
  }
  return sources;
}

test("unaccented query retrieves original Vietnamese evidence through authenticated routes", async ({
  request,
  baseURL,
}) => {
  const content =
    "Bộ đệm nhớ trạng thái kết nối, bộ nhớ của máy tính.\n".repeat(120) +
    "\n\nBộ nhớ đệm lưu bản sao dữ liệu gần đây. Mã minh họa CACHE-427.";
  const sources = await retrieve(
    request,
    baseURL!,
    content,
    "Bo nho dem luu gi?",
  );
  expect(sources.some((s) => s.includes("CACHE-427"))).toBe(true);
});

test("long-table retrieval keeps both late row and original header as cited evidence", async ({
  request,
  baseURL,
}) => {
  const header = "| Mô hình | Precision | Recall |\n| --- | --- | --- |\n";
  const content =
    header +
    Array.from({ length: 360 }, (_, i) => `| R${i} | 0,40 | 0,50 |`).join(
      "\n",
    ) +
    "\n| B | 0,79 | 0,88 |";
  const sources = await retrieve(
    request,
    baseURL!,
    content,
    "Recall mô hình B?",
  );
  expect(sources.length).toBeLessThanOrEqual(6);
  expect(sources.some((s) => s.includes("| B | 0,79 | 0,88 |"))).toBe(true);
  expect(sources.some((s) => s.includes(header))).toBe(true);
});

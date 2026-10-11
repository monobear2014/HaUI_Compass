import { expect, test } from "@playwright/test";

test("async persistence boundaries preserve document, progress and chat API contracts", async ({
  context,
  baseURL,
}) => {
  const origin = baseURL!;
  const username = `persistence_${crypto.randomUUID().slice(0, 10)}`;
  expect(
    (
      await context.request.post("/api/auth/register", {
        headers: { Origin: origin },
        data: { username, name: "Persistence test", password: "test123" },
      })
    ).status(),
  ).toBe(201);

  const upload = await context.request.post("/api/documents", {
    headers: { Origin: origin },
    multipart: {
      files: {
        name: "async-boundary.md",
        mimeType: "text/markdown",
        buffer: Buffer.from("# Async boundary\n\n## Topic\nPersist this."),
      },
    },
  });
  expect(upload.status()).toBe(201);
  const document = (await upload.json()).documents[0];

  const listed = await context.request.get("/api/documents");
  expect((await listed.json()).documents).toEqual([document]);

  const progress = await context.request.patch(
    `/api/documents/${document.id}/progress`,
    {
      headers: { Origin: origin },
      data: { covered: ["topic-0"], mastered: ["topic-0"] },
    },
  );
  expect(progress.status()).toBe(200);
  expect((await progress.json()).progress).toMatchObject({
    covered: ["topic-0"],
    mastered: ["topic-0"],
  });

  const session = await context.request.post(
    `/api/study-sets/${document.id}/chat/sessions`,
    { headers: { Origin: origin } },
  );
  expect(session.status()).toBe(201);
  const created = (await session.json()).session;
  const sessions = await context.request.get(
    `/api/study-sets/${document.id}/chat/sessions`,
  );
  expect((await sessions.json()).sessions).toEqual([created]);
});

test("study-set lookups and listings remain owner scoped", async ({
  context,
  browser,
  baseURL,
}) => {
  const origin = baseURL!;
  const register = (target: typeof context, prefix: string) =>
    target.request.post("/api/auth/register", {
      headers: { Origin: origin },
      data: {
        username: `${prefix}_${crypto.randomUUID().slice(0, 10)}`,
        name: "Persistence owner",
        password: "test123",
      },
    });
  expect((await register(context, "owner")).status()).toBe(201);
  const upload = await context.request.post("/api/documents", {
    headers: { Origin: origin },
    multipart: {
      files: {
        name: "private.md",
        mimeType: "text/markdown",
        buffer: Buffer.from("# Private study set\n\nOwner-scoped content."),
      },
    },
  });
  const document = (await upload.json()).documents[0];

  const other = await browser.newContext({ baseURL: origin });
  try {
    expect((await register(other, "other")).status()).toBe(201);
    expect((await other.request.get("/api/documents")).status()).toBe(200);
    expect(
      (await (await other.request.get("/api/documents")).json()).documents,
    ).toEqual([]);
    expect(
      (await other.request.get(`/api/documents/${document.id}`)).status(),
    ).toBe(404);
    expect(
      (
        await other.request.delete(`/api/documents/${document.id}`, {
          headers: { Origin: origin },
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await other.request.get(`/api/documents/${crypto.randomUUID()}`)
      ).status(),
    ).toBe(404);
  } finally {
    await other.close();
  }

  expect(
    (
      await context.request.patch(`/api/documents/${document.id}/progress`, {
        headers: { Origin: origin },
        data: { covered: ["topic-0"], mastered: [] },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await context.request.post(
        `/api/study-sets/${document.id}/chat/sessions`,
        { headers: { Origin: origin } },
      )
    ).status(),
  ).toBe(201);
  expect(
    (
      await context.request.delete(`/api/documents/${document.id}`, {
        headers: { Origin: origin },
      })
    ).status(),
  ).toBe(204);
  expect(
    (await context.request.get(`/api/documents/${document.id}`)).status(),
  ).toBe(404);
  expect(
    (await (await context.request.get("/api/documents")).json()).documents,
  ).toEqual([]);
});

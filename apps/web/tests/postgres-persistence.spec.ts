import { expect, test, type BrowserContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { Pool } from "pg";

const databaseUrl = process.env.HAUI_COMPASS_WEB_DATABASE_URL;
test.skip(!databaseUrl, "requires an isolated PostgreSQL test database");

const source = `# Classification

## Softmax
Softmax normalizes exponential scores into a probability distribution.
`;

function database() {
  return new Pool({ connectionString: databaseUrl, max: 1 });
}

async function register(context: BrowserContext, origin: string) {
  const response = await context.request.post("/api/auth/register", {
    headers: { Origin: origin },
    data: {
      username: `pg_${crypto.randomUUID().slice(0, 12)}`,
      name: "Postgres test student",
      password: "test123",
    },
  });
  expect(response.status()).toBe(201);
}

async function upload(
  context: BrowserContext,
  origin: string,
  name = "postgres.md",
  content: Buffer | string = source,
) {
  const response = await context.request.post("/api/documents", {
    headers: { Origin: origin },
    multipart: {
      files: {
        name,
        mimeType: name.endsWith(".pdf") ? "application/pdf" : "text/markdown",
        buffer: Buffer.isBuffer(content) ? content : Buffer.from(content),
      },
    },
  });
  expect(response.status()).toBe(201);
  return (await response.json()).documents[0];
}

async function createSession(
  context: BrowserContext,
  origin: string,
  documentId: string,
) {
  const response = await context.request.post(
    `/api/study-sets/${documentId}/chat/sessions`,
    { headers: { Origin: origin } },
  );
  expect(response.status()).toBe(201);
  return (await response.json()).session;
}

async function send(
  context: BrowserContext,
  origin: string,
  sessionId: string,
  documentId: string,
  requestId = crypto.randomUUID(),
) {
  return context.request.post(`/api/chat/sessions/${sessionId}/messages`, {
    headers: { Origin: origin },
    data: {
      message: "Softmax lease là gì?",
      request_id: requestId,
      active_document_id: documentId,
    },
  });
}

test.beforeAll(async () => {
  const pool = database();
  try {
    const migration = await pool.query(
      "SELECT version FROM web.schema_migrations WHERE version = 1",
    );
    expect(migration.rowCount).toBe(1);
  } finally {
    await pool.end();
  }
});

test("PostgreSQL persists owner-scoped documents, chunks, PDF pages and progress across connections", async ({
  context,
  browser,
  baseURL,
}) => {
  const origin = baseURL!;
  await register(context, origin);
  const document = await upload(context, origin);
  expect(document.ingestionStatus).toBe("ready");

  const firstConnection = database();
  const chunks = await firstConnection.query<{
    id: string;
    chunk_index: number;
    heading: string | null;
    page_number: number | null;
  }>(
    `SELECT id, chunk_index, heading, page_number
     FROM web.document_chunks WHERE document_id = $1 ORDER BY chunk_index`,
    [document.id],
  );
  expect(chunks.rows.length).toBeGreaterThan(0);
  expect(chunks.rows.map((row) => row.chunk_index)).toEqual(
    chunks.rows.map((_, index) => index),
  );
  expect(chunks.rows[0].heading).toBe("Classification");
  await firstConnection.end();

  const secondConnection = database();
  try {
    expect(
      (
        await secondConnection.query(
          "SELECT id FROM web.documents WHERE id = $1",
          [document.id],
        )
      ).rowCount,
    ).toBe(1);
  } finally {
    await secondConnection.end();
  }

  const writes = await Promise.all(
    [
      { covered: [], mastered: [] },
      { covered: ["topic-0"], mastered: ["topic-0"] },
    ].map((data) =>
      context.request.patch(`/api/documents/${document.id}/progress`, {
        headers: { Origin: origin },
        data,
      }),
    ),
  );
  expect(writes.map((response) => response.status())).toEqual([200, 200]);

  const other = await browser.newContext({ baseURL: origin });
  try {
    await register(other, origin);
    expect((await other.request.get("/api/documents")).status()).toBe(200);
    expect(
      (await (await other.request.get("/api/documents")).json()).documents,
    ).toEqual([]);
    expect(
      (await other.request.get(`/api/documents/${document.id}`)).status(),
    ).toBe(404);
    expect(
      (
        await other.request.get(
          `/api/documents/${document.id}/chunks/${chunks.rows[0].id}`,
        )
      ).status(),
    ).toBe(404);
  } finally {
    await other.close();
  }

  const pdf = await upload(
    context,
    origin,
    "ml-pages.pdf",
    readFileSync("../../evals/rag/fixtures/ml-pages.pdf"),
  );
  const pool = database();
  try {
    const pages = await pool.query<{ page_number: number | null }>(
      `SELECT page_number FROM web.document_chunks
       WHERE document_id = $1 ORDER BY chunk_index`,
      [pdf.id],
    );
    expect(pages.rows.some((row) => row.page_number === 2)).toBe(true);
  } finally {
    await pool.end();
  }

  expect(
    (
      await context.request.delete(`/api/documents/${document.id}`, {
        headers: { Origin: origin },
      })
    ).status(),
  ).toBe(204);
  const afterDelete = database();
  try {
    expect(
      (
        await afterDelete.query(
          `SELECT
             (SELECT COUNT(*) FROM web.documents WHERE id = $1) AS documents,
             (SELECT COUNT(*) FROM web.document_chunks WHERE document_id = $1) AS chunks,
             (SELECT COUNT(*) FROM web.document_study_progress WHERE document_id = $1) AS progress`,
          [document.id],
        )
      ).rows[0],
    ).toEqual({ documents: "0", chunks: "0", progress: "0" });
  } finally {
    await afterDelete.end();
  }
});

test("PostgreSQL records failed ingestion without orphan chunks", async ({
  context,
  baseURL,
}) => {
  const origin = baseURL!;
  await register(context, origin);
  const pool = database();
  const failureName = `failure-${crypto.randomUUID()}.md`;
  await pool.query(
    "DROP TRIGGER IF EXISTS verification_fail_ingestion ON web.document_chunks",
  );
  await pool.query(`CREATE OR REPLACE FUNCTION web.verification_fail_ingestion()
    RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.content LIKE '%force-pg-ingest-failure%' THEN
        RAISE EXCEPTION 'verification failure';
      END IF;
      RETURN NEW;
    END $$`);
  await pool.query(`CREATE TRIGGER verification_fail_ingestion
    BEFORE INSERT ON web.document_chunks FOR EACH ROW
    EXECUTE FUNCTION web.verification_fail_ingestion()`);
  try {
    const response = await context.request.post("/api/documents", {
      headers: { Origin: origin },
      multipart: {
        files: {
          name: failureName,
          mimeType: "text/markdown",
          buffer: Buffer.from(
            "# Failure\n\nforce-pg-ingest-failure must roll back chunks.",
          ),
        },
      },
    });
    expect(response.status()).toBe(422);
    const failed = await pool.query<{ id: string; ingestion_status: string }>(
      `SELECT id, ingestion_status FROM web.documents
       WHERE name = $1 ORDER BY created_at DESC LIMIT 1`,
      [failureName],
    );
    expect(failed.rows[0].ingestion_status).toBe("failed");
    expect(
      (
        await pool.query(
          "SELECT id FROM web.document_chunks WHERE document_id = $1",
          [failed.rows[0].id],
        )
      ).rowCount,
    ).toBe(0);
  } finally {
    await pool.query(
      "DROP TRIGGER IF EXISTS verification_fail_ingestion ON web.document_chunks",
    );
    await pool.query(
      "DROP FUNCTION IF EXISTS web.verification_fail_ingestion() ",
    );
    await pool.end();
  }
});

test("PostgreSQL rolls back a failed study-set transaction", async ({
  context,
  baseURL,
}) => {
  const origin = baseURL!;
  await register(context, origin);
  const pool = database();
  const failureName = `transaction-${crypto.randomUUID()}.md`;
  await pool.query(
    "DROP TRIGGER IF EXISTS verification_fail_document ON web.documents",
  );
  await pool.query(`CREATE OR REPLACE FUNCTION web.verification_fail_document()
    RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.name LIKE 'transaction-%' THEN
        RAISE EXCEPTION 'verification transaction failure';
      END IF;
      RETURN NEW;
    END $$`);
  await pool.query(`CREATE TRIGGER verification_fail_document
    BEFORE INSERT ON web.documents FOR EACH ROW
    EXECUTE FUNCTION web.verification_fail_document()`);
  try {
    const response = await context.request.post("/api/documents", {
      headers: { Origin: origin },
      multipart: {
        files: {
          name: failureName,
          mimeType: "text/markdown",
          buffer: Buffer.from("# Transaction failure\n\nNo partial metadata."),
        },
      },
    });
    expect(response.status()).toBe(503);
    expect(
      (
        await pool.query("SELECT id FROM web.documents WHERE name = $1", [
          failureName,
        ])
      ).rowCount,
    ).toBe(0);
  } finally {
    await pool.query(
      "DROP TRIGGER IF EXISTS verification_fail_document ON web.documents",
    );
    await pool.query(
      "DROP FUNCTION IF EXISTS web.verification_fail_document()",
    );
    await pool.end();
  }
});

test("PostgreSQL chat keeps history, citations and attempt fencing atomic", async ({
  context,
  browser,
  baseURL,
}) => {
  const origin = baseURL!;
  await register(context, origin);
  const document = await upload(
    context,
    origin,
    "lease.md",
    `${source}\nlease`,
  );
  const session = await createSession(context, origin, document.id);
  const requestId = crypto.randomUUID();
  const pool = database();
  try {
    const original = send(context, origin, session.id, document.id, requestId);
    await expect
      .poll(async () => {
        const result = await pool.query<{ generating_token: string | null }>(
          "SELECT generating_token FROM web.chat_sessions WHERE id = $1",
          [session.id],
        );
        return result.rows[0]?.generating_token;
      })
      .toBeTruthy();
    const oldToken = (
      await pool.query<{ generating_token: string }>(
        "SELECT generating_token FROM web.chat_sessions WHERE id = $1",
        [session.id],
      )
    ).rows[0].generating_token;
    await pool.query(
      "UPDATE web.chat_sessions SET generating_until = TIMESTAMPTZ 'epoch' WHERE id = $1",
      [session.id],
    );
    const replacement = send(
      context,
      origin,
      session.id,
      document.id,
      requestId,
    );
    await expect
      .poll(async () => {
        const result = await pool.query<{ generating_token: string | null }>(
          "SELECT generating_token FROM web.chat_sessions WHERE id = $1",
          [session.id],
        );
        return result.rows[0]?.generating_token;
      })
      .not.toBe(oldToken);
    expect((await original).status()).toBe(409);
    expect((await replacement).status()).toBe(201);

    const restored = await context.request.get(
      `/api/chat/sessions/${session.id}/messages`,
    );
    const messages = (await restored.json()).messages;
    expect(messages).toHaveLength(2);
    expect(messages[1].citations[0]).toMatchObject({
      document_id: document.id,
      heading: "Softmax",
    });
    const linked = await pool.query(
      `SELECT mc.id FROM web.message_citations mc
       JOIN web.chat_messages m ON m.id = mc.message_id
       JOIN web.document_chunks c ON c.id = mc.chunk_id
       WHERE m.session_id = $1 AND c.document_id = $2`,
      [session.id, document.id],
    );
    expect(linked.rowCount).toBeGreaterThan(0);

    const other = await browser.newContext({ baseURL: origin });
    try {
      await register(other, origin);
      expect(
        (
          await other.request.get(`/api/chat/sessions/${session.id}/messages`)
        ).status(),
      ).toBe(404);
    } finally {
      await other.close();
    }
  } finally {
    await pool.end();
  }
});

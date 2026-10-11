import "server-only";
import { randomUUID } from "node:crypto";
import {
  documentDatabase,
  DocumentError,
  findDocument,
} from "./document-store";
import type {
  ChatMessage,
  ChatSession,
  MessageCitation,
} from "./compass-chat-types";
import type { RetrievedChunk } from "./document-retriever";
import type { ChatPersistence } from "./persistence-contracts";
import {
  isWebPostgresConfigured,
  webPostgresPool,
  withWebPostgresTransaction,
} from "./web-database";
import type { PoolClient } from "pg";

async function authorizePostgresSession(
  client: PoolClient,
  owner: string,
  id: string,
) {
  const result = await client.query<ChatSession>(
    `SELECT s.id, s.study_set_id, s.title, s.created_at, s.updated_at
     FROM web.chat_sessions s
     JOIN web.documents d ON d.id = s.study_set_id AND d.owner = s.owner
     WHERE s.owner = $1 AND s.id = $2`,
    [owner, id],
  );
  const session = result.rows[0];
  if (!session) throw new DocumentError("not_found", 404);
  return session;
}

export async function authorizeSession(
  owner: string,
  id: string,
): Promise<ChatSession> {
  if (isWebPostgresConfigured()) {
    const client = await webPostgresPool().connect();
    try {
      return await authorizePostgresSession(client, owner, id);
    } finally {
      client.release();
    }
  }
  const session = documentDatabase()
    .prepare(
      `SELECT id, study_set_id, title, created_at, updated_at
    FROM chat_sessions WHERE owner = ? AND id = ?`,
    )
    .get(owner, id) as ChatSession | undefined;
  if (!session || !(await findDocument(owner, session.study_set_id, false)))
    throw new DocumentError("not_found", 404);
  return session;
}
export async function listChatSessions(
  owner: string,
  studySetId: string,
): Promise<ChatSession[]> {
  if (!(await findDocument(owner, studySetId, false)))
    throw new DocumentError("not_found", 404);
  if (isWebPostgresConfigured()) {
    const result = await webPostgresPool().query<ChatSession>(
      `SELECT id, study_set_id, title, created_at, updated_at
       FROM web.chat_sessions WHERE owner = $1 AND study_set_id = $2
       ORDER BY updated_at DESC, sequence DESC LIMIT 100`,
      [owner, studySetId],
    );
    return result.rows;
  }
  const rows = documentDatabase()
    .prepare(
      `SELECT id, study_set_id, title, created_at, updated_at FROM chat_sessions
    WHERE owner = ? AND study_set_id = ? ORDER BY updated_at DESC, rowid DESC LIMIT 100`,
    )
    .all(owner, studySetId) as ChatSession[];
  // Node SQLite rows have null prototypes; React Server Components require plain objects.
  return rows.map((row) => ({ ...row }));
}
export async function createChatSession(
  owner: string,
  studySetId: string,
): Promise<ChatSession> {
  if (!(await findDocument(owner, studySetId, false)))
    throw new DocumentError("not_found", 404);
  const now = new Date().toISOString();
  const session = {
    id: randomUUID(),
    study_set_id: studySetId,
    title: "Cuộc trò chuyện mới",
    created_at: now,
    updated_at: now,
  };
  if (isWebPostgresConfigured()) {
    await webPostgresPool().query(
      `INSERT INTO web.chat_sessions
       (id, study_set_id, owner, title, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [session.id, studySetId, owner, session.title, now, now],
    );
    return session;
  }
  documentDatabase()
    .prepare(
      `INSERT INTO chat_sessions (id, study_set_id, owner, title, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(session.id, studySetId, owner, session.title, now, now);
  return session;
}
export async function getChatMessages(
  owner: string,
  sessionId: string,
): Promise<ChatMessage[]> {
  const session = await authorizeSession(owner, sessionId);
  if (isWebPostgresConfigured()) {
    const messages = await webPostgresPool().query<
      Omit<ChatMessage, "citations">
    >(
      `SELECT id, role, content, created_at, request_id, status
       FROM web.chat_messages WHERE session_id = $1 ORDER BY sequence`,
      [sessionId],
    );
    const citations = await webPostgresPool().query<
      MessageCitation & { message_id: string }
    >(
      `SELECT mc.message_id, mc.citation_index AS "index", c.id AS chunk_id,
       c.document_id, d.name AS filename, c.heading, c.page_number,
       left(c.content, 500) AS excerpt, c.start_offset, c.end_offset
       FROM web.message_citations mc
       JOIN web.chat_messages m ON m.id = mc.message_id
       JOIN web.document_chunks c ON c.id = mc.chunk_id
       JOIN web.documents d ON d.id = c.document_id
       WHERE m.session_id = $1 AND d.owner = $2 AND d.id = $3
       ORDER BY mc.citation_index`,
      [sessionId, owner, session.study_set_id],
    );
    return attachCitations(messages.rows, citations.rows);
  }
  const db = documentDatabase();
  const messages = db
    .prepare(
      "SELECT id, role, content, created_at, request_id, status FROM chat_messages WHERE session_id = ? ORDER BY rowid",
    )
    .all(sessionId) as Omit<ChatMessage, "citations">[];
  const citations = db
    .prepare(
      `SELECT mc.message_id, mc.citation_index AS 'index', c.id AS chunk_id,
    c.document_id, d.name AS filename, c.heading, c.page_number, substr(c.content, 1, 500) AS excerpt,
    c.start_offset, c.end_offset FROM message_citations mc
    JOIN chat_messages m ON m.id = mc.message_id JOIN document_chunks c ON c.id = mc.chunk_id
    JOIN documents d ON d.id = c.document_id WHERE m.session_id = ? AND d.owner = ? AND d.id = ?
    ORDER BY mc.citation_index`,
    )
    .all(sessionId, owner, session.study_set_id) as (MessageCitation & {
    message_id: string;
  })[];
  return attachCitations(messages, citations);
}

function attachCitations(
  messages: Omit<ChatMessage, "citations">[],
  citations: (MessageCitation & { message_id: string })[],
) {
  const byMessage = new Map<string, MessageCitation[]>();
  for (const { message_id, ...citation } of citations) {
    const sources = byMessage.get(message_id) ?? [];
    sources.push(citation);
    byMessage.set(message_id, sources);
  }
  return messages.map((message) => ({
    ...message,
    citations: byMessage.get(message.id) ?? [],
  }));
}

export async function beginTurn(
  owner: string,
  sessionId: string,
  requestId: string,
  content: string,
) {
  if (isWebPostgresConfigured()) {
    return withWebPostgresTransaction(async (client) => {
      const session = await authorizePostgresSession(client, owner, sessionId);
      const previous = await client.query<{ content: string }>(
        `SELECT content FROM web.chat_messages
         WHERE session_id = $1 AND request_id = $2 AND role = 'user'`,
        [sessionId, requestId],
      );
      if (previous.rows[0] && previous.rows[0].content !== content)
        throw new DocumentError("request_conflict", 409);
      const completed = await client.query(
        `SELECT id FROM web.chat_messages
         WHERE session_id = $1 AND request_id = $2 AND role = 'assistant'`,
        [sessionId, requestId],
      );
      if (completed.rowCount) return { session, completed: true, token: "" };

      const token = randomUUID();
      const lock = await client.query(
        `UPDATE web.chat_sessions SET
           generating_until = now() + interval '120 seconds',
           generating_request = $1, generating_token = $2
         WHERE id = $3 AND owner = $4 AND generating_until < now()
         RETURNING id`,
        [requestId, token, sessionId, owner],
      );
      if (!lock.rowCount) throw new DocumentError("already_generating", 409);
      await client.query(
        `UPDATE web.chat_messages SET status = 'failed'
         WHERE session_id = $1 AND role = 'user' AND status = 'pending'`,
        [sessionId],
      );
      const now = new Date().toISOString();
      await client.query(
        `INSERT INTO web.chat_messages
         (id, session_id, role, content, created_at, request_id, status)
         VALUES ($1, $2, 'user', $3, $4, $5, 'pending')
         ON CONFLICT (session_id, request_id, role)
         DO UPDATE SET status = 'pending'`,
        [randomUUID(), sessionId, content, now, requestId],
      );
      const title =
        session.title === "Cuộc trò chuyện mới"
          ? content.slice(0, 60)
          : session.title;
      await client.query(
        "UPDATE web.chat_sessions SET title = $1, updated_at = $2 WHERE id = $3",
        [title, now, sessionId],
      );
      return { session, completed: false, token };
    });
  }
  const session = await authorizeSession(owner, sessionId);
  const db = documentDatabase();
  db.exec("BEGIN IMMEDIATE");
  try {
    const previous = db
      .prepare(
        "SELECT content FROM chat_messages WHERE session_id = ? AND request_id = ? AND role = 'user'",
      )
      .get(sessionId, requestId) as { content: string } | undefined;
    if (previous && previous.content !== content)
      throw new DocumentError("request_conflict", 409);
    const completed = db
      .prepare(
        "SELECT id FROM chat_messages WHERE session_id = ? AND request_id = ? AND role = 'assistant'",
      )
      .get(sessionId, requestId);
    if (completed) {
      db.exec("COMMIT");
      return { session, completed: true, token: "" };
    }
    const token = randomUUID();
    const lock = db
      .prepare(
        `UPDATE chat_sessions SET generating_until = ?, generating_request = ?, generating_token = ?
      WHERE id = ? AND owner = ? AND generating_until < ?`,
      )
      .run(
        Date.now() + 120_000,
        requestId,
        token,
        sessionId,
        owner,
        Date.now(),
      );
    if (!lock.changes) throw new DocumentError("already_generating", 409);
    // Recover an abandoned pending turn. Retrying the same request reuses its user message.
    db.prepare(
      "UPDATE chat_messages SET status = 'failed' WHERE session_id = ? AND role = 'user' AND status = 'pending'",
    ).run(sessionId);
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO chat_messages (id, session_id, role, content, created_at, request_id, status)
      VALUES (?, ?, 'user', ?, ?, ?, 'pending') ON CONFLICT(session_id, request_id, role) DO UPDATE SET status = 'pending'`,
    ).run(randomUUID(), sessionId, content, now, requestId);
    const title =
      session.title === "Cuộc trò chuyện mới"
        ? content.slice(0, 60)
        : session.title;
    db.prepare(
      "UPDATE chat_sessions SET title = ?, updated_at = ? WHERE id = ?",
    ).run(title, now, sessionId);
    db.exec("COMMIT");
    return { session, completed: false, token };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
export async function failTurn(
  sessionId: string,
  requestId: string,
  token: string,
) {
  if (isWebPostgresConfigured()) {
    await withWebPostgresTransaction(async (client) => {
      const lock = await client.query(
        `UPDATE web.chat_sessions SET generating_until = TIMESTAMPTZ 'epoch',
         generating_request = NULL, generating_token = NULL
         WHERE id = $1 AND generating_request = $2 AND generating_token = $3
         RETURNING id`,
        [sessionId, requestId, token],
      );
      if (lock.rowCount)
        await client.query(
          `UPDATE web.chat_messages SET status = 'failed'
           WHERE session_id = $1 AND request_id = $2
             AND role = 'user' AND status = 'pending'`,
          [sessionId, requestId],
        );
    });
    return;
  }
  const db = documentDatabase();
  db.exec("BEGIN IMMEDIATE");
  try {
    const lock = db
      .prepare(
        "UPDATE chat_sessions SET generating_until = 0, generating_request = NULL, generating_token = NULL WHERE id = ? AND generating_request = ? AND generating_token = ?",
      )
      .run(sessionId, requestId, token);
    if (lock.changes)
      db.prepare(
        "UPDATE chat_messages SET status = 'failed' WHERE session_id = ? AND request_id = ? AND role = 'user' AND status = 'pending'",
      ).run(sessionId, requestId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
export async function finishTurn(
  owner: string,
  sessionId: string,
  requestId: string,
  token: string,
  answer: string,
  status: "answered" | "abstained",
  chunks: RetrievedChunk[],
) {
  if (isWebPostgresConfigured()) {
    await withWebPostgresTransaction(async (client) => {
      const session = await authorizePostgresSession(client, owner, sessionId);
      const now = new Date().toISOString();
      const lock = await client.query(
        `UPDATE web.chat_sessions SET generating_until = TIMESTAMPTZ 'epoch',
         generating_request = NULL, generating_token = NULL, updated_at = $1
         WHERE id = $2 AND generating_request = $3 AND generating_token = $4
           AND generating_until >= now() RETURNING id`,
        [now, sessionId, requestId, token],
      );
      if (!lock.rowCount) throw new DocumentError("request_expired", 409);
      const messageId = randomUUID();
      await client.query(
        `INSERT INTO web.chat_messages
         (id, session_id, role, content, created_at, request_id, status)
         VALUES ($1, $2, 'assistant', $3, $4, $5, $6)`,
        [messageId, sessionId, answer, now, requestId, status],
      );
      for (const [index, chunk] of chunks.entries()) {
        const source = await client.query(
          `SELECT c.id FROM web.document_chunks c
           JOIN web.documents d ON d.id = c.document_id
           WHERE c.id = $1 AND d.owner = $2 AND d.id = $3`,
          [chunk.chunk_id, owner, session.study_set_id],
        );
        if (!source.rowCount) throw new DocumentError("invalid_citations", 502);
        await client.query(
          `INSERT INTO web.message_citations
           (id, message_id, chunk_id, citation_index)
           VALUES ($1, $2, $3, $4)`,
          [randomUUID(), messageId, chunk.chunk_id, index + 1],
        );
      }
      await client.query(
        `UPDATE web.chat_messages SET status = 'answered'
         WHERE session_id = $1 AND request_id = $2 AND role = 'user'`,
        [sessionId, requestId],
      );
    });
    return;
  }
  const session = await authorizeSession(owner, sessionId);
  const db = documentDatabase();
  db.exec("BEGIN IMMEDIATE");
  try {
    const lock = db
      .prepare(
        "UPDATE chat_sessions SET generating_until = 0, generating_request = NULL, generating_token = NULL, updated_at = ? WHERE id = ? AND generating_request = ? AND generating_token = ? AND generating_until >= ?",
      )
      .run(new Date().toISOString(), sessionId, requestId, token, Date.now());
    if (!lock.changes) throw new DocumentError("request_expired", 409);
    const messageId = randomUUID();
    db.prepare(
      "INSERT INTO chat_messages VALUES (?, ?, 'assistant', ?, ?, ?, ?)",
    ).run(
      messageId,
      sessionId,
      answer,
      new Date().toISOString(),
      requestId,
      status,
    );
    for (const [i, chunk] of chunks.entries()) {
      // Enforce the real FK and ownership again at persistence, not only retrieval.
      const source = db
        .prepare(
          `SELECT c.id FROM document_chunks c JOIN documents d ON d.id = c.document_id
        WHERE c.id = ? AND d.owner = ? AND d.id = ?`,
        )
        .get(chunk.chunk_id, owner, session.study_set_id);
      if (!source) throw new DocumentError("invalid_citations", 502);
      db.prepare("INSERT INTO message_citations VALUES (?, ?, ?, ?)").run(
        randomUUID(),
        messageId,
        chunk.chunk_id,
        i + 1,
      );
    }
    db.prepare(
      "UPDATE chat_messages SET status = 'answered' WHERE session_id = ? AND request_id = ? AND role = 'user'",
    ).run(sessionId, requestId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export const chatPersistence = {
  authorizeSession,
  listSessions: listChatSessions,
  createSession: createChatSession,
  getMessages: getChatMessages,
} satisfies ChatPersistence;

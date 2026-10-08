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

export function authorizeSession(owner: string, id: string): ChatSession {
  const session = documentDatabase()
    .prepare(
      `SELECT id, study_set_id, title, created_at, updated_at
    FROM chat_sessions WHERE owner = ? AND id = ?`,
    )
    .get(owner, id) as ChatSession | undefined;
  if (!session || !findDocument(owner, session.study_set_id, false))
    throw new DocumentError("not_found", 404);
  return session;
}
export function listChatSessions(
  owner: string,
  studySetId: string,
): ChatSession[] {
  if (!findDocument(owner, studySetId, false))
    throw new DocumentError("not_found", 404);
  const rows = documentDatabase()
    .prepare(
      `SELECT id, study_set_id, title, created_at, updated_at FROM chat_sessions
    WHERE owner = ? AND study_set_id = ? ORDER BY updated_at DESC, rowid DESC LIMIT 100`,
    )
    .all(owner, studySetId) as ChatSession[];
  // Node SQLite rows have null prototypes; React Server Components require plain objects.
  return rows.map((row) => ({ ...row }));
}
export function createChatSession(
  owner: string,
  studySetId: string,
): ChatSession {
  if (!findDocument(owner, studySetId, false))
    throw new DocumentError("not_found", 404);
  const now = new Date().toISOString();
  const session = {
    id: randomUUID(),
    study_set_id: studySetId,
    title: "Cuộc trò chuyện mới",
    created_at: now,
    updated_at: now,
  };
  documentDatabase()
    .prepare(
      `INSERT INTO chat_sessions (id, study_set_id, owner, title, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(session.id, studySetId, owner, session.title, now, now);
  return session;
}
export function getChatMessages(
  owner: string,
  sessionId: string,
): ChatMessage[] {
  const session = authorizeSession(owner, sessionId);
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

export function beginTurn(
  owner: string,
  sessionId: string,
  requestId: string,
  content: string,
) {
  const session = authorizeSession(owner, sessionId);
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
export function failTurn(sessionId: string, requestId: string, token: string) {
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
export function finishTurn(
  owner: string,
  sessionId: string,
  requestId: string,
  token: string,
  answer: string,
  status: "answered" | "abstained",
  chunks: RetrievedChunk[],
) {
  const session = authorizeSession(owner, sessionId);
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

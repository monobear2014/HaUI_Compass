import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { chunkText } from "../document-chunks";
import { migrateAttemptFencing } from "./003-compass-attempt-fencing";
import { migrateTurnFencing } from "./002-compass-turn-fencing";

export function ingestDocument(
  db: DatabaseSync,
  document: { id: string; name: string; kind: string; content: Uint8Array },
) {
  if (
    db
      .prepare("SELECT ingestion_status FROM documents WHERE id = ?")
      .get(document.id)?.ingestion_status === "ready"
  )
    return;
  if (document.kind === "pdf") {
    db.prepare(
      "UPDATE documents SET ingestion_status = 'unsupported' WHERE id = ?",
    ).run(document.id);
    return;
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(
    document.content,
  );
  const chunks = chunkText(text, /\.(md|markdown)$/i.test(document.name));
  db.prepare("DELETE FROM document_chunks WHERE document_id = ?").run(
    document.id,
  );
  const insert = db.prepare(`INSERT INTO document_chunks
    (id, document_id, content, chunk_index, heading, start_offset, end_offset, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const chunk of chunks)
    insert.run(
      randomUUID(),
      document.id,
      chunk.content,
      chunk.chunk_index,
      chunk.heading,
      chunk.start_offset,
      chunk.end_offset,
      new Date().toISOString(),
    );
  db.prepare(
    "UPDATE documents SET ingestion_status = 'ready' WHERE id = ?",
  ).run(document.id);
}

// Versioned migration for the existing Next.js document database (not the unrelated
// PostgreSQL planning database). Atomic and idempotent across restarts/processes.
export function migrateCompassChat(db: DatabaseSync) {
  migrateChatTables(db);
  migrateTurnFencing(db);
  migrateAttemptFencing(db);
}

function migrateChatTables(db: DatabaseSync) {
  db.exec(
    "PRAGMA foreign_keys = ON; CREATE TABLE IF NOT EXISTS document_schema_migrations (version INTEGER PRIMARY KEY);",
  );
  db.exec("BEGIN IMMEDIATE");
  try {
    if (
      db
        .prepare(
          "SELECT version FROM document_schema_migrations WHERE version = 1",
        )
        .get()
    ) {
      db.exec("COMMIT");
      return;
    }
    db.exec(`ALTER TABLE documents ADD COLUMN ingestion_status TEXT NOT NULL DEFAULT 'pending';
      CREATE TABLE document_chunks (
        id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES documents(id),
        content TEXT NOT NULL, chunk_index INTEGER NOT NULL, heading TEXT,
        start_offset INTEGER NOT NULL, end_offset INTEGER NOT NULL, created_at TEXT NOT NULL,
        UNIQUE(document_id, chunk_index)
      );
      CREATE TABLE chat_sessions (
        id TEXT PRIMARY KEY, study_set_id TEXT NOT NULL REFERENCES documents(id), owner TEXT NOT NULL,
        title TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        generating_until INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX chat_sessions_owner_set ON chat_sessions(owner, study_set_id, updated_at);
      CREATE TABLE chat_messages (
        id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES chat_sessions(id),
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant')), content TEXT NOT NULL,
        created_at TEXT NOT NULL, request_id TEXT NOT NULL, status TEXT NOT NULL,
        UNIQUE(session_id, request_id, role)
      );
      CREATE TABLE message_citations (
        id TEXT PRIMARY KEY, message_id TEXT NOT NULL REFERENCES chat_messages(id),
        chunk_id TEXT NOT NULL REFERENCES document_chunks(id), citation_index INTEGER NOT NULL,
        UNIQUE(message_id, citation_index)
      );`);
    const documents = db
      .prepare("SELECT id, name, kind, content FROM documents ORDER BY id")
      .all() as {
      id: string;
      name: string;
      kind: string;
      content: Uint8Array;
    }[];
    for (const document of documents) {
      try {
        ingestDocument(db, document);
      } catch {
        db.prepare("DELETE FROM document_chunks WHERE document_id = ?").run(
          document.id,
        );
        db.prepare(
          "UPDATE documents SET ingestion_status = 'failed' WHERE id = ?",
        ).run(document.id);
        console.error("Compass ingestion backfill failed", {
          documentId: document.id,
        });
      }
    }
    db.prepare("INSERT INTO document_schema_migrations VALUES (1)").run();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

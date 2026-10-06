import type { DatabaseSync } from "node:sqlite";

// A generation lease is fenced by request ID so an expired worker cannot commit
// over a newer turn. Kept as a separate migration for already-running workspaces.
export function migrateTurnFencing(db: DatabaseSync) {
  db.exec("BEGIN IMMEDIATE");
  try {
    if (
      !db
        .prepare(
          "SELECT version FROM document_schema_migrations WHERE version = 2",
        )
        .get()
    ) {
      db.exec("ALTER TABLE chat_sessions ADD COLUMN generating_request TEXT");
      db.prepare("INSERT INTO document_schema_migrations VALUES (2)").run();
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

import type { DatabaseSync } from "node:sqlite";

// Every lease acquisition needs a distinct token, even when retrying the same request.
export function migrateAttemptFencing(db: DatabaseSync) {
  db.exec("BEGIN IMMEDIATE");
  try {
    if (
      !db
        .prepare(
          "SELECT version FROM document_schema_migrations WHERE version = 3",
        )
        .get()
    ) {
      db.exec("ALTER TABLE chat_sessions ADD COLUMN generating_token TEXT");
      db.prepare("INSERT INTO document_schema_migrations VALUES (3)").run();
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

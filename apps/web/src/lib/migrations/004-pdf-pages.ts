import type { DatabaseSync } from "node:sqlite";

export function migratePdfPages(db: DatabaseSync) {
  db.exec("BEGIN IMMEDIATE");
  try {
    if (
      !db
        .prepare(
          "SELECT version FROM document_schema_migrations WHERE version = 4",
        )
        .get()
    ) {
      db.exec(
        "ALTER TABLE document_chunks ADD COLUMN page_number INTEGER CHECK(page_number > 0 AND page_number <= 200); INSERT INTO document_schema_migrations VALUES (4);",
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
